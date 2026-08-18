const { randomUUID } = require('node:crypto');
const { encryptJson } = require('../../security/crypto.service');
const { generateReportAccessSecret, hashReportAccessSecret } = require('./reportAccess.service');
const { generateReportProtocol } = require('./reportProtocol.service');

const prisma = require('../../database/prisma');

function createServiceError(message, statusCode){
    const error = new Error(message);

    error.statusCode = statusCode;

    return error;
}

async function getCategoryOrFail(categoryId) {
    const category = await prisma.report_categories.findUnique({
        where:{
            id: categoryId,
        },
        select:{
            id: true,
            code: true,
            name: true,
            default_priority: true,
            is_active: true,
        },
    });

    if(!category || !category.is_active){
        throw createServiceError('Categoria inválida ou indisponível.', 400);
    }

    return category;
}

async function validateUnit(unitId) {
    if(!unitId){
        return null;
    }
    
    const unit = await prisma.units.findUnique({
        where:{
            id: unitId,
        },
        select:{
            id: true,
            is_active: true,
        },
    });

    if(!unit || !unit.is_active){
        throw createServiceError('Unidade inválida ou indisponível.', 400);
    }

    return unit.id;
}

function getReportPriority(category, immediateRisk){
    if(immediateRisk){
        return 'CRITICAL';
    }

    return(category.default_priority || 'NORMAL');
}

function buildIdentityPayload(identity){
    if(!identity){
        return null;
    }

    return {
        name: identity.name || null,
        email: identity.email || null,
        phone: identity.phone || null,
    };
}

async function persistReport({reportId, protocol, accessSecretHash, data, category, unitId, encryptedContent, encryptedIdentity}) {
    const priority = getReportPriority(category, data.immediateRisk);

    return prisma.$transaction(async (tx) => {
        const report =
            await tx.reports.create({
                data:{
                    id: reportId,
                    protocol,
                    mode: data.mode,
                    relationship_type: data.relationshipType,
                    unit_id: unitId,
                    category_id: category.id,
                    immediate_risk: data.immediateRisk,
                    priority,
                    status: 'RECEIVED',
                    content_ciphertext: encryptedContent.ciphertext,
                    content_iv: encryptedContent.iv,
                    content_auth_tag: encryptedContent.authTag,
                    encryption_key_version: encryptedContent.keyVersion,
                },

                select:{
                    id: true,
                    protocol: true,
                    status: true,
                    priority: true,
                    created_at: true,
                },
            });

            if(data.mode === 'IDENTIFIED' && encryptedIdentity){
                await tx.report_identities.create({
                    data:{
                        id: randomUUID(),
                        report_id: reportId,
                        identity_ciphertext: encryptedIdentity.ciphertext,
                        identity_iv: encryptedIdentity.iv,
                        identity_auth_tag: encryptedIdentity.authTag,
                        encryption_key_version: encryptedIdentity.keyVersion,
                        consent_to_contact: data.identity?.consentToContact ?? false,
                    }
                });
            }

            await tx.report_access_credentials.create({
                data:{
                    id: randomUUID(),
                    report_id: reportId,
                    secret_hash: accessSecretHash,
                    failed_attempts: 0,
                },
            });


            await tx.report_events.create({
                data:{
                    id: randomUUID(),
                    report_id: reportId,
                    event_type: 'REPORT_CREATED',
                    actor_type: 'REPORTER',
                    actor_user_id: null,
                    previous_status: null,
                    new_status: 'RECEIVED',
                },
            });

            return report;
    },
    {
        maxWait: 5000,
        timeout: 10000,
    }
    );
}

async function createPublicReport(data) {
    const [category, unitId] = await Promise.all([
        getCategoryOrFail(data.categoryId),

        validateUnit(data.unitId),
    ]);

    const encryptedContent = encryptJson(data.content, 'REPORT_CONTENT');

    let encryptedIdentity = null;

    if(data.mode === 'IDENTIFIED'){
        const identityPayload = buildIdentityPayload(data.identity);

        encryptedIdentity = encryptJson(identityPayload, 'REPORT_IDENTITY');
    }
    
    const accessSecret = generateReportAccessSecret();

    const accessSecretHash = hashReportAccessSecret(accessSecret);

    const reportId = randomUUID();

    const MAX_PROTOCOL_ATTEMPTS = 5;

    for(let attempt = 1; attempt <= MAX_PROTOCOL_ATTEMPTS; attempt++){
        const protocol = generateReportProtocol();

        try{
            const report = await persistReport({
                reportId,
                protocol,
                accessSecretHash,
                data,
                category,
                unitId,
                encryptedContent,
                encryptedIdentity,
            });
            
            return {
                reportId: report.id,
                protocol: report.protocol,
                accessSecret,
                createdAt: report.created_at,
            };
        }
        catch(error){
            if(error.code === 'P2002' && attempt < MAX_PROTOCOL_ATTEMPTS){
                continue;
            }

            throw error;
        }
    }

    throw createServiceError('Não foi possível gerar um protocolo único.', 500);
}

module.exports = { createPublicReport };
