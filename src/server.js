require('dotenv/config');
const app =
    require("./app");

const prisma =
    require(
        "./database/prisma"
    );
const {
    validateEnv,
} = require(
    "./config/validateEnv"
);
const {
    safeErrorLog,
    safeExceptionLog,
} = require("./utils/safeLog");

validateEnv();
const PORT =
    Number(
        process.env.PORT ||
        3000
    );

const server =
    app.listen(
        PORT,
        () => {
            console.log(
                `API iniciada na porta ${PORT}.`
            );
        }
    );

let shuttingDown =
    false;

async function shutdown(
    signal
) {
    if (
        shuttingDown
    ) {
        return;
    }

    shuttingDown =
        true;

    console.log(
        `Encerrando aplicação: ${signal}`
    );

    const forceShutdown =
        setTimeout(
            () => {
                safeErrorLog({
                    level: "error",
                    context: "forced_shutdown_timeout",
                });

                process.exit(1);
            },
            10000
        );

    forceShutdown.unref();

    server.close(
        async () => {
            try {
                await prisma
                    .$disconnect();

                clearTimeout(
                    forceShutdown
                );

                process.exit(0);
            } catch {
                process.exit(1);
            }
        }
    );
}

process.on(
    "SIGINT",
    () =>
        shutdown(
            "SIGINT"
        )
);

process.on(
    "SIGTERM",
    () =>
        shutdown(
            "SIGTERM"
        )
);

process.on(
    "uncaughtException",
    (error) => {
        safeExceptionLog(
            "uncaught_exception",
            error
        );

        shutdown(
            "UNCAUGHT_EXCEPTION"
        );
    }
);

process.on(
    "unhandledRejection",
    (reason) => {
        safeExceptionLog(
            "unhandled_rejection",
            reason
        );

        shutdown(
            "UNHANDLED_REJECTION"
        );
    }
);
