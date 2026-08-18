const {
    scheduleRetentionForReport,
    scheduleRetentionBatch,
} = require(
    "./retentionScheduler.service"
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

    console.error(
        fallback,
        error
    );

    return res.status(500).json({
        message:
            fallback,
    });
}

async function scheduleReportHandler(
    req,
    res
) {
    try {
        const result =
            await scheduleRetentionForReport(
                req.params.id
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