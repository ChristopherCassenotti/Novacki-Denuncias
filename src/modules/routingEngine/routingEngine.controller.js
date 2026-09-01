const { safeExceptionLog } = require("../../utils/safeLog");
const {
    routeReport,
} = require(
    "./routingEngine.service"
);
const {
    assertUserCanAccessReport,
} = require(
    "../adminReportRestrictions/reportAccess.service"
);
async function runHandler(
    req,
    res
) {
    try {
        await assertUserCanAccessReport(
            req.params.id,
            req.auth.userId
        );
        const result =
            await routeReport(
                req.params.id,
                "ADMIN_MANUAL_TEST"
            );

        return res.json({
            data:
                result,
        });
    } catch (error) {
        safeExceptionLog("routing_engine", error);

        return res
            .status(
                error.statusCode ||
                500
            )
            .json({
                message:
                    error.statusCode
                        ? error.message
                        : "Não foi possível executar o roteamento.",
            });
    }
}

module.exports = {
    runHandler,
};
