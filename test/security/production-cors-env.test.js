const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const productionEnv = {
    ...process.env,
    NODE_ENV: "production",
    DB_HOST: "database.example.com",
    DB_PORT: "3306",
    DB_USER: "test_user",
    DB_PASS: "test_password_16_chars",
    DB_NAME: "test_database",
    CORS_ORIGINS: "http://localhost:5173",
    RATE_LIMIT_HMAC_KEY: "x".repeat(32),
    ADMIN_COOKIE_NAME: "admin_session",
    REPORTER_COOKIE_NAME: "reporter_session",
    COOKIE_SECURE: "true",
    COOKIE_SAME_SITE: "none",
    SYSTEM_WORKER_ENABLED: "false",
    RETENTION_SCHEDULER_ENABLED: "false",
    RETENTION_EXECUTOR_ENABLED: "false",
    ATTACHMENT_SCANNER_ENABLED: "false",
    MAX_ATTACHMENT_MB: "20",
};

function validateWith(corsAllowLocalhost) {
    return spawnSync(
        process.execPath,
        [
            "-e",
            "require('./src/config/validateEnv').validateEnv()",
        ],
        {
            cwd: process.cwd(),
            env: {
                ...productionEnv,
                CORS_ALLOW_LOCALHOST:
                    corsAllowLocalhost,
            },
            encoding: "utf8",
        }
    );
}

test(
    "permite localhost em produção somente com autorização explícita",
    () => {
        const allowed =
            validateWith("true");

        assert.equal(
            allowed.status,
            0,
            allowed.stderr
        );

        const denied =
            validateWith("false");

        assert.equal(
            denied.status,
            1
        );
    }
);
