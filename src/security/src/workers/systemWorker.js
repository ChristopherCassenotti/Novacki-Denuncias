require("dotenv/config");

const { validateEnv } = require("../config/validateEnv");
const prisma = require("../database/prisma");
const { runSystemJobsCycle, } = require("../modules/systemJobs/systemJobs.service");
const { safeExceptionLog } = require("../utils/safeLog");

validateEnv();

function getInterval() {
    const value =
        Number(
            process.env
                .SYSTEM_WORKER_INTERVAL_MS
        );

    if (
        Number.isInteger(value) &&
        value >= 10000
    ) {
        return value;
    }

    return 60000;
}

function workerEnabled() {
    return [
        "true",
        "1",
        "yes",
        "on",
    ].includes(
        String(
            process.env
                .SYSTEM_WORKER_ENABLED ??
            "true"
        ).toLowerCase()
    );
}

let stopping =
    false;

let timer =
    null;

async function sleepAndRun() {
    if (stopping) {
        return;
    }

    timer =
        setTimeout(
            runCycle,
            getInterval()
        );
}

async function runCycle() {
    if (stopping) {
        return;
    }

    const startedAt =
        new Date();

    console.log(
        `[worker] ciclo iniciado em ${startedAt.toISOString()}`
    );

    try {
        const result =
            await runSystemJobsCycle();

        console.log(
            "[worker] ciclo concluído",
            {
                startedAt:
                    result.startedAt,

                finishedAt:
                    result.finishedAt,

                maintenance:
                    result.maintenance,

                retentionScheduler:
                    result
                        .retentionScheduler,

                retentionExecutorEnabled:
                    result
                        .retentionExecutor
                        .enabled,

            }
        );
    } catch (error) {
        safeExceptionLog("system_worker_cycle", error);
    }

    /*
     * Só agenda o próximo ciclo
     * DEPOIS do atual terminar.
     *
     * Assim não há sobreposição dentro
     * deste worker.
     */
    await sleepAndRun();
}

async function shutdown(
    signal
) {
    if (stopping) {
        return;
    }

    stopping =
        true;

    console.log(
        `[worker] encerrando por ${signal}`
    );

    if (timer) {
        clearTimeout(
            timer
        );
    }

    try {
        await prisma.$disconnect();
    } catch (error) {
        safeExceptionLog("system_worker_disconnect", error);
    }

    process.exit(0);
}

process.on(
    "SIGINT",
    () =>
        shutdown("SIGINT")
);

process.on(
    "SIGTERM",
    () =>
        shutdown("SIGTERM")
);

if (!workerEnabled()) {
    console.log(
        "[worker] desativado por configuração."
    );

    process.exit(0);
}

/*
 * Executa imediatamente ao iniciar.
 */
runCycle();
