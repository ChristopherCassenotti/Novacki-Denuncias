const { safeExceptionLog } = require("../../utils/safeLog");
const {
    reportLegalHoldParamSchema,
    applyLegalHoldSchema,
    releaseLegalHoldSchema,
} = require(
    "./adminReportLegalHold.schema"
);

const {
    getLegalHold,
    applyLegalHold,
    releaseLegalHold,
} = require(
    "./adminReportLegalHold.service"
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

    safeExceptionLog(
        "admin_report_legal_hold",
        error
    );

    return res.status(500).json({
        message:
            fallback,
    });
}

async function getLegalHoldHandler(
    req,
    res
) {
    const params =
        reportLegalHoldParamSchema
            .safeParse(
                req.params
            );

    if (!params.success) {
        return res.status(400).json({
            message:
                "ID da denúncia inválido.",
        });
    }

    try {
        const legalHold =
            await getLegalHold(
                params.data.id
            );

        return res.status(200).json({
            data: {
                legalHold,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível consultar o bloqueio legal."
        );
    }
}

async function applyLegalHoldHandler(
    req,
    res
) {
    const params =
        reportLegalHoldParamSchema
            .safeParse(
                req.params
            );

    const body =
        applyLegalHoldSchema
            .safeParse(
                req.body
            );

    if (!params.success) {
        return res.status(400).json({
            message:
                "ID da denúncia inválido.",
        });
    }

    if (!body.success) {
        return res.status(400).json({
            message:
                "Motivo do bloqueio legal inválido.",
        });
    }

    try {
        const legalHold =
            await applyLegalHold(
                params.data.id,
                body.data.reason,
                req.auth.userId
            );

        return res.status(200).json({
            message:
                "Bloqueio legal aplicado com sucesso.",

            data: {
                legalHold,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível aplicar o bloqueio legal."
        );
    }
}

async function releaseLegalHoldHandler(
    req,
    res
) {
    const params =
        reportLegalHoldParamSchema
            .safeParse(
                req.params
            );

    const body =
        releaseLegalHoldSchema
            .safeParse(
                req.body
            );

    if (!params.success) {
        return res.status(400).json({
            message:
                "ID da denúncia inválido.",
        });
    }

    if (!body.success) {
        return res.status(400).json({
            message:
                "Motivo da remoção inválido.",
        });
    }

    try {
        const legalHold =
            await releaseLegalHold(
                params.data.id,
                body.data.reason,
                req.auth.userId
            );

        return res.status(200).json({
            message:
                "Bloqueio legal removido com sucesso.",

            data: {
                legalHold,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível remover o bloqueio legal."
        );
    }
}

module.exports = {
    getLegalHoldHandler,
    applyLegalHoldHandler,
    releaseLegalHoldHandler,
};
