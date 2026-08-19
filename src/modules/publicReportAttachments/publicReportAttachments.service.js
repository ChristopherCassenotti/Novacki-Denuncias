const {
    randomUUID,
    createHash,
} = require(
    "node:crypto"
);

const prisma =
    require(
        "../../database/prisma"
    );
const { safeExceptionLog } = require("../../utils/safeLog");

const {
    encryptJson,
    decryptJson,
} = require(
    "../../security/crypto.service"
);

const {
    uploadObject,
    getObject,
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
        decrypted.name ||
        "arquivo"
    );
}

function serializeAttachment(
    attachment
) {
    return {
        id:
            attachment.id,

        messageId:
            attachment.message_id,

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

        scanStatus:
            attachment.scan_status,

        availableAt:
            attachment.available_at,

        createdAt:
            attachment.created_at,
    };
}

async function findReportOrFail(
    reportId
) {
    const report =
        await prisma.reports.findUnique({
            where: {
                id:
                    reportId,
            },

            select: {
                id: true,
                status: true,
                protocol: true,
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

async function validateMessage(
    reportId,
    messageId
) {
    if (!messageId) {
        return null;
    }

    const message =
        await prisma.report_messages.findFirst({
            where: {
                id:
                    messageId,

                report_id:
                    reportId,
            },

            select: {
                id: true,
                sender_type: true,
            },
        });

    if (!message) {
        throw createServiceError(
            "Mensagem não encontrada nesta denúncia.",
            404
        );
    }

    /*
     * O denunciante só pode anexar
     * arquivo a uma mensagem enviada
     * por ele próprio.
     */
    if (
        message.sender_type !==
        "REPORTER"
    ) {
        throw createServiceError(
            "Não é possível vincular o arquivo a esta mensagem.",
            403
        );
    }

    return message;
}

async function listReporterAttachments(
    reportId
) {
    await findReportOrFail(
        reportId
    );

    const attachments =
        await prisma.report_attachments.findMany({
            where: {
                report_id:
                    reportId,

                visibility:
                    "REPORTER_AND_ADMIN",

                purged_at:
                    null,
            },

            select: {
                id: true,
                message_id: true,

                original_name_ciphertext:
                    true,

                original_name_iv:
                    true,

                original_name_auth_tag:
                    true,

                original_name_key_version:
                    true,

                mime_type:
                    true,

                size_bytes:
                    true,

                scan_status:
                    true,

                available_at:
                    true,

                created_at:
                    true,
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

async function createReporterAttachment(
    reportId,
    {
        file,
        messageId,
    }
) {
    const report =
        await findReportOrFail(
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

    const message =
        await validateMessage(
            reportId,
            messageId
        );

    const attachmentId =
        randomUUID();

    const storageKey =
        `reports/${reportId}/${attachmentId}`;

    const sha256 =
        createHash(
            "sha256"
        )
            .update(
                file.buffer
            )
            .digest(
                "hex"
            );

    const encryptedName =
        encryptJson(
            {
                name:
                    file.originalname,
            },
            "ATTACHMENT_ORIGINAL_NAME"
        );

    /*
     * Primeiro armazena no R2.
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
                            message?.id ??
                            null,

                        internal_note_id:
                            null,

                        /*
                         * Importante:
                         * denunciante não é usuário
                         * administrativo.
                         */
                        uploaded_by_type:
                            "REPORTER",

                        uploaded_by_user_id:
                            null,

                        /*
                         * Denunciante nunca cria
                         * ADMIN_ONLY.
                         */
                        visibility:
                            "REPORTER_AND_ADMIN",

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

                        scan_status:
                            "PENDING",

                        available_at:
                            null,

                        quarantined_at:
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
                            "REPORTER",

                        /*
                         * Não associamos o
                         * denunciante a users.
                         */
                        actor_user_id:
                            null,
                    },
                });
            }
        );
    } catch (error) {
        /*
         * Evita objeto órfão no R2.
         */
        try {
            await deleteObject(
                storageKey
            );
        } catch (
            cleanupError
        ) {
            safeExceptionLog(
                "reporter_attachment_orphan_cleanup",
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

            select: {
                id: true,
                message_id: true,

                original_name_ciphertext:
                    true,

                original_name_iv:
                    true,

                original_name_auth_tag:
                    true,

                original_name_key_version:
                    true,

                mime_type:
                    true,

                size_bytes:
                    true,

                scan_status:
                    true,

                available_at:
                    true,

                created_at:
                    true,
            },
        });

    return serializeAttachment(
        attachment
    );
}

async function prepareReporterAttachmentDownload(
    reportId,
    attachmentId
) {
    await findReportOrFail(
        reportId
    );

    const attachment =
        await prisma.report_attachments.findFirst({
            where: {
                id:
                    attachmentId,

                report_id:
                    reportId,

                visibility:
                    "REPORTER_AND_ADMIN",

                purged_at:
                    null,
            },
        });

    /*
     * Retornamos 404 inclusive para
     * ADMIN_ONLY, sem revelar que
     * esse anexo existe.
     */
    if (!attachment) {
        throw createServiceError(
            "Anexo não encontrado.",
            404
        );
    }

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
            "CLEAN" ||
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
            "reporter_attachment_storage_fetch",
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

    return {
        body:
            object.Body,

        originalName:
            decryptOriginalName(
                attachment
            ),

        mimeType:
            attachment.mime_type,

        sizeBytes:
            attachment.size_bytes,
    };
}
async function createInitialReporterAttachments(
    reportId,
    files
) {
    if (
        !Array.isArray(files) ||
        files.length === 0
    ) {
        return [];
    }

    const prepared = [];

    try {
        /*
         * Primeiro enviamos todos os
         * arquivos para o R2.
         */
        for (
            const file of files
        ) {
            const attachmentId =
                randomUUID();

            const storageKey =
                `reports/${reportId}/${attachmentId}`;

            const sha256 =
                createHash(
                    "sha256"
                )
                    .update(
                        file.buffer
                    )
                    .digest(
                        "hex"
                    );

            const encryptedName =
                encryptJson(
                    {
                        name:
                            file.originalname,
                    },
                    "ATTACHMENT_ORIGINAL_NAME"
                );

            await uploadObject({
                key:
                    storageKey,

                body:
                    file.buffer,

                contentType:
                    file.mimetype,
            });

            prepared.push({
                attachmentId,
                storageKey,
                file,
                sha256,
                encryptedName,
            });
        }

        const now =
            new Date();

        /*
         * Depois que todos estão no R2,
         * gravamos tudo em uma única
         * transação no banco.
         */
        await prisma.$transaction(
            async (tx) => {
                for (
                    const item of
                    prepared
                ) {
                    await tx.report_attachments.create({
                        data: {
                            id:
                                item
                                    .attachmentId,

                            report_id:
                                reportId,

                            message_id:
                                null,

                            internal_note_id:
                                null,

                            uploaded_by_type:
                                "REPORTER",

                            uploaded_by_user_id:
                                null,

                            visibility:
                                "REPORTER_AND_ADMIN",

                            storage_key:
                                item
                                    .storageKey,

                            mime_type:
                                item
                                    .file
                                    .mimetype,

                            size_bytes:
                                BigInt(
                                    item
                                        .file
                                        .size
                                ),

                            sha256:
                                item
                                    .sha256,

                            original_name_ciphertext:
                                item
                                    .encryptedName
                                    .ciphertext,

                            original_name_iv:
                                item
                                    .encryptedName
                                    .iv,

                            original_name_auth_tag:
                                item
                                    .encryptedName
                                    .authTag,

                            original_name_key_version:
                                item
                                    .encryptedName
                                    .keyVersion,

                            scan_status:
                                "PENDING",

                            available_at:
                                null,

                            quarantined_at:
                                null,

                            created_at:
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
                                "REPORTER",

                            actor_user_id:
                                null,
                        },
                    });
                }

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
            }
        );

        return prepared.map(
            (item) => ({
                id:
                    item.attachmentId,

                originalName:
                    item.file.originalname,

                mimeType:
                    item.file.mimetype,

                sizeBytes:
                    item.file.size,

                scanStatus:
                    "PENDING",
            })
        );
    } catch (error) {
        /*
         * Se qualquer etapa falhar,
         * remove tudo que já havia sido
         * colocado no R2.
         */
        for (
            const item of prepared
        ) {
            try {
                await deleteObject(
                    item.storageKey
                );
            } catch (
                cleanupError
            ) {
                safeExceptionLog(
                    "initial_attachment_orphan_cleanup",
                    cleanupError
                );
            }
        }

        throw error;
    }
}
module.exports = {
    listReporterAttachments,
    createReporterAttachment,
    prepareReporterAttachmentDownload,
    createInitialReporterAttachments,
};
