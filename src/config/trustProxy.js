function configureTrustProxy(
    app
) {
    const value =
        String(
            process.env
                .TRUST_PROXY ||
            "0"
        ).trim();

    if (
        value === "0" ||
        value.toLowerCase() ===
            "false"
    ) {
        app.set(
            "trust proxy",
            false
        );

        return;
    }

    if (
        /^\d+$/.test(
            value
        )
    ) {
        app.set(
            "trust proxy",
            Number(value)
        );

        return;
    }

    /*
     * Também suporta:
     *
     * loopback
     * loopback,uniquelocal
     * IP/subnet
     */
    app.set(
        "trust proxy",
        value
            .split(",")
            .map(
                (item) =>
                    item.trim()
            )
            .filter(Boolean)
    );
}

module.exports = {
    configureTrustProxy,
};