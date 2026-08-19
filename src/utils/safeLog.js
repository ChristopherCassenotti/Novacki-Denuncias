const SENSITIVE_KEYS =
    new Set([
        "password",
        "passwordhash",
        "secret",
        "token",
        "authorization",
        "cookie",
        "protocol",
        "description",
        "message",
        "content",
        "identity",
        "email",
        "phone",
        "cpf",
    ]);

function redact(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return value;
    }

    if (
        Array.isArray(value)
    ) {
        return value.map(
            redact
        );
    }

    if (
        typeof value ===
        "object"
    ) {
        const sanitized =
            {};

        for (
            const [
                key,
                item,
            ] of Object.entries(
                value
            )
        ) {
            const normalized =
                key
                    .replace(
                        /[_-]/g,
                        ""
                    )
                    .toLowerCase();

            if (
                SENSITIVE_KEYS.has(
                    normalized
                )
            ) {
                sanitized[key] =
                    "[REDACTED]";
            } else {
                sanitized[key] =
                    redact(item);
            }
        }

        return sanitized;
    }

    return value;
}

function safeErrorLog(data) {
    console.error(
        redact(data)
    );
}

function safeExceptionLog(
    context,
    error,
    metadata = {}
) {
    const isErrorLike =
        error &&
        typeof error ===
            "object";

    safeErrorLog({
        ...metadata,

        level:
            "error",

        context,

        errorCode:
            isErrorLike
                ? error.code || null
                : null,

        errorName:
            isErrorLike
                ? error.name || "Error"
                : "UnknownError",

        errorMessage:
            process.env.NODE_ENV ===
                "development" &&
            isErrorLike &&
            typeof error.message ===
                "string"
                ? error.message
                : undefined,
    });
}

module.exports = {
    redact,
    safeErrorLog,
    safeExceptionLog,
};
