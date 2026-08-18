const { randomUUID } = require('node:crypto');
const prisma = require('../../database/prisma');
const { encryptJson, decryptJson } = require('../../security/crypto.service');

function createServiceError(message, statusCode){
    const error = new Error(message);
    error.statusCode = statusCode;

    return error;
}

function auditMetadata(data){
    return JSON.stringify(data);
}

async function findReportOrFail(database, reportId) {
    const report = await database.reports.findUnique({
        where:{
            id: reportId,
        },

        select: {
            id: true,
            status: true,
        },
    });

    if(!report){
        throw createServiceError('Denúncia não encontrada.', 404);
    }

    return report;
}

function decryptMessage(message){
    const decrypted = decryptJson({
        ciphertext: message.body_ciphertext,
        iv: message.body_iv,
        authTag: message.body_auth_tag,
        keyVersion: message.encryption_key_version,
    },
    'REPORT_MESSAGE'    
    );

    return decrypted.body;
}

async function listAdminMessages(reportId) {
    await findReportOrFail(prisma, reportId);

    const messages = await prisma.report_messages.findMany({
        where:{
            report_id: reportId,
        },

        select:{
        id: true,
        sender_type: true,
        sender_user_id: true,
        type: true,

        body_ciphertext: true,
        body_iv: true,
        body_auth_tag: true,
        encryption_key_version: true,

        requires_response: true,

        reporter_read_at: true,
        admin_read_at: true,

        created_at: true,
      },

      orderBy: {
        created_at:
          "asc",
      },
    });

    const unreadReporterMessageIds = 
        messages.filter(
            (message) => message.sender_type ===
                'REPORTER' &&
            message.admin_read_at === null
        )
        .map((message) => message.id);

    const now = new Date();

    if(unreadReporterMessageIds.length > 0){
        await prisma.report_messages.updateMany({
            where:{
                id: {
                    in: unreadReporterMessageIds,
                },
                
            admin_read_at: null,
            },
            
            data:{
                admin_read_at: now,
            }
        });

        for(const message of messages){
            if(unreadReporterMessageIds.includes(message.id)){
                message.admin_read_at = now;
            }
        }
    }

    const senderUserIds = [
        ...new Set(messages.map((message) => message.sender_user_id).filter(Boolean))
    ];

    const users = 
        senderUserIds.length
            ? await prisma.users.findMany({
                where:{
                    id:{in: senderUserIds}
                },
                select:{
                    id: true,
                    name: true,
                },
            }) : [];
    
    const usersMap = new Map(users.map((user) => [user.id, user]));

    return messages.map(
      (message) => ({
        id:
          message.id,   
        senderType:
          message.sender_type,  
        sender:
          message.sender_user_id
            ? usersMap.get(
                message.sender_user_id
              ) || null
            : null, 
        type:
          message.type, 
        body:
          decryptMessage(
            message
          ),    
        requiresResponse:
          message.requires_response,    
        reporterReadAt:
          message.reporter_read_at, 
        adminReadAt:
          message.admin_read_at,    
        createdAt:
          message.created_at,
      })
    );
}

async function createAdminMessage(reportId, {type, body}, actorUserId) {
    const report = await findReportOrFail(prisma, reportId);

    if(report.status === 'ARCHIVED'){
        throw createServiceError('Não é possível enviar messagens para uma denúncia arquivada.', 409);
    }

    const encryptedBody = encryptJson(
    {
        body,
    },
    'REPORT_MESSAGE'
    );

    const requiresResponse = type === 'QUESTION';

    const eventType = requiresResponse ? 'INFORMATION_REQUESTED' : 'MESSAGE_SENT';

    const messageId = randomUUID();

    const now = new Date();

    await prisma.$transaction( async (tx) => {
        await tx.report_messages.create({
            data:{
                id: messageId,
                report_id: reportId,
                sender_type: 'ADMIN',
                sender_user_id: actorUserId,  
                type,   
                body_ciphertext: encryptedBody.ciphertext, 
                body_iv: encryptedBody.iv, 
                body_auth_tag: encryptedBody.authTag,    
                encryption_key_version: encryptedBody.keyVersion, 
                requires_response: requiresResponse, 
                admin_read_at: now,  
                reporter_read_at: null,
            }
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
            data: {
              id:
                randomUUID(),

              report_id:
                reportId,

              event_type:
                eventType,

              actor_type:
                "ADMIN",

              actor_user_id:
                actorUserId,
            },
        });

        await tx.audit_logs.create({
            data:{
                actor_type: 'ADMIN',
                actor_user_id: actorUserId,
                action: 'REPORT_MESSAGE_SENT',
                entity_type: 'REPORT',
                entity_id: reportId,
                success: true,
                request_id: randomUUID(),
                metadata_json: auditMetadata({
                    messageId,
                    messageType: type,
                }),
            },
        });
    });

    const message = await prisma.report_messages.findUnique({
        where:{
            id: messageId,
        },
        select:{
            id: true,
            sender_type: true,
            sender_user_id: true,
            type: true,

            body_ciphertext: true,
            body_iv: true,
            body_auth_tag: true,
            encryption_key_version: true,

            requires_response: true,
            reporter_read_at: true,
            admin_read_at: true,
            created_at: true,
        },
    });

    return {
        id: message.id,
        senderType: message.sender_type,
        senderUserId: message.sender_user_id,
        type: message.type,
        body: decryptMessage(message),
        requiresResponse: message.requires_response,
        reporterReadAt: message.reporter_read_at,
        adminReadAt: message.admin_read_at,
        createdAt: message.created_at,
    };
}

module.exports = { listAdminMessages, createAdminMessage };
