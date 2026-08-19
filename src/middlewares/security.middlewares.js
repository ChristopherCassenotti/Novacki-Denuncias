const {
    randomUUID,
    createHmac,
} = require("node:crypto");

const helmet =
    require("helmet");

const cors =
    require("cors");

const {
    rateLimit,
    ipKeyGenerator,
} = require(
    "express-rate-limit"
);

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

function parseOrigins() {
    return new Set(
        String(
            process.env
                .CORS_ORIGINS ||
            ""
        )
            .split(",")
            .map(
                (value) =>
                    value.trim()
            )
            .filter(Boolean)
    );
}

function requestIdMiddleware(
    req,
    res,
    next
) {
    const requestId =
        randomUUID();

    req.requestId =
        requestId;

    res.setHeader(
        "X-Request-Id",
        requestId
    );

    next();
}

function createSecurityHeaders() {
    const isProduction =
        process.env.NODE_ENV ===
        "production";

    const options = {
        contentSecurityPolicy: {
            directives: {
                "default-src": [
                    "'none'",
                ],

                "base-uri": [
                    "'none'",
                ],

                "frame-ancestors": [
                    "'none'",
                ],

                /*
                 * Evita problema de localhost
                 * sendo atualizado para HTTPS
                 * durante desenvolvimento.
                 */
                "upgrade-insecure-requests":
                    isProduction
                        ? []
                        : null,
            },
        },

        referrerPolicy: {
            policy:
                "no-referrer",
        },

        frameguard: {
            action:
                "deny",
        },
    };

    if (!isProduction) {
        options
            .strictTransportSecurity =
            false;
    }

    const helmetMiddleware =
        helmet(
            options
        );

    return function securityHeaders(
        req,
        res,
        next
    ) {
        res.setHeader(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()"
        );

        return helmetMiddleware(
            req,
            res,
            next
        );
    };
}

function createCorsMiddleware() {
    const allowedOrigins =
        parseOrigins();

    return cors({
        origin(
            origin,
            callback
        ) {
            /*
             * Requisições sem Origin:
             *
             * Postman
             * curl
             * comunicação servidor-servidor
             */
            if (!origin) {
                return callback(
                    null,
                    true
                );
            }

            if (
                allowedOrigins.has(
                    origin
                )
            ) {
                return callback(
                    null,
                    true
                );
            }

            const error =
                new Error(
                    "Origem não permitida."
                );

            error.statusCode =
                403;

            error.code =
                "CORS_NOT_ALLOWED";

            return callback(
                error
            );
        },

        credentials:
            true,

        methods: [
            "GET",
            "POST",
            "PATCH",
            "DELETE",
            "OPTIONS",
        ],

        maxAge:
            600,
    });
}

function noStoreMiddleware(
    req,
    res,
    next
) {
    res.setHeader(
        "Cache-Control",
        "no-store, max-age=0"
    );

    res.setHeader(
        "Pragma",
        "no-cache"
    );

    next();
}

function normalizedClientAddress(
    req
) {
    const address =
        req.ip ||
        req.socket
            ?.remoteAddress ||
        "0.0.0.0";

    return ipKeyGenerator(
        address,
        56
    );
}

function hmacKey(
    value
) {
    const secret =
        process.env
            .RATE_LIMIT_HMAC_KEY;

    if (
        !secret ||
        secret.length < 32
    ) {
        throw new Error(
            "RATE_LIMIT_HMAC_KEY ausente ou muito curta."
        );
    }

    return createHmac(
        "sha256",
        secret
    )
        .update(
            String(value)
        )
        .digest("hex");
}

function anonymousClientKey(
    req
) {
    return hmacKey(
        normalizedClientAddress(
            req
        )
    );
}

function loginClientKey(
    req
) {
    const identifier =
        String(
            req.body?.email ||
            ""
        )
            .trim()
            .toLowerCase();

    return hmacKey(
        [
            normalizedClientAddress(
                req
            ),
            identifier,
        ].join("|")
    );
}

function createLimiter({
    windowMs,
    limit,
    keyGenerator,
    message,
}) {
    return rateLimit({
        windowMs,

        limit,

        keyGenerator,

        standardHeaders:
            "draft-8",

        legacyHeaders:
            false,

        handler(
            req,
            res
        ) {
            return res
                .status(429)
                .json({
                    message,

                    requestId:
                        req
                            .requestId,
                });
        },
    });
}

const generalApiLimiter =
    createLimiter({
        windowMs:
            15 *
            60 *
            1000,

        limit:
            envInteger(
                "RATE_LIMIT_GENERAL_MAX",
                300
            ),

        keyGenerator:
            anonymousClientKey,

        message:
            "Muitas requisições. Tente novamente mais tarde.",
    });

const credentialActionRateLimiter =
    createLimiter({
        windowMs:
            envInteger(
                "CREDENTIAL_RATE_LIMIT_WINDOW_MS",
                15 *
                    60 *
                    1000
            ),

        limit:
            envInteger(
                "CREDENTIAL_RATE_LIMIT_MAX",
                10
            ),

        keyGenerator:
            anonymousClientKey,

        message:
            "Muitas tentativas de alteração de credencial. Tente novamente mais tarde.",
    });

const adminLoginLimiter =
    createLimiter({
        windowMs:
            15 *
            60 *
            1000,

        limit:
            envInteger(
                "RATE_LIMIT_LOGIN_MAX",
                10
            ),

        keyGenerator:
            loginClientKey,

        message:
            "Muitas tentativas de acesso. Aguarde antes de tentar novamente.",
    });

const publicReportCreateLimiter =
    createLimiter({
        windowMs:
            60 *
            60 *
            1000,

        limit:
            envInteger(
                "RATE_LIMIT_PUBLIC_CREATE_MAX",
                5
            ),

        keyGenerator:
            anonymousClientKey,

        message:
            "Limite temporário de envios atingido. Tente novamente mais tarde.",
    });

const reportAccessLimiter =
    createLimiter({
        windowMs:
            15 *
            60 *
            1000,

        limit:
            envInteger(
                "RATE_LIMIT_REPORT_ACCESS_MAX",
                20
            ),

        keyGenerator:
            anonymousClientKey,

        message:
            "Muitas tentativas de consulta. Aguarde antes de tentar novamente.",
    });

module.exports = {
    requestIdMiddleware,
    createSecurityHeaders,
    createCorsMiddleware,
    noStoreMiddleware,

    generalApiLimiter,
    credentialActionRateLimiter,
    adminLoginLimiter,
    publicReportCreateLimiter,
    reportAccessLimiter,
};
