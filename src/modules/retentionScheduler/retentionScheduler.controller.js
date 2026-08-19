const { safeExceptionLog } = require("../../utils/safeLog");
const {
    scheduleRetentionForReport,
    scheduleRetentionBatch,
} = require(
    "./retentionScheduler.service"
);

const {
    reportIdParamSchema,
} = require(
    "./retentionScheduler.schema"
);

function sendError(
    res,
    error,
    fallback
) {
    if (
        Number.isInteger(
            error?.statusCode
        )
    ) {
        return res
            .status(
                error.statusCode
            )
            .json({
                message:
                    error.message,
            });
    }

    safeExceptionLog("retention_scheduler", error);

    return res.status(500).json({
        message:
            fallback,
    });
}

async function scheduleReportHandler(
    req,
    res
) {
    const validation =
        reportIdParamSchema.safeParse(
            req.params
        );

    if (!validation.success) {
        return res.status(400).json({
            message:
                "ID da denúncia inválido.",
        });
    }

    try {
        const result =
            await scheduleRetentionForReport(
                validation.data.id
            );

        return res.status(200).json({
            data:
                result,
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível agendar a retenção."
        );
    }
}

async function runRetentionSchedulerHandler(
    req,
    res
) {
    try {
        const result =
            await scheduleRetentionBatch({
                limit: 100,
            });

        return res.status(200).json({
            message:
                "Scheduler de retenção executado.",

            data:
                result,
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível executar o scheduler."
        );
    }
}

module.exports = {
    scheduleReportHandler,
    runRetentionSchedulerHandler,
};
