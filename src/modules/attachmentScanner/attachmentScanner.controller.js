const { safeExceptionLog } = require("../../utils/safeLog");
const {
    attachmentIdParamSchema,
} = require(
    "./attachmentScanner.schema"
);

const {
    scanAttachment,
    retryAttachmentScan,
    runAttachmentScannerBatch,
} = require(
    "./attachmentScanner.service"
);

async function scanAttachmentHandler(
    req,
    res
) {
    const validation =
        attachmentIdParamSchema
            .safeParse(
                req.params
            );

    if (!validation.success) {
        return res.status(400).json({
            message:
                "ID do anexo inválido.",
        });
    }

    try {
        const result =
            await scanAttachment(
                validation.data.id,
                req.auth.userId
            );

        return res.status(200).json({
            data:
                result,
        });
    } catch (error) {
        safeExceptionLog("attachment_scan", error);

        return res
            .status(
                error.statusCode ||
                500
            )
            .json({
                message:
                    error.statusCode
                        ? error.message
                        : "Não foi possível verificar o arquivo.",
            });
    }
}

async function retryAttachmentScanHandler(
    req,
    res
) {
    const validation =
        attachmentIdParamSchema
            .safeParse(
                req.params
            );

    if (!validation.success) {
        return res.status(400).json({
            message:
                "ID do anexo inválido.",
        });
    }

    try {
        const result =
            await retryAttachmentScan(
                validation.data.id,
                req.auth.userId
            );

        return res.status(200).json({
            message:
                "Nova verificação agendada.",

            data:
                result,
        });
    } catch (error) {
        return res
            .status(
                error.statusCode ||
                500
            )
            .json({
                message:
                    error.statusCode
                        ? error.message
                        : "Não foi possível reagendar a verificação.",
            });
    }
}

async function runAttachmentScannerHandler(
    req,
    res
) {
    try {
        const result =
            await runAttachmentScannerBatch({
                limit:
                    10,

                actorUserId:
                    req.auth.userId,
            });

        return res.status(200).json({
            message:
                "Scanner de anexos processado.",

            data:
                result,
        });
    } catch (error) {
        safeExceptionLog("attachment_scanner_batch", error);

        return res.status(500).json({
            message:
                "Não foi possível executar o scanner.",
        });
    }
}

module.exports = {
    scanAttachmentHandler,
    retryAttachmentScanHandler,
    runAttachmentScannerHandler,
};
