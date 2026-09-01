const express =
    require("express");

const prisma =
    require(
        "../../database/prisma"
    );

const router =
    express.Router();

router.get(
    "/health",
    (
        req,
        res
    ) => {
        return res.json({
            status:
                "ok",
        });
    }
);

router.get(
    "/ready",
    async (
        req,
        res
    ) => {
        try {
            await prisma
                .$queryRaw`
                    SELECT 1
                `;

            return res.json({
                status:
                    "ready",
            });
        } catch {
            return res
                .status(503)
                .json({
                    status:
                        "unavailable",
                });
        }
    }
);

module.exports =
    router;