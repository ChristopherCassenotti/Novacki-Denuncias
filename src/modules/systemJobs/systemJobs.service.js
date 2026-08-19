const {
    randomUUID,
} = require("node:crypto");

const prisma =
    require("../../database/prisma");

const {
    scheduleRetentionBatch,
} = require(
    "../retentionScheduler/retentionScheduler.service"
);

const {
    runRetentionExecutorBatch,
} = require(
    "../retentionExecutor/retentionExecutor.service"
);

const {
    runAttachmentScannerBatch,
    recoverStuckScans,
} = require(
    "../attachmentScanner/attachmentScanner.service"
);

function envBoolean(
    name,
    fallback = false
) {
    const value =
        process.env[name];

    if (value === undefined) {
        return fallback;
    }

    return [
        "true",
        "1",
        "yes",
        "on",
    ].includes(
        String(value)
            .toLowerCase()
    );
}

function envInteger(
    name,
    fallback
) {
    const value =
        Number(
            process.env[name]
        );

    if (
        !Number.isInteger(value) ||
        value <= 0
    ) {
        return fallback;
    }

    return value;
}

function minutesAgo(
    minutes
) {
    return new Date(
        Date.now() -
        minutes *
            60 *
            1000
    );
}

async function auditSystemJob(
    action,
    metadata,
    success = true
) {
    await prisma.audit_logs.create({
        data: {
            actor_type:
                "SYSTEM",

            actor_user_id:
                null,

            action,

            entity_type:
                "SYSTEM_JOB",

            entity_id:
                null,

            success,

            request_id:
                randomUUID(),

            metadata_json:
                JSON.stringify(
                    metadata
                ),
        },
    });
}

/*
 * Caso o Node morra depois de:
 *
 * PENDING → RUNNING
 *
 * mas antes da remoção da denúncia,
 * precisamos permitir uma nova
 * tentativa.
 *
 * Só recuperamos quando report_id
 * ainda existe.
 *
 * RUNNING + report_id NULL significa
 * que a denúncia já foi removida e
 * o R2 ainda está sendo finalizado.
 */
async function recoverStuckRetentionExecutions() {
    const minutes =
        envInteger(
            "RETENTION_STUCK_MINUTES",
            30
        );

    const cutoff =
        minutesAgo(
            minutes
        );

    const result =
        await prisma
            .report_retention_executions
            .updateMany({
                where: {
                    status:
                        "RUNNING",

                    report_id: {
                        not:
                            null,
                    },

                    started_at: {
                        lt:
                            cutoff,
                    },
                },

                data: {
                    status:
                        "PENDING",

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

    if (
        result.count > 0
    ) {
        await auditSystemJob(
            "STUCK_RETENTION_EXECUTIONS_RECOVERED",
            {
                count:
                    result.count,

                thresholdMinutes:
                    minutes,
            }
        );
    }

    return result.count;
}

/*
 * Se o processo morrer durante um
 * DeleteObject no R2, a linha poderia
 * permanecer RUNNING para sempre.
 *
 * Voltamos para FAILED e o executor
 * já sabe tentar itens FAILED novamente.
 */
async function recoverStuckR2Purges() {
    const minutes =
        envInteger(
            "R2_PURGE_STUCK_MINUTES",
            15
        );

    const cutoff =
        minutesAgo(
            minutes
        );

    const result =
        await prisma
            .retention_object_purge_queue
            .updateMany({
                where: {
                    status:
                        "RUNNING",

                    updated_at: {
                        lt:
                            cutoff,
                    },
                },

                data: {
                    status:
                        "FAILED",

                    last_error:
                        "WORKER_TIMEOUT",
                },
            });

    if (
        result.count > 0
    ) {
        await auditSystemJob(
            "STUCK_R2_PURGES_RECOVERED",
            {
                count:
                    result.count,

                thresholdMinutes:
                    minutes,
            }
        );
    }

    return result.count;
}

/*
 * Sessões expiradas não têm mais
 * utilidade para autenticação.
 *
 * Não tocamos em audit_logs.
 */
async function cleanupExpiredSessions() {
    const now =
        new Date();

    const [
        adminSessions,
        reporterSessions,
    ] =
        await prisma.$transaction([
            prisma.user_sessions
                .deleteMany({
                    where: {
                        expires_at: {
                            lt:
                                now,
                        },
                    },
                }),

            prisma.reporter_sessions
                .deleteMany({
                    where: {
                        expires_at: {
                            lt:
                                now,
                        },
                    },
                }),
        ]);

    return {
        adminSessions:
            adminSessions.count,

        reporterSessions:
            reporterSessions.count,
    };
}

async function cleanupExpiredOneTimeTokens() {
    const result =
        await prisma
            .user_one_time_tokens
            .deleteMany({
                where: {
                    expires_at: {
                        lt:
                            new Date(),
                    },
                },
            });

    return result.count;
}

async function runMaintenanceJobs() {
    const result = {
        recoveredRetentionExecutions:
            0,

        recoveredR2Purges:
            0,

        recoveredScans:
            0,

        deletedAdminSessions:
            0,

        deletedReporterSessions:
            0,

        deletedOneTimeTokens:
            0,
    };

    result
        .recoveredRetentionExecutions =
        await recoverStuckRetentionExecutions();

    result.recoveredR2Purges =
        await recoverStuckR2Purges();

    /*
     * A função já existe no módulo
     * do scanner.
     */
    const recoveredScans =
        await recoverStuckScans();

    result.recoveredScans =
        recoveredScans.count;

    const sessions =
        await cleanupExpiredSessions();

    result.deletedAdminSessions =
        sessions.adminSessions;

    result.deletedReporterSessions =
        sessions.reporterSessions;

    result.deletedOneTimeTokens =
        await cleanupExpiredOneTimeTokens();

    return result;
}

async function runSystemJobsCycle() {
    const startedAt =
        new Date();

    const result = {
        startedAt:
            startedAt
                .toISOString(),

        maintenance:
            null,

        retentionScheduler:
            {
                enabled:
                    false,
            },

        retentionExecutor:
            {
                enabled:
                    false,
            },

        attachmentScanner:
            {
                enabled:
                    false,
            },

        finishedAt:
            null,
    };

    /*
     * 1. Recuperação e limpeza.
     */
    result.maintenance =
        await runMaintenanceJobs();

    /*
     * 2. Scheduler.
     *
     * Apenas agenda.
     * Não destrói nada.
     */
    if (
        envBoolean(
            "RETENTION_SCHEDULER_ENABLED",
            true
        )
    ) {
        result.retentionScheduler =
            {
                enabled:
                    true,

                result:
                    await scheduleRetentionBatch({
                        limit:
                            100,
                    }),
            };
    }

    /*
     * 3. Executor.
     *
     * Pode anonimizar/apagar.
     * Por isso exige opt-in explícito.
     */
    if (
        envBoolean(
            "RETENTION_EXECUTOR_ENABLED",
            false
        )
    ) {
        result.retentionExecutor =
            {
                enabled:
                    true,

                result:
                    await runRetentionExecutorBatch({
                        limit:
                            20,

                        actorUserId:
                            null,
                    }),
            };
    }

    /*
     * 4. Scanner.
     *
     * Só ligaremos depois que
     * ClamAV estiver instalado.
     */
    if (
        envBoolean(
            "ATTACHMENT_SCANNER_ENABLED",
            false
        )
    ) {
        result.attachmentScanner =
            {
                enabled:
                    true,

                result:
                    await runAttachmentScannerBatch({
                        limit:
                            10,

                        actorUserId:
                            null,
                    }),
            };
    }

    result.finishedAt =
        new Date()
            .toISOString();

    return result;
}

module.exports = {
    runSystemJobsCycle,
    runMaintenanceJobs,
    recoverStuckRetentionExecutions,
    recoverStuckR2Purges,
    cleanupExpiredSessions,
    cleanupExpiredOneTimeTokens,
};