const {
    randomUUID,
} = require("node:crypto");

const prisma =
    require("../../database/prisma");
const { safeExceptionLog } = require("../../utils/safeLog");

const {
    deleteObject,
} = require("../../storage/r2");

const {
    scheduleRetentionForReport,
} = require(
    "../retentionScheduler/retentionScheduler.service"
);

const DEFAULT_LEASE_TIMEOUT_MS =
    15 * 60 * 1000;
const DEFAULT_R2_PURGE_MAX_ATTEMPTS =
    8;

const DEFAULT_R2_PURGE_RETRY_BASE_MS =
    60 * 1000;

const DEFAULT_R2_PURGE_RETRY_MAX_MS =
    60 * 60 * 1000;

function getR2PurgeMaxAttempts() {
    const value =
        Number(
            process.env
                .R2_PURGE_MAX_ATTEMPTS
        );

    if (
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 20
    ) {
        return value;
    }

    return DEFAULT_R2_PURGE_MAX_ATTEMPTS;
}

function getR2PurgeRetryBaseMs() {
    const value =
        Number(
            process.env
                .R2_PURGE_RETRY_BASE_MS
        );

    if (
        Number.isFinite(value) &&
        value >= 10_000
    ) {
        return value;
    }

    return DEFAULT_R2_PURGE_RETRY_BASE_MS;
}

function getR2PurgeRetryMaxMs() {
    const value =
        Number(
            process.env
                .R2_PURGE_RETRY_MAX_MS
        );

    if (
        Number.isFinite(value) &&
        value >= 60_000
    ) {
        return value;
    }

    return DEFAULT_R2_PURGE_RETRY_MAX_MS;
}

function getR2RetryDelayMs(
    attempts
) {
    const exponent =
        Math.max(
            0,
            attempts - 1
        );

    return Math.min(
        getR2PurgeRetryBaseMs() *
            2 ** exponent,

        getR2PurgeRetryMaxMs()
    );
}

function isR2RetryDue(
    item,
    now = new Date()
) {
    if (
        item.status ===
        "PENDING"
    ) {
        return true;
    }

    if (
        item.attempts >=
        getR2PurgeMaxAttempts()
    ) {
        return false;
    }

    const lastAttemptAt =
        item.updated_at ||
        item.created_at;

    if (!lastAttemptAt) {
        return true;
    }

    const delay =
        getR2RetryDelayMs(
            item.attempts
        );

    return (
        lastAttemptAt.getTime() +
            delay <=
        now.getTime()
    );
}
function getLeaseTimeoutMs() {
    const configured = Number(
        process.env
            .RETENTION_LEASE_TIMEOUT_MS
    );

    if (
        Number.isFinite(configured) &&
        configured >= 60_000
    ) {
        return configured;
    }

    return DEFAULT_LEASE_TIMEOUT_MS;
}

function getStaleBefore() {
    return new Date(
        Date.now() -
            getLeaseTimeoutMs()
    );
}

function createServiceError(
    message,
    statusCode,
    code = null
) {
    const error =
        new Error(message);

    error.statusCode =
        statusCode;

    error.code =
        code;

    return error;
}

function getActorType(
    actorUserId
) {
    return actorUserId
        ? "ADMIN"
        : "SYSTEM";
}

async function setExecutionFailed(
    executionId,
    errorCode,
    actorUserId = null
) {
    await prisma.$transaction(
        async (tx) => {
            await tx
                .report_retention_executions
                .updateMany({
                    where: {
                        id:
                            executionId,

                        status:
                            "RUNNING",
                    },

                    data: {
                        status:
                            "FAILED",

                        completed_at:
                            new Date(),

                        error_message:
                            errorCode,
                    },
                });

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        getActorType(
                            actorUserId
                        ),

                    actor_user_id:
                        actorUserId,

                    action:
                        "RETENTION_EXECUTION_FAILED",

                    entity_type:
                        "RETENTION_EXECUTION",

                    entity_id:
                        executionId,

                    success:
                        false,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            errorCode,
                        }),
                },
            });
        }
    );
}

async function cancelExecution(
    executionId,
    reason,
    actorUserId = null
) {
    await prisma.$transaction(
        async (tx) => {
            const execution =
                await tx
                    .report_retention_executions
                    .findUnique({
                        where: {
                            id:
                                executionId,
                        },

                        select: {
                            report_id:
                                true,
                        },
                    });

            await tx
                .report_retention_executions
                .updateMany({
                    where: {
                        id:
                            executionId,

                        status:
                            "RUNNING",
                    },

                    data: {
                        status:
                            "CANCELLED",

                        completed_at:
                            new Date(),

                        error_message:
                            null,
                    },
                });

            if (
                execution?.report_id
            ) {
                await tx.reports.updateMany({
                    where: {
                        id:
                            execution
                                .report_id,
                    },

                    data: {
                        retention_until:
                            null,
                    },
                });
            }

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        getActorType(
                            actorUserId
                        ),

                    actor_user_id:
                        actorUserId,

                    action:
                        "RETENTION_EXECUTION_CANCELLED",

                    entity_type:
                        "RETENTION_EXECUTION",

                    entity_id:
                        executionId,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            reason,
                        }),
                },
            });
        }
    );
}

async function claimExecution(
    executionId,
    actorUserId = null
) {
    const now =
        new Date();

    const result =
        await prisma
            .report_retention_executions
            .updateMany({
                where: {
                    id:
                        executionId,

                    status:
                        "PENDING",

                    scheduled_at: {
                        lte:
                            now,
                    },
                },

                data: {
                    status:
                        "RUNNING",

                    started_at:
                        now,

                    completed_at:
                        null,

                    executed_by_user_id:
                        actorUserId,

                    error_message:
                        null,
                },
            });

    return (
        result.count === 1
    );
}

async function recoverStaleExecutions() {
    const result =
        await prisma
            .report_retention_executions
            .updateMany({
                where: {
                    status:
                        "RUNNING",

                    report_id: {
                        not: null,
                    },

                    started_at: {
                        lte:
                            getStaleBefore(),
                    },
                },

                data: {
                    status:
                        "PENDING",

                    completed_at:
                        null,

                    started_at:
                        null,

                    executed_by_user_id:
                        null,

                    error_message:
                        "STALE_EXECUTION_RECOVERED",
                },
            });

    return result.count;
}

function getStatisticsMonth(
    date
) {
    const year =
        date.getUTCFullYear();

    const month =
        String(
            date.getUTCMonth() + 1
        ).padStart(
            2,
            "0"
        );

    return `${year}-${month}-01`;
}

async function incrementAnonymizedStatistics(
    tx,
    report
) {
    const periodMonth =
        getStatisticsMonth(
            report.created_at
        );

    const anonymousIncrement =
        report.mode ===
        "ANONYMOUS"
            ? 1
            : 0;

    const identifiedIncrement =
        report.mode ===
        "IDENTIFIED"
            ? 1
            : 0;

    const riskIncrement =
        report.immediate_risk
            ? 1
            : 0;

    /*
     * Usamos UPSERT nativo do MariaDB
     * para evitar condição de corrida
     * entre dois executores atualizando
     * o mesmo mês/categoria.
     */
    await tx.$executeRaw`
        INSERT INTO anonymized_report_statistics (
            id,
            period_month,
            category_id,
            total_reports,
            anonymous_reports,
            identified_reports,
            immediate_risk_reports,
            created_at,
            updated_at
        )
        VALUES (
            ${randomUUID()},
            ${periodMonth},
            ${report.category_id},
            1,
            ${anonymousIncrement},
            ${identifiedIncrement},
            ${riskIncrement},
            CURRENT_TIMESTAMP(3),
            CURRENT_TIMESTAMP(3)
        )
        ON DUPLICATE KEY UPDATE
            total_reports =
                total_reports + 1,

            anonymous_reports =
                anonymous_reports
                + ${anonymousIncrement},

            identified_reports =
                identified_reports
                + ${identifiedIncrement},

            immediate_risk_reports =
                immediate_risk_reports
                + ${riskIncrement},

            updated_at =
                CURRENT_TIMESTAMP(3)
    `;
}

async function prepareReportRemoval(
    execution,
    actorUserId,
    action
) {
    const reportId =
        execution.report_id;

    if (!reportId) {
        throw createServiceError(
            "A execução não possui mais uma denúncia associada.",
            409,
            "REPORT_REFERENCE_MISSING"
        );
    }

    await prisma.$transaction(
        async (tx) => {
            const report =
                await tx.reports.findUnique({
                    where: {
                        id:
                            reportId,
                    },

                    select: {
                        id: true,

                        status:
                            true,

                        legal_hold:
                            true,

                        category_id:
                            true,

                        mode:
                            true,

                        immediate_risk:
                            true,

                        created_at:
                            true,
                    },
                });

            if (!report) {
                throw createServiceError(
                    "Denúncia não encontrada.",
                    409,
                    "REPORT_NOT_FOUND"
                );
            }

            /*
             * Legal Hold é validado
             * novamente imediatamente
             * antes da operação destrutiva.
             */
            if (
                report.legal_hold
            ) {
                throw createServiceError(
                    "A denúncia possui Legal Hold.",
                    409,
                    "LEGAL_HOLD_ACTIVE"
                );
            }

            if (
                ![
                    "CONCLUDED",
                    "ARCHIVED",
                ].includes(
                    report.status
                )
            ) {
                throw createServiceError(
                    "A denúncia não está mais elegível para retenção.",
                    409,
                    "STATUS_NOT_ELIGIBLE"
                );
            }

            /*
             * Capturamos os storage_keys
             * ANTES de remover a denúncia.
             */
            const attachments =
                await tx
                    .report_attachments
                    .findMany({
                        where: {
                            report_id:
                                reportId,

                            purged_at:
                                null,
                        },

                        select: {
                            storage_key:
                                true,
                        },
                    });

            if (
                attachments.length
            ) {
                await tx
                    .retention_object_purge_queue
                    .createMany({
                        data:
                            attachments.map(
                                (
                                    attachment
                                ) => ({
                                    id:
                                        randomUUID(),

                                    execution_id:
                                        execution.id,

                                    storage_key:
                                        attachment
                                            .storage_key,

                                    status:
                                        "PENDING",

                                    attempts:
                                        0,
                                })
                            ),
                    });
            }

            /*
             * ANONYMIZE preserva somente
             * dados estatísticos agregados.
             */
            if (
                action ===
                "ANONYMIZE"
            ) {
                await incrementAnonymizedStatistics(
                    tx,
                    report
                );
            }

            /*
             * O registro original é removido
             * tanto em DELETE quanto
             * ANONYMIZE.
             *
             * A diferença é que ANONYMIZE
             * preservou antes estatística
             * agregada sem report_id.
             */
            const deleted =
                await tx.reports.deleteMany({
                    where: {
                        id:
                            reportId,

                        legal_hold:
                            false,

                        status: {
                            in: [
                                "CONCLUDED",
                                "ARCHIVED",
                            ],
                        },
                    },
                });

            if (
                deleted.count !==
                1
            ) {
                throw createServiceError(
                    "A denúncia deixou de estar elegível durante a execução.",
                    409,
                    "REPORT_STATE_CHANGED"
                );
            }

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        getActorType(
                            actorUserId
                        ),

                    actor_user_id:
                        actorUserId,

                    action:
                        action ===
                        "ANONYMIZE"
                            ? "REPORT_RETENTION_ANONYMIZED"
                            : "REPORT_RETENTION_DATABASE_DELETED",

                    entity_type:
                        "RETENTION_EXECUTION",

                    entity_id:
                        execution.id,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            action,

                            attachmentsQueued:
                                attachments.length,

                            statisticsPreserved:
                                action ===
                                "ANONYMIZE",
                        }),
                },
            });
        }
    );
}

async function purgeObjects(
    executionId
) {
    const maxAttempts =
        getR2PurgeMaxAttempts();

    /*
     * Recupera objetos que ficaram
     * RUNNING após crash/interrupção.
     */
    await prisma
        .retention_object_purge_queue
        .updateMany({
            where: {
                execution_id:
                    executionId,

                status:
                    "RUNNING",

                updated_at: {
                    lte:
                        getStaleBefore(),
                },
            },

            data: {
                status:
                    "FAILED",

                last_error:
                    "STALE_PURGE_RECOVERED",
            },
        });

    const items =
        await prisma
            .retention_object_purge_queue
            .findMany({
                where: {
                    execution_id:
                        executionId,

                    status: {
                        in: [
                            "PENDING",
                            "FAILED",
                        ],
                    },
                },

                orderBy: {
                    created_at:
                        "asc",
                },
            });

    let transientFailures =
        0;

    let terminalFailures =
        0;

    let waitingBackoff =
        0;

    for (
        const item
        of items
    ) {
        /*
         * Não tenta novamente itens que
         * já atingiram o limite.
         */
        if (
            item.attempts >=
            maxAttempts
        ) {
            terminalFailures++;
            continue;
        }

        /*
         * FAILED recente aguarda o
         * backoff antes da próxima tentativa.
         */
        if (
            !isR2RetryDue(
                item
            )
        ) {
            waitingBackoff++;
            continue;
        }

        const claimed =
            await prisma
                .retention_object_purge_queue
                .updateMany({
                    where: {
                        id:
                            item.id,

                        status: {
                            in: [
                                "PENDING",
                                "FAILED",
                            ],
                        },

                        attempts: {
                            lt:
                                maxAttempts,
                        },
                    },

                    data: {
                        status:
                            "RUNNING",

                        attempts: {
                            increment:
                                1,
                        },

                        last_error:
                            null,
                    },
                });

        if (
            claimed.count !==
            1
        ) {
            continue;
        }

        const currentAttempt =
            item.attempts + 1;

        try {
            await deleteObject(
                item.storage_key
            );

            await prisma
                .retention_object_purge_queue
                .update({
                    where: {
                        id:
                            item.id,
                    },

                    data: {
                        status:
                            "COMPLETED",

                        last_error:
                            null,
                    },
                });
        } catch (error) {
            await prisma
                .retention_object_purge_queue
                .update({
                    where: {
                        id:
                            item.id,
                    },

                    data: {
                        status:
                            "FAILED",

                        last_error:
                            currentAttempt >=
                            maxAttempts
                                ? "R2_DELETE_MAX_ATTEMPTS"
                                : "R2_DELETE_FAILED",
                    },
                });

            if (
                currentAttempt >=
                maxAttempts
            ) {
                terminalFailures++;
            } else {
                transientFailures++;
            }
        }
    }

    if (
        terminalFailures > 0
    ) {
        throw createServiceError(
            "Um ou mais objetos excederam o limite de tentativas de remoção.",
            503,
            "R2_PURGE_MAX_ATTEMPTS"
        );
    }

    return {
        completed:
            transientFailures === 0 &&
            waitingBackoff === 0,

        transientFailures,

        waitingBackoff,
    };
}

async function finalizeRemovalExecution(
    executionId,
    action,
    actorUserId = null
) {
    const remaining =
        await prisma
            .retention_object_purge_queue
            .count({
                where: {
                    execution_id:
                        executionId,

                    status: {
                        not:
                            "COMPLETED",
                    },
                },
            });

    if (remaining > 0) {
        return {
            completed:
                false,

            remainingObjects:
                remaining,
        };
    }

    const finalized =
        await prisma.$transaction(
            async (tx) => {
                const updateResult =
                    await tx
                    .report_retention_executions
                    .updateMany({
                    where: {
                        id:
                            executionId,

                        status:
                            "RUNNING",
                    },

                    data: {
                        status:
                            "COMPLETED",

                        completed_at:
                            new Date(),

                        error_message:
                            null,
                    },
                    });

                if (
                    updateResult.count !== 1
                ) {
                    return false;
                }

                await tx.audit_logs.create({
                    data: {
                    actor_type:
                        getActorType(
                            actorUserId
                        ),

                    actor_user_id:
                        actorUserId,

                    action:
                        "REPORT_RETENTION_EXECUTED",

                    entity_type:
                        "RETENTION_EXECUTION",

                    entity_id:
                        executionId,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                        metadata_json:
                            JSON.stringify({
                                action,
                            }),
                    },
                });

                return true;
            }
        );

    if (!finalized) {
        const current =
            await prisma
                .report_retention_executions
                .findUnique({
                    where: {
                        id:
                            executionId,
                    },

                    select: {
                        status: true,
                    },
                });

        return {
            completed:
                current?.status ===
                "COMPLETED",

            alreadyFinalized:
                current?.status ===
                "COMPLETED",

            remainingObjects:
                0,
        };
    }

    return {
        completed:
            true,

        alreadyFinalized:
            false,

        remainingObjects:
            0,
    };
}

async function executeRetention(
    executionId,
    actorUserId = null
) {
    let execution =
        await prisma
            .report_retention_executions
            .findUnique({
                where: {
                    id:
                        executionId,
                },
            });

    if (!execution) {
        throw createServiceError(
            "Execução de retenção não encontrada.",
            404
        );
    }

    if (
        execution.status ===
        "FAILED"
    ) {
        await prisma
            .report_retention_executions
            .updateMany({
                where: {
                    id:
                        executionId,

                    status:
                        "FAILED",

                    report_id: {
                        not: null,
                    },
                },

                data: {
                    status:
                        "PENDING",

                    started_at:
                        null,

                    completed_at:
                        null,
                },
            });

        execution =
            await prisma
                .report_retention_executions
                .findUnique({
                    where: {
                        id:
                            executionId,
                    },
                });
    }

    if (
        execution.status !==
        "PENDING"
    ) {
        return {
            executed:
                false,

            reason:
                `STATUS_${execution.status}`,
        };
    }

    if (
        execution.scheduled_at >
        new Date()
    ) {
        return {
            executed:
                false,

            reason:
                "NOT_DUE",
        };
    }

    /*
     * Antes de executar, pedimos ao
     * scheduler que reavalie a política.
     *
     * Se dias/ação/política mudaram,
     * a execução antiga pode ser
     * CANCELLED e uma nova criada.
     */
    if (
        execution.report_id
    ) {
        await scheduleRetentionForReport(
            execution.report_id
        );

        execution =
            await prisma
                .report_retention_executions
                .findUnique({
                    where: {
                        id:
                            executionId,
                    },
                });

        if (
            execution.status !==
            "PENDING"
        ) {
            return {
                executed:
                    false,

                reason:
                    "RESCHEDULED_OR_CANCELLED",
            };
        }
    }

    const claimed =
        await claimExecution(
            executionId,
            actorUserId
        );

    if (!claimed) {
        return {
            executed:
                false,

            reason:
                "NOT_CLAIMED",
        };
    }

    execution =
        await prisma
            .report_retention_executions
            .findUnique({
                where: {
                    id:
                        executionId,
                },
            });

    if (
        ![
            "DELETE",
            "ANONYMIZE",
        ].includes(
            execution.action
        )
    ) {
        await setExecutionFailed(
            executionId,
            "UNKNOWN_RETENTION_ACTION",
            actorUserId
        );

        return {
            executed:
                false,

            reason:
                "UNKNOWN_RETENTION_ACTION",
        };
    }

    try {
        await prepareReportRemoval(
            execution,
            actorUserId,
            execution.action
        );
    } catch (error) {
        if (
            [
                "LEGAL_HOLD_ACTIVE",
                "STATUS_NOT_ELIGIBLE",
                "REPORT_STATE_CHANGED",
                "REPORT_REFERENCE_MISSING",
                "REPORT_NOT_FOUND",
            ].includes(
                error.code
            )
        ) {
            await cancelExecution(
                executionId,
                error.code,
                actorUserId
            );

            return {
                executed:
                    false,

                reason:
                    error.code,
            };
        }

        await setExecutionFailed(
            executionId,
            error.code ||
                "DATABASE_DELETE_FAILED",
            actorUserId
        );

        throw error;
    }

    /*
     * A denúncia já saiu do banco.
     * Agora processamos a fila R2.
     */
try {
    await purgeObjects(
        executionId
    );
} catch (error) {
    if (
        error.code ===
        "R2_PURGE_MAX_ATTEMPTS"
    ) {
        await setExecutionFailed(
            executionId,
            "R2_PURGE_MAX_ATTEMPTS",
            actorUserId
        );

        return {
            executed:
                false,

            reason:
                "R2_PURGE_MAX_ATTEMPTS",

            executionId,
        };
    }

    safeExceptionLog(
        "retention_r2_purge",
        error,
        {
            executionId,
        }
    );

    return {
        executed:
            false,

        reason:
            "R2_PURGE_PENDING",

        executionId,
    };
}

    const finalization =
        await finalizeRemovalExecution(
            executionId,
            execution.action,
            actorUserId
        );
if (
    !finalization.completed &&
    finalization.remainingObjects >
        0
) {
    return {
        executed:
            false,

        reason:
            "R2_PURGE_PENDING",

        action:
            execution.action,

        executionId,

        remainingObjects:
            finalization
                .remainingObjects,
    };
}
    return {
        executed:
            finalization.completed,

        action:
            execution.action,

        executionId,

        remainingObjects:
            finalization
                .remainingObjects,
    };
}

async function runRetentionExecutorBatch({
    limit = 20,
    actorUserId = null,
} = {}) {
    const batchLimit =
        Number.isInteger(limit)
            ? Math.min(
                Math.max(limit, 1),
                100
            )
            : 20;

    const recoveredExecutions =
        await recoverStaleExecutions();

    /*
     * Primeiro recuperamos remoções cujo
     * banco já foi removido mas o R2
     * ficou pendente.
     */
    const incompleteRemovals =
    await prisma
        .report_retention_executions
        .findMany({
            where: {
                status:
                    "RUNNING",

                action: {
                    in: [
                        "DELETE",
                        "ANONYMIZE",
                    ],
                },

                report_id:
                    null,
            },

            select: {
                id: true,
                action: true,
            },

            orderBy: {
                started_at:
                    "asc",
            },

            take:
                batchLimit,
        });

    for (
        const execution
        of incompleteRemovals
    ) {
        try {
            await purgeObjects(
                execution.id
            );

            await finalizeRemovalExecution(
                execution.id,
                execution.action,
                actorUserId
            );
        } catch (error) {
    if (
        error.code ===
        "R2_PURGE_MAX_ATTEMPTS"
    ) {
        await setExecutionFailed(
            execution.id,
            "R2_PURGE_MAX_ATTEMPTS",
            actorUserId
        );

        continue;
    }

    safeExceptionLog(
        "retention_purge_resume",
        error,
        {
            executionId:
                execution.id,
        }
    );
        }
    }

    const dueExecutions =
        await prisma
            .report_retention_executions
            .findMany({
                where: {
                    OR: [
                        {
                            status:
                                "PENDING",
                        },
                        {
                            status:
                                "FAILED",

                            report_id: {
                                not: null,
                            },
                        },
                    ],

                    scheduled_at: {
                        lte:
                            new Date(),
                    },
                },

                select: {
                    id: true,
                },

                orderBy: {
                    scheduled_at:
                        "asc",
                },

                take:
                    batchLimit,
            });

    const result = {
        processed: 0,
        completed: 0,
        skipped: 0,
        pendingR2: 0,
        failed: 0,
        recoveredExecutions,
    };

    for (
        const execution
        of dueExecutions
    ) {
        result.processed++;

        try {
            const response =
                await executeRetention(
                    execution.id,
                    actorUserId
                );

            if (
                response.executed
            ) {
                result.completed++;
            } else if (
                response.reason ===
                "R2_PURGE_PENDING"
            ) {
                result.pendingR2++;
            } else {
                result.skipped++;
            }
        } catch (error) {
            result.failed++;
        }
    }

    return result;
}

module.exports = {
    executeRetention,
    runRetentionExecutorBatch,
};
