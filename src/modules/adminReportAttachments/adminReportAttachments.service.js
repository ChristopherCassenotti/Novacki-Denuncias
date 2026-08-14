const {
    randomUUID,
    createHash,
} = require("node:crypto");

const prisma =
    require("../../database/prisma");

const {
    encryptJson,
    decryptJson,
} = require(
    "../../security/crypto.service"
);

const {
    uploadObject,
    deleteObject,
} = require(
    "../../storage/r2"
);

function createServiceError(
    message,
    statusCode
) {
    const error =
        new Error(message);

    error.statusCode =
        statusCode;

    return error;
}

function auditMetadata(
    data
) {
    return JSON.stringify(
        data
    );
}

async function findReportOrFail(
    database,
    reportId
) {
    const report =
        await database.reports.findUnique({
            where: {
                id:
                    reportId,
            },

            select: {
                id: true,
                protocol: true,
                status: true,
            },
        });

    if (!report) {
        throw createServiceError(
            "Denúncia não encontrada.",
            404
        );
    }

    return report;
}

function decryptOriginalName(
    attachment
) {
    const decrypted =
        decryptJson(
            {
                ciphertext:
                    attachment
                        .original_name_ciphertext,

                iv:
                    attachment
                        .original_name_iv,

                authTag:
                    attachment
                        .original_name_auth_tag,

                keyVersion:
                    attachment
                        .original_name_key_version,
            },
            "ATTACHMENT_ORIGINAL_NAME"
        );

    return (
        decrypted.name ??
        "arquivo"
    );
}

function serializeAttachment(
    attachment
) {
    return {
        id:
            attachment.id,

        originalName:
            decryptOriginalName(
                attachment
            ),

        mimeType:
            attachment.mime_type,

        sizeBytes:
            Number(
                attachment.size_bytes
            ),

        sha256:
            attachment.sha256,

        visibility:
            attachment.visibility,

        uploadedByType:
            attachment.uploaded_by_type,

        uploadedByUserId:
            attachment.uploaded_by_user_id,

        scanStatus:
            attachment.scan_status,

        availableAt:
            attachment.available_at,

        quarantinedAt:
            attachment.quarantined_at,

        createdAt:
            attachment.created_at,
    };
}

async function listAttachments(
    reportId
) {
    await findReportOrFail(
        prisma,
        reportId
    );

    const attachments =
        await prisma.report_attachments.findMany({
            where: {
                report_id:
                    reportId,

                purged_at:
                    null,
            },

            orderBy: {
                created_at:
                    "desc",
            },
        });

    return attachments.map(
        serializeAttachment
    );
}

async function createAttachment(
    reportId,
    {
        file,
        visibility,
    },
    actorUserId
) {
    const report =
        await findReportOrFail(
            prisma,
            reportId
        );

    if (
        report.status ===
        "ARCHIVED"
    ) {
        throw createServiceError(
            "Não é possível adicionar anexos a uma denúncia arquivada.",
            409
        );
    }

    if (!file) {
        throw createServiceError(
            "Nenhum arquivo foi enviado.",
            400
        );
    }

    const attachmentId =
        randomUUID();

    /*
     * Nunca usamos o nome original
     * como nome do arquivo no R2.
     */
    const storageKey =
        `reports/${reportId}/${attachmentId}`;

    const sha256 =
        createHash("sha256")
            .update(
                file.buffer
            )
            .digest("hex");

    const encryptedName =
        encryptJson(
            {
                name:
                    file.originalname,
            },
            "ATTACHMENT_ORIGINAL_NAME"
        );

    /*
     * Primeiro enviamos ao storage.
     */
    await uploadObject({
        key:
            storageKey,

        body:
            file.buffer,

        contentType:
            file.mimetype,
    });

    const now =
        new Date();

    try {
        await prisma.$transaction(
            async (tx) => {
                await tx.report_attachments.create({
                    data: {
                        id:
                            attachmentId,

                        report_id:
                            reportId,

                        message_id:
                            null,

                        internal_note_id:
                            null,

                        uploaded_by_type:
                            "ADMIN",

                        uploaded_by_user_id:
                            actorUserId,

                        visibility:
                            visibility,

                        storage_key:
                            storageKey,

                        mime_type:
                            file.mimetype,

                        size_bytes:
                            BigInt(
                                file.size
                            ),

                        sha256,

                        original_name_ciphertext:
                            encryptedName
                                .ciphertext,

                        original_name_iv:
                            encryptedName
                                .iv,

                        original_name_auth_tag:
                            encryptedName
                                .authTag,

                        original_name_key_version:
                            encryptedName
                                .keyVersion,

                        /*
                         * Arquivo ainda não foi
                         * verificado pelo scanner.
                         */
                        scan_status:
                            "PENDING",

                        available_at:
                            null,

                        created_at:
                            now,
                    },
                });

                await tx.reports.update({
                    where: {
                        id:
                            reportId,
                    },

                    data: {
                        last_activity_at:
                            now,
                    },
                });

                await tx.report_events.create({
                    data: {
                        id:
                            randomUUID(),

                        report_id:
                            reportId,

                        event_type:
                            "ATTACHMENT_ADDED",

                        actor_type:
                            "ADMIN",

                        actor_user_id:
                            actorUserId,
                    },
                });

                await tx.audit_logs.create({
                    data: {
                        actor_type:
                            "ADMIN",

                        actor_user_id:
                            actorUserId,

                        action:
                            "REPORT_ATTACHMENT_ADDED",

                        entity_type:
                            "REPORT",

                        entity_id:
                            reportId,

                        success:
                            true,

                        request_id:
                            randomUUID(),

                        metadata_json:
                            auditMetadata({
                                protocol:
                                    report.protocol,

                                attachmentId,

                                mimeType:
                                    file.mimetype,

                                sizeBytes:
                                    file.size,

                                visibility,
                            }),
                    },
                });
            }
        );
    } catch (error) {
        /*
         * Se o banco falhar depois
         * do upload, removemos o
         * arquivo órfão do R2.
         */
        try {
            await deleteObject(
                storageKey
            );
        } catch (
            cleanupError
        ) {
            console.error(
                "Erro ao remover arquivo órfão do R2:",
                cleanupError
            );
        }

        throw error;
    }

    const attachment =
        await prisma.report_attachments.findUnique({
            where: {
                id:
                    attachmentId,
            },
        });

    return serializeAttachment(
        attachment
    );
}

module.exports = {
    listAttachments,
    createAttachment,
};