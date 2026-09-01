const {
    randomUUID,
    createHash,
} = require("node:crypto");

const prisma =
    require("../../database/prisma");
const { safeExceptionLog } = require("../../utils/safeLog");
const { validateAttachmentFile } = require("../../security/attachmentValidation.service");

const {
    encryptJson,
    decryptJson,
} = require(
    "../../security/crypto.service"
);

const {
    uploadObject,
    deleteObject,
    getObject,
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

    validateAttachmentFile(file);

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
                         * O arquivo já passou pelas validações locais de
                         * extensão, MIME e assinatura binária. Como não há
                         * antivírus externo, ele fica disponível imediatamente.
                         * CLEAN é mantido para compatibilidade com o contrato
                         * atual do banco e do frontend.
                         */
                        scan_status:
                            "CLEAN",

                        available_at:
                            now,

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
            safeExceptionLog(
                "admin_attachment_orphan_cleanup",
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

async function prepareAttachmentDownload(
    reportId,
    attachmentId,
    actorUserId
) {
    const report =
        await findReportOrFail(
            prisma,
            reportId
        );

    const attachment =
        await prisma.report_attachments.findFirst({
            where: {
                id:
                    attachmentId,

                report_id:
                    reportId,

                purged_at:
                    null,
            },

            select: {
                id: true,
                report_id: true,

                storage_key: true,

                mime_type: true,
                size_bytes: true,

                original_name_ciphertext:
                    true,

                original_name_iv:
                    true,

                original_name_auth_tag:
                    true,

                original_name_key_version:
                    true,

                scan_status:
                    true,

                available_at:
                    true,

                quarantined_at:
                    true,

                purged_at:
                    true,
            },
        });

    if (!attachment) {
        throw createServiceError(
            "Anexo não encontrado.",
            404
        );
    }

    /*
     * O arquivo só pode ser entregue
     * quando o scanner tiver marcado
     * explicitamente como CLEAN.
     */
    if (
        [
            "PENDING",
            "SCANNING",
        ].includes(
            attachment.scan_status
        )
    ) {
        throw createServiceError(
            "Este arquivo ainda está sendo analisado.",
            409
        );
    }

    if (
        attachment.scan_status ===
        "FAILED"
    ) {
        throw createServiceError(
            "Não foi possível validar a segurança deste arquivo.",
            409
        );
    }

    if (
        attachment.scan_status ===
            "INFECTED" ||
        attachment.scan_status ===
            "QUARANTINED"
    ) {
        throw createServiceError(
            "Este arquivo está indisponível por motivos de segurança.",
            423
        );
    }

    if (
        attachment.scan_status !==
        "CLEAN"
    ) {
        throw createServiceError(
            "Este arquivo não está disponível para download.",
            409
        );
    }

    /*
     * CLEAN sem available_at indicaria
     * inconsistência de estado.
     */
    if (
        !attachment.available_at
    ) {
        throw createServiceError(
            "Este arquivo ainda não está disponível.",
            409
        );
    }

    let object;

    try {
        object =
            await getObject(
                attachment.storage_key
            );
    } catch (error) {
        safeExceptionLog(
            "admin_attachment_storage_fetch",
            error
        );

        throw createServiceError(
            "O arquivo está temporariamente indisponível.",
            502
        );
    }

    if (!object?.Body) {
        throw createServiceError(
            "O arquivo está temporariamente indisponível.",
            502
        );
    }

    const originalName =
        decryptOriginalName(
            attachment
        );

    await prisma.audit_logs.create({
        data: {
            actor_type:
                "ADMIN",

            actor_user_id:
                actorUserId,

            action:
                "REPORT_ATTACHMENT_DOWNLOADED",

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
                    attachmentId:
                        attachment.id,
                }),
        },
    });

    return {
        body:
            object.Body,

        originalName,

        mimeType:
            attachment.mime_type,

        sizeBytes:
            attachment.size_bytes,
    };
}

module.exports = {
    listAttachments,
    createAttachment,
    prepareAttachmentDownload,
};
