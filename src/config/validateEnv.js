const { z } = require("zod");
const { safeErrorLog } = require("../utils/safeLog");

const envSchema = z.object({
    NODE_ENV: z
        .enum([
            "development",
            "test",
            "production",
        ])
        .default("development"),

    DB_HOST: z.string().min(1),

    DB_PORT: z.coerce
        .number()
        .int()
        .positive(),

    DB_USER: z.string().min(1),

    DB_PASS: z.string().min(1),

    DB_NAME: z.string().min(1),

    CORS_ORIGINS: z.string().min(1),

    RATE_LIMIT_HMAC_KEY:
        z.string().min(32),

    ADMIN_COOKIE_NAME:
        z.string().min(3),

    REPORTER_COOKIE_NAME:
        z.string().min(3),

    COOKIE_SECURE:
        z.enum([
            "true",
            "false",
        ]),

    COOKIE_SAME_SITE:
        z.enum([
            "strict",
            "lax",
            "none",
        ]),

    SYSTEM_WORKER_ENABLED:
        z.enum([
            "true",
            "false",
        ]),

    RETENTION_SCHEDULER_ENABLED:
        z.enum([
            "true",
            "false",
        ]),

    RETENTION_EXECUTOR_ENABLED:
        z.enum([
            "true",
            "false",
        ]),

    ATTACHMENT_SCANNER_ENABLED:
        z.enum([
            "true",
            "false",
        ]),

    MAX_ATTACHMENT_MB:
        z.coerce
            .number()
            .positive()
            .max(100),
    R2_PURGE_MAX_ATTEMPTS:
    z.coerce
        .number()
        .int()
        .min(1)
        .max(20)
        .default(8),

R2_PURGE_RETRY_BASE_MS:
    z.coerce
        .number()
        .int()
        .min(10000)
        .default(60000),

R2_PURGE_RETRY_MAX_MS:
    z.coerce
        .number()
        .int()
        .min(60000)
        .default(3600000),
});

function validateEnv() {
    const result =
        envSchema.safeParse(
            process.env
        );

    if (!result.success) {
        safeErrorLog({
            level: "error",
            context: "environment_validation",
            issues:
                result.error.issues.map(
                    (issue) => ({
                        field:
                            issue.path.join("."),
                        code:
                            issue.code,
                    })
                ),
        });

        process.exit(1);
    }

    const env =
        result.data;

    if (
        env.NODE_ENV ===
        "production"
    ) {
        if (
            env.COOKIE_SECURE !==
            "true"
        ) {
            safeErrorLog({
                level: "error",
                context: "production_cookie_secure_validation",
            });

            process.exit(1);
        }

        if (
            env.CORS_ORIGINS
                .includes(
                    "localhost"
                )
        ) {
            safeErrorLog({
                level: "error",
                context: "production_cors_origin_validation",
            });

            process.exit(1);
        }
    }

    if (
        env.COOKIE_SAME_SITE ===
            "none" &&
        env.COOKIE_SECURE !==
            "true"
    ) {
        safeErrorLog({
            level: "error",
            context: "cookie_same_site_validation",
        });

        process.exit(1);
    }

    return env;
}

module.exports = {
    validateEnv,
};
