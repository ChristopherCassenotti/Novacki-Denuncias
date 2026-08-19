function normalizeOrigin(
    value
) {
    try {
        return new URL(
            value
        ).origin;
    } catch {
        return null;
    }
}

function allowedOrigins() {
    return new Set(
        String(
            process.env
                .CORS_ORIGINS ||
            ""
        )
            .split(",")
            .map(
                (value) =>
                    normalizeOrigin(
                        value.trim()
                    )
            )
            .filter(Boolean)
    );
}

function requireTrustedOrigin(
    req,
    res,
    next
) {
    /*
     * Métodos seguros não precisam
     * da proteção CSRF por Origin.
     */
    if (
        [
            "GET",
            "HEAD",
            "OPTIONS",
        ].includes(
            req.method
        )
    ) {
        return next();
    }

    const origins =
        allowedOrigins();

    const originHeader =
        req.get(
            "Origin"
        );

    if (originHeader) {
        const normalized =
            normalizeOrigin(
                originHeader
            );

        if (
            normalized &&
            origins.has(
                normalized
            )
        ) {
            return next();
        }

        return res
            .status(403)
            .json({
                message:
                    "Origem da requisição não autorizada.",

                requestId:
                    req.requestId,
            });
    }

    /*
     * Alguns navegadores ou fluxos podem
     * não enviar Origin.
     *
     * Usamos Referer como fallback.
     */
    const referer =
        req.get(
            "Referer"
        );

    if (referer) {
        const normalized =
            normalizeOrigin(
                referer
            );

        if (
            normalized &&
            origins.has(
                normalized
            )
        ) {
            return next();
        }
    }

    /*
     * Requisição autenticada por cookie
     * sem Origin/Referer não é aceita.
     */
    return res
        .status(403)
        .json({
            message:
                "Origem da requisição não pôde ser validada.",

            requestId:
                req.requestId,
        });
}

module.exports = {
    requireTrustedOrigin,
};