const { safeExceptionLog } = require("../../utils/safeLog");
const {
    executeRetention,
    runRetentionExecutorBatch,
} = require(
    "./retentionExecutor.service"
);

const {
    executionIdParamSchema,
} = require(
    "./retentionExecutor.schema"
);

async function executeRetentionHandler(
    req,
    res
) {
    const validation =
        executionIdParamSchema.safeParse(
            req.params
        );

    if (!validation.success) {
        return res.status(400).json({
            message:
                "ID da execução de retenção inválido.",
        });
    }

    try {
        const result =
            await executeRetention(
                validation.data.id,
                req.auth.userId
            );

        return res.status(200).json({
            data:
                result,
        });
    } catch (error) {
        safeExceptionLog("retention_execution", error);

        return res
            .status(
                error.statusCode ||
                500
            )
            .json({
                message:
                    error.statusCode
                        ? error.message
                        : "Não foi possível executar a retenção.",
            });
    }
}

async function runRetentionExecutorHandler(
    req,
    res
) {
    try {
        const result =
            await runRetentionExecutorBatch({
                limit: 20,
                actorUserId:
                    req.auth.userId,
            });

        return res.status(200).json({
            message:
                "Executor de retenção processado.",

            data:
                result,
        });
    } catch (error) {
        safeExceptionLog("retention_executor", error);

        return res.status(500).json({
            message:
                "Não foi possível executar o processamento de retenção.",
        });
    }
}

module.exports = {
    executeRetentionHandler,
    runRetentionExecutorHandler,
};
