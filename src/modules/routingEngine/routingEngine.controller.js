const { safeExceptionLog } = require("../../utils/safeLog");
const {
    routeReport,
} = require(
    "./routingEngine.service"
);

async function runHandler(
    req,
    res
) {
    try {
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
