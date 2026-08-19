const { safeExceptionLog } = require("../../utils/safeLog");
const {
    pipeline,
} = require(
    "node:stream/promises"
);

const {
    attachmentIdParamSchema,
    uploadAttachmentBodySchema,
} = require(
    "./publicReportAttachments.schema"
);

const {
    listReporterAttachments,
    createReporterAttachment,
    prepareReporterAttachmentDownload,
} = require(
    "./publicReportAttachments.service"
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
        "reporter_attachment",
        error
    );

    return res.status(500).json({
        message:
            fallback,
    });
}

function sanitizeFilename(
    filename
) {
    return String(
        filename || "arquivo"
    )
        .replace(
            /[\r\n]/g,
            ""
        )
        .replace(
            /[\\/:*?"<>|]/g,
            "_"
        )
        .slice(
            0,
            180
        );
}

function contentDisposition(
    filename
) {
    const safe =
        sanitizeFilename(
            filename
        );

    const ascii =
        safe.replace(
            /[^\x20-\x7E]/g,
            "_"
        );

    return (
        `attachment; ` +
        `filename="${ascii}"; ` +
        `filename*=UTF-8''${encodeURIComponent(
            safe
        )}`
    );
}

async function listReporterAttachmentsHandler(
    req,
    res
) {
    try {
        const reportId =
            req.reporterAuth.reportId;

        const attachments =
            await listReporterAttachments(
                reportId
            );

        return res.status(200).json({
            data: {
                attachments,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível carregar os anexos."
        );
    }
}

async function createReporterAttachmentHandler(
    req,
    res
) {
    /*
     * Multipart manda strings.
     */
    const validation =
        uploadAttachmentBodySchema.safeParse({
            messageId:
                req.body?.messageId ||
                null,
        });

    if (!validation.success) {
        return res.status(400).json({
            message:
                "Dados do anexo inválidos.",
        });
    }

    try {
        const reportId =
            req.reporterAuth.reportId;

        const attachment =
            await createReporterAttachment(
                reportId,
                {
                    file:
                        req.file,

                    messageId:
                        validation
                            .data
                            .messageId,
                }
            );

        return res.status(201).json({
            message:
                "Anexo enviado com sucesso.",

            data: {
                attachment,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível enviar o anexo."
        );
    }
}

async function downloadReporterAttachmentHandler(
    req,
    res
) {
    const validation =
        attachmentIdParamSchema.safeParse(
            req.params
        );

    if (!validation.success) {
        return res.status(400).json({
            message:
                "ID do anexo inválido.",
        });
    }

    try {
        const reportId =
            req.reporterAuth.reportId;

        const download =
            await prepareReporterAttachmentDownload(
                reportId,
                validation
                    .data
                    .attachmentId
            );

        res.setHeader(
            "Cache-Control",
            "private, no-store, max-age=0"
        );

        res.setHeader(
            "Pragma",
            "no-cache"
        );

        res.setHeader(
            "X-Content-Type-Options",
            "nosniff"
        );

        res.setHeader(
            "Content-Type",
            download.mimeType ||
                "application/octet-stream"
        );

        res.setHeader(
            "Content-Length",
            download
                .sizeBytes
                .toString()
        );

        res.setHeader(
            "Content-Disposition",
            contentDisposition(
                download.originalName
            )
        );

        await pipeline(
            download.body,
            res
        );
    } catch (error) {
        if (
            !res.headersSent
        ) {
            return sendError(
                res,
                error,
                "Não foi possível baixar o anexo."
            );
        }

        safeExceptionLog(
            "reporter_attachment_stream",
            error
        );

        return res.destroy();
    }
}

module.exports = {
    listReporterAttachmentsHandler,
    createReporterAttachmentHandler,
    downloadReporterAttachmentHandler,
};
