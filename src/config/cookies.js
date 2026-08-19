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

function envPositiveInteger(
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

function getSameSite() {
    const value =
        String(
            process.env
                .COOKIE_SAME_SITE ||
            "lax"
        )
            .toLowerCase();

    if (
        ![
            "strict",
            "lax",
            "none",
        ].includes(value)
    ) {
        return "lax";
    }

    return value;
}

function baseCookieOptions() {
    const secure =
        envBoolean(
            "COOKIE_SECURE",
            process.env.NODE_ENV ===
                "production"
        );

    const sameSite =
        getSameSite();

    if (
        sameSite === "none" &&
        !secure
    ) {
        throw new Error(
            "COOKIE_SAME_SITE=none exige COOKIE_SECURE=true."
        );
    }

    return {
        httpOnly:
            true,

        secure,

        sameSite,

        path:
            "/",
    };
}

function adminCookieOptions() {
    return {
        ...baseCookieOptions(),
    };
}

function reporterCookieOptions() {
    return {
        ...baseCookieOptions(),

        path:
            "/api/public/reports",
    };
}

function reporterCookieName() {
    return process.env
        .REPORTER_COOKIE_NAME ||
        "nvk_reporter_session";
}

function reporterSessionDurationMs() {
    return envPositiveInteger(
        "REPORTER_SESSION_DURATION_MS",
        60 * 60 * 1000
    );
}

module.exports = {
    adminCookieOptions,
    reporterCookieOptions,
    reporterCookieName,
    reporterSessionDurationMs,
};
