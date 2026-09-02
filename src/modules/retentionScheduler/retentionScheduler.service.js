const {
    randomUUID,
    createHash,
} = require("node:crypto");

const prisma =
    require("../../database/prisma");

const {
    getActorUnitScope,
} = require(
    "../access/unitScope.service"
);

const {
    encryptJson,
} = require(
    "../../security/crypto.service"
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

function calculateRetentionDate(
    anchorDate,
    retentionDays
) {
    const millisecondsPerDay =
        24 * 60 * 60 * 1000;

    return new Date(
        anchorDate.getTime() +
        retentionDays *
            millisecondsPerDay
    );
}

function createReportReferenceHash(
    reportId
) {
    return createHash("sha256")
        .update(reportId)
        .digest();
}

async function findReportOrFail(
    database,
    reportId
) {
    const report =
        await database.reports.findUnique({
            where: {
                id: reportId,
            },

select: {
    id: true,

    protocol:
        true,

    unit_id:
        true,

    category_id:
        true,

    status:
        true,

    concluded_at:
        true,

    archived_at:
        true,

    retention_until:
        true,

    legal_hold:
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

function getRetentionAnchor(
    report
) {
    if (
        report.status ===
        "CONCLUDED"
    ) {
        return report.concluded_at;
    }

    if (
        report.status ===
        "ARCHIVED"
    ) {
        return report.archived_at;
    }

    return null;
}

async function findApplicablePolicy(
    database,
    report
) {
    /*
     * 1. Unidade + categoria específica
     */
    if (
        report.unit_id
    ) {
        const unitCategoryPolicy =
            await database
                .retention_policies
                .findFirst({
                    where: {
                        category_id:
                            report.category_id,

                        applies_to_status:
                            report.status,

                        is_active:
                            true,

                        retention_policy_units: {
                            some: {
                                unit_id:
                                    report.unit_id,
                            },
                        },
                    },

                    orderBy: {
                        updated_at:
                            "desc",
                    },
                });

        if (
            unitCategoryPolicy
        ) {
            return unitCategoryPolicy;
        }

        /*
         * 2. Unidade + todas as categorias
         */
        const unitGlobalCategoryPolicy =
            await database
                .retention_policies
                .findFirst({
                    where: {
                        category_id:
                            null,

                        applies_to_status:
                            report.status,

                        is_active:
                            true,

                        retention_policy_units: {
                            some: {
                                unit_id:
                                    report.unit_id,
                            },
                        },
                    },

                    orderBy: {
                        updated_at:
                            "desc",
                    },
                });

        if (
            unitGlobalCategoryPolicy
        ) {
            return unitGlobalCategoryPolicy;
        }
    }

    /*
     * 3. Regra global + categoria específica
     *
     * Nenhuma linha em retention_policy_units
     * significa política global.
     */
    const globalCategoryPolicy =
        await database
            .retention_policies
            .findFirst({
                where: {
                    category_id:
                        report.category_id,

                    applies_to_status:
                        report.status,

                    is_active:
                        true,

                    retention_policy_units: {
                        none: {},
                    },
                },

                orderBy: {
                    updated_at:
                        "desc",
                },
            });

    if (
        globalCategoryPolicy
    ) {
        return globalCategoryPolicy;
    }

    /*
     * 4. Global + todas as categorias
     */
    return database
        .retention_policies
        .findFirst({
            where: {
                category_id:
                    null,

                applies_to_status:
                    report.status,

                is_active:
                    true,

                retention_policy_units: {
                    none: {},
                },
            },

            orderBy: {
                updated_at:
                    "desc",
            },
        });
}
async function scheduleRetentionForReport(
    reportId
) {
    const report =
        await findReportOrFail(
            prisma,
            reportId
        );

    /*
     * Só agendamos denúncias encerradas.
     */
    if (
        ![
            "CONCLUDED",
            "ARCHIVED",
        ].includes(
            report.status
        )
    ) {
        return {
            scheduled: false,
            reason:
                "STATUS_NOT_ELIGIBLE",
        };
    }

    /*
     * Legal Hold sempre vence
     * a política de retenção.
     */
    if (report.legal_hold) {
        return {
            scheduled: false,
            reason:
                "LEGAL_HOLD_ACTIVE",
        };
    }

    const anchorDate =
        getRetentionAnchor(
            report
        );

    if (!anchorDate) {
        throw createServiceError(
            "A denúncia não possui a data necessária para calcular a retenção.",
            409
        );
    }

    const policy =
        await findApplicablePolicy(
            prisma,
            report
        );

    if (!policy) {
        await cancelPendingRetentionForReport(
            reportId,
            null,
            "NO_ACTIVE_RETENTION_POLICY"
        );

        return {
            scheduled: false,
            reason: "NO_POLICY",
        };
    }

    const scheduledAt =
        calculateRetentionDate(
            anchorDate,
            policy.retention_days
        );

    /*
     * Se existe uma execução RUNNING,
     * não podemos criar outra.
     */
    const running =
        await prisma
            .report_retention_executions
            .findFirst({
                where: {
                    report_id:
                        reportId,

                    status:
                        "RUNNING",
                },

                select: {
                    id: true,
                },
            });

    if (running) {
        return {
            scheduled: false,
            reason:
                "EXECUTION_RUNNING",
            executionId:
                running.id,
        };
    }

    /*
     * Verifica se já existe exatamente
     * o mesmo agendamento.
     */
    const existing =
        await prisma
            .report_retention_executions
            .findFirst({
                where: {
                    report_id:
                        reportId,

                    policy_id:
                        policy.id,

                    action:
                        policy.action,

                    status:
                        "PENDING",

                    scheduled_at:
                        scheduledAt,
                },

                select: {
                    id: true,
                    scheduled_at: true,
                    action: true,
                },
            });

    if (existing) {
        return await prisma
    .report_retention_executions
    .update({
        where: {
            id:
                existing.id,
        },

        data: {
            unit_id:
                report.unit_id,

            report_protocol_snapshot:
                report.protocol,
        },
    });
    }

    const executionId =
        randomUUID();

    const referenceHash =
        createReportReferenceHash(
            report.id
        );

    const eventMetadata =
        encryptJson(
            {
                policyId:
                    policy.id,

                action:
                    policy.action,

                scheduledAt:
                    scheduledAt.toISOString(),
            },
            "REPORT_EVENT_METADATA"
        );

    await prisma.$transaction(
        async (tx) => {
            /*
             * Se houve mudança de política,
             * cancela agendamentos anteriores
             * ainda não executados.
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

            await tx
                .report_retention_executions
                .create({
                    data: {
                        id:
                            executionId,

                        report_id:
                            reportId,

                        policy_id:
                            policy.id,
                            
                        unit_id:
                            report.unit_id,
                                            
                        report_protocol_snapshot:
                            report.protocol,
                                            
                        attempt_count:
                            0,

                        report_reference_hash:
                            referenceHash,

                        action:
                            policy.action,

                        status:
                            "PENDING",

                        scheduled_at:
                            scheduledAt,

                        started_at:
                            null,

                        completed_at:
                            null,

                        executed_by_user_id:
                            null,

                        error_message:
                            null,
                    },
                });

            await tx.reports.update({
                where: {
                    id:
                        reportId,
                },

                data: {
                    retention_until:
                        scheduledAt,
                },
            });

            await tx.report_events.create({
                data: {
                    id:
                        randomUUID(),

                    report_id:
                        reportId,

                    event_type:
                        "RETENTION_SCHEDULED",

                    actor_type:
                        "SYSTEM",

                    actor_user_id:
                        null,

                    metadata_ciphertext:
                        eventMetadata
                            .ciphertext,

                    metadata_iv:
                        eventMetadata
                            .iv,

                    metadata_auth_tag:
                        eventMetadata
                            .authTag,

                    metadata_key_version:
                        eventMetadata
                            .keyVersion,
                },
            });

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        "SYSTEM",

                    actor_user_id:
                        null,

                    action:
                        "REPORT_RETENTION_SCHEDULED",

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
                            policyId:
                                policy.id,

                            action:
                                policy.action,

                            scheduledAt:
                                scheduledAt
                                    .toISOString(),
                        }),
                },
            });
        }
    );

    return {
        scheduled: true,

        alreadyScheduled:
            false,

        executionId,

        scheduledAt,

        action:
            policy.action,

        policyId:
            policy.id,

        retentionDays:
            policy.retention_days,
    };
}

async function scheduleRetentionBatch({
    limit = 100,
    actorUserId = null,
} = {}) {
    const pageSize =
        Number.isInteger(limit)
            ? Math.min(
                Math.max(limit, 1),
                500
            )
            : 100;

    let cursor = null;

    const result = {
        processed: 0,
        scheduled: 0,
        alreadyScheduled: 0,
        skipped: 0,
        failed: 0,
        errors: [],
    };

    let scopedUnitIds =
        null;

    if (actorUserId) {
        const scope =
            await getActorUnitScope(
                actorUserId
            );

        if (
            !scope.isAdminMaster
        ) {
            scopedUnitIds =
                scope.unitIds;

            if (
                scopedUnitIds.length ===
                0
            ) {
                return result;
            }
        }
    }

    do {
        const reports =
            await prisma.reports.findMany({
            where: {
                ...(scopedUnitIds
                    ? {
                        unit_id: {
                            in:
                                scopedUnitIds,
                        },
                    }
                    : {}),

                status: {
                    in: [
                        "CONCLUDED",
                        "ARCHIVED",
                    ],
                },

                legal_hold:
                    false,
            },

            select: {
                id: true,
            },

            ...(cursor
                ? {
                    cursor: {
                        id:
                            cursor,
                    },

                    skip: 1,
                }
                : {}),

            take:
                pageSize,

            orderBy: {
                id:
                    "asc",
            },
            });

        if (!reports.length) {
            break;
        }

        for (
            const report of reports
        ) {
            result.processed++;

        try {
            const response =
                await scheduleRetentionForReport(
                    report.id
                );

            if (
                response.scheduled &&
                response.alreadyScheduled
            ) {
                result
                    .alreadyScheduled++;
            } else if (
                response.scheduled
            ) {
                result.scheduled++;
            } else {
                result.skipped++;
            }
        } catch (error) {
            result.failed++;

            /*
             * Não retornamos conteúdo
             * da denúncia.
             */
            result.errors.push({
                reportId:
                    report.id,

                message:
                    error.message,
            });
        }
        }

        cursor =
            reports[
                reports.length - 1
            ].id;
    } while (true);

    return result;
}
async function cancelPendingRetentionForReport(
    reportId,
    actorUserId = null,
    reason = "REPORT_STATUS_NOT_ELIGIBLE"
) {
    const report =
        await prisma.reports.findUnique({
            where: {
                id: reportId,
            },

            select: {
                id: true,
                retention_until: true,
            },
        });

    if (!report) {
        throw createServiceError(
            "Denúncia não encontrada.",
            404
        );
    }

    const pending =
        await prisma
            .report_retention_executions
            .findMany({
                where: {
                    report_id:
                        reportId,

                    status:
                        "PENDING",
                },

                select: {
                    id: true,
                },
            });

    if (
        !pending.length &&
        !report.retention_until
    ) {
        return {
            cancelled: false,
            count: 0,
        };
    }

    await prisma.$transaction(
        async (tx) => {
            const result =
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

            await tx.reports.update({
                where: {
                    id: reportId,
                },

                data: {
                    retention_until:
                        null,
                },
            });

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        actorUserId
                            ? "ADMIN"
                            : "SYSTEM",

                    actor_user_id:
                        actorUserId,

                    action:
                        "REPORT_RETENTION_CANCELLED",

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
                            reason,
                            cancelledExecutions:
                                result.count,
                        }),
                },
            });
        }
    );

    return {
        cancelled: true,
        count:
            pending.length,
    };
}

module.exports = {
    scheduleRetentionForReport,
    scheduleRetentionBatch,
    cancelPendingRetentionForReport,
};
