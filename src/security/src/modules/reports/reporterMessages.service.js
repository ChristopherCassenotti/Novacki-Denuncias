const { randomUUID } = require('node:crypto');
const prisma = require('../../database/prisma');
const { encryptJson, decryptJson } = require('../../security/crypto.service');

function createServiceError(message, statusCode){
    const error = new Error(message);
    error.statusCode = statusCode;

    return error;
}

async function findReportOrFail(database, reportId) {
    const report = await database.reports.findUnique({
        where:{
            id: reportId,
        },
        select:{
            id: true,
            status: true,
        }
    });

    if(!report){
        throw createServiceError('Denúncia não encontrada.', 404);
    }

    return report;
}

function deserializeMessage(message){
    const decrypted = decryptJson({
        ciphertext: message.body_ciphertext,
        iv: message.body_iv,
        authTag: message.body_auth_tag,
        keyVersion: message.encryption_key_version,
    },

    'REPORT_MESSAGE'
    );

    return {
        id: message.id,
        senderType: message.sender_type,
        type: message.type,
        body: decrypted.body,
        requiresResponse: message.requires_response,
        reporterReadAt: message.reporter_read_at,
        createdAt: message.created_at,
    };
}

async function listReporterMessages(reportId) {
    await findReportOrFail(prisma, reportId);

    const messages = await prisma.report_messages.findMany({
        where:{
            report_id: reportId,
        },
        select:{
            id:true,
            sender_type: true,
            type: true,

            body_ciphertext: true,
            body_iv: true,
            body_auth_tag: true,
            encryption_key_version: true,

            requires_response: true,
            reporter_read_at: true,
            created_at: true,
        },

        orderBy:{
            created_at: 'asc',
        },
    });

    const unreadIds = 
        messages.filter(
            (message) => 
                message.sender_type !== 
                    'REPORTER' && 
                message.reporter_read_at === 
                    null
            )
            .map((message) => message.id);

    const now = new Date();

    if(unreadIds.length > 0){
        await prisma.report_messages.updateMany({
            where:{
                id:{
                    in: unreadIds,
                },

                reporter_read_at: null,
            },

            data:{
                reporter_read_at: now,
            },
        });

        for(const message of messages){
            if(unreadIds.includes(message.id)){
                message.reporter_read_at = now;
            }
        }
    }

    return messages.map(deserializeMessage);
}

async function createReporterMessage(reportId, body) {
    const report = await findReportOrFail(prisma, reportId);

    if(report.status === 'ARCHIVED'){
        throw createServiceError('Esta denúncia está arquivada e não aceita novas mensagens.', 409);
    }

    const messageId = randomUUID();

    const encryptedBody = encryptJson(
        {
            body,
        },
        'REPORT_MESSAGE'
    );

    const now = new Date();

    await prisma.$transaction(
        async (tx) => {
            await tx.report_messages.create({
                data:{
                    id: messageId,
                    report_id: reportId,
                    sender_type: 'REPORTER',
                    sender_user_id: null,
                    type: 'COMPLEMENT',
                    body_ciphertext: encryptedBody.ciphertext,
                    body_iv: encryptedBody.iv,
                    body_auth_tag: encryptedBody.authTag,
                    encryption_key_version: encryptedBody.keyVersion,
                    requires_response: false,
                    reporter_read_at: now,
                    admin_read_at: null,
                },
            });

            await tx.reports.update({
                where:{
                    id: reportId,
                },
                data:{
                    last_activity_at: now,
                },
            });

            await tx.report_events.create({
                data:{
                    id: randomUUID(),
                    report_id: reportId,
                    event_type: 'INFORMATION_RECEIVED',
                    actor_type: 'REPORTER',
                    actor_user_id: null,
                },
            });
        }
    );

    const message = await prisma.report_messages.findUnique({
        where:{
            id: messageId,
        },
        select:{
            id: true,
            sender_type: true,
            type: true,
            
            body_ciphertext: true,
            body_iv: true,
            body_auth_tag: true,
            encryption_key_version: true,

            requires_response: true,
            reporter_read_at: true,
            created_at: true,
        }
    });

    return deserializeMessage(message);
}

module.exports = {listReporterMessages, createReporterMessage};
