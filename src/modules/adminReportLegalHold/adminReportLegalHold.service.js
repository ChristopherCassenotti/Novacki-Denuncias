const {
    randomUUID,
} = require(
    "node:crypto"
);

const prisma =
    require(
        "../../database/prisma"
    );

const {
    encryptJson,
    decryptJson,
} = require(
    "../../security/crypto.service"
);
const {
    scheduleRetentionForReport,
} = require(
    "../retentionScheduler/retentionScheduler.service"
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

                legal_hold:
                    true,

                legal_hold_reason_ciphertext:
                    true,

                legal_hold_reason_iv:
                    true,

                legal_hold_reason_auth_tag:
                    true,

                legal_hold_key_version:
                    true,

                retention_until:
                    true,

                status:
                    true,
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

function decryptLegalHoldReason(
    report
) {
    if (
        !report
            .legal_hold_reason_ciphertext ||
        !report
            .legal_hold_reason_iv ||
        !report
            .legal_hold_reason_auth_tag ||
        !report
            .legal_hold_key_version
    ) {
        return null;
    }

    const decrypted =
        decryptJson(
            {
                ciphertext:
                    report
                        .legal_hold_reason_ciphertext,

                iv:
                    report
                        .legal_hold_reason_iv,

                authTag:
                    report
                        .legal_hold_reason_auth_tag,

                keyVersion:
                    report
                        .legal_hold_key_version,
            },
            "REPORT_LEGAL_HOLD_REASON"
        );

    return (
        decrypted?.reason ||
        null
    );
}

async function getLegalHold(
    reportId
) {
    const report =
        await findReportOrFail(
            prisma,
            reportId
        );

    return {
        active:
            report.legal_hold,

        reason:
            report.legal_hold
                ? decryptLegalHoldReason(
                    report
                )
                : null,

        retentionUntil:
            report.retention_until,

        status:
            report.status,
    };
}

async function applyLegalHold(
    reportId,
    reason,
    actorUserId
) {
    const report =
        await findReportOrFail(
            prisma,
            reportId
        );

    if (
        report.legal_hold
    ) {
        throw createServiceError(
            "Esta denúncia já possui bloqueio legal ativo.",
            409
        );
    }

    const encryptedReason =
        encryptJson(
            {
                reason,
            },
            "REPORT_LEGAL_HOLD_REASON"
        );

    /*
     * Guardamos também o motivo no evento
     * criptografado, porque no futuro o
     * legal hold poderá ser removido e os
     * campos da denúncia serão limpos.
     */
    const encryptedEventMetadata =
        encryptJson(
            {
                reason,
            },
            "REPORT_EVENT_METADATA"
        );

    await prisma.$transaction(
        async (tx) => {
            await tx.reports.update({
                where: {
                    id:
                        reportId,
                },

                data: {
                    legal_hold:
                        true,

                    legal_hold_reason_ciphertext:
                        encryptedReason
                            .ciphertext,

                    legal_hold_reason_iv:
                        encryptedReason
                            .iv,

                    legal_hold_reason_auth_tag:
                        encryptedReason
                            .authTag,

                    legal_hold_key_version:
                        encryptedReason
                            .keyVersion,
                },
            });

            /*
             * Qualquer retenção ainda
             * PENDING deve ser cancelada.
             */
            await tx
                .report_retention_executions
                .updateMany({
                    where: {
                        report_id:
                            reportId,

                        status:
                            "PENDING",
                    },

                    data: {
                        status:
                            "CANCELLED",
                    },
                });

            await tx.report_events.create({
                data: {
                    id:
                        randomUUID(),

                    report_id:
                        reportId,

                    event_type:
                        "LEGAL_HOLD_APPLIED",

                    actor_type:
                        "ADMIN",

                    actor_user_id:
                        actorUserId,

                    metadata_ciphertext:
                        encryptedEventMetadata
                            .ciphertext,

                    metadata_iv:
                        encryptedEventMetadata
                            .iv,

                    metadata_auth_tag:
                        encryptedEventMetadata
                            .authTag,

                    metadata_key_version:
                        encryptedEventMetadata
                            .keyVersion,
                },
            });

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        "ADMIN",

                    actor_user_id:
                        actorUserId,

                    action:
                        "REPORT_LEGAL_HOLD_APPLIED",

                    entity_type:
                        "REPORT",

                    entity_id:
                        reportId,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                    /*
                     * Não colocamos o motivo aqui.
                     * Audit metadata não deve
                     * receber conteúdo sensível.
                     */
                    metadata_json:
                        JSON.stringify({
                            previous:
                                false,

                            current:
                                true,
                        }),
                },
            });
        }
    );

    return getLegalHold(
        reportId
    );
}

async function releaseLegalHold(
    reportId,
    reason,
    actorUserId
) {
    const report =
        await findReportOrFail(
            prisma,
            reportId
        );

    if (
        !report.legal_hold
    ) {
        throw createServiceError(
            "Esta denúncia não possui bloqueio legal ativo.",
            409
        );
    }

    const encryptedEventMetadata =
        encryptJson(
            {
                reason,
            },
            "REPORT_EVENT_METADATA"
        );

    await prisma.$transaction(
        async (tx) => {
            await tx.reports.update({
                where: {
                    id:
                        reportId,
                },

                data: {
                    legal_hold:
                        false,

                    legal_hold_reason_ciphertext:
                        null,

                    legal_hold_reason_iv:
                        null,

                    legal_hold_reason_auth_tag:
                        null,

                    legal_hold_key_version:
                        null,
                },
            });

            await tx.report_events.create({
                data: {
                    id:
                        randomUUID(),

                    report_id:
                        reportId,

                    event_type:
                        "LEGAL_HOLD_REMOVED",

                    actor_type:
                        "ADMIN",

                    actor_user_id:
                        actorUserId,

                    metadata_ciphertext:
                        encryptedEventMetadata
                            .ciphertext,

                    metadata_iv:
                        encryptedEventMetadata
                            .iv,

                    metadata_auth_tag:
                        encryptedEventMetadata
                            .authTag,

                    metadata_key_version:
                        encryptedEventMetadata
                            .keyVersion,
                },
            });

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        "ADMIN",

                    actor_user_id:
                        actorUserId,

                    action:
                        "REPORT_LEGAL_HOLD_REMOVED",

                    entity_type:
                        "REPORT",

                    entity_id:
                        reportId,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            previous:
                                true,

                            current:
                                false,
                        }),
                },
            });
        }
    );
    try {
        await scheduleRetentionForReport(
            reportId
        );
    } catch (error) {
        console.error(
            "Falha ao reagendar retenção após remoção do Legal Hold:",
            error
        );
    }
    return getLegalHold(
        reportId
    );
}

module.exports = {
    getLegalHold,
    applyLegalHold,
    releaseLegalHold,
};