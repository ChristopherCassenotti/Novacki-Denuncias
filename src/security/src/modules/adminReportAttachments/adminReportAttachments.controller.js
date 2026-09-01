const { safeExceptionLog } = require("../../utils/safeLog");
const {
    reportIdParamSchema,
} = require(
    "../adminReports/adminReports.schema"
);

const {
    listAttachments,
    createAttachment,
    prepareAttachmentDownload,
} = require(
    "./adminReportAttachments.service"
);
const {
    pipeline,
} = require(
    "node:stream/promises"
);

const {
    attachmentParamSchema,
} = require(
    "./adminReportAttachments.schema"
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
        "admin_report_attachment",
        error
    );

    return res.status(500).json({
        message:
            fallback,
    });
}

async function listAttachmentsHandler(
    req,
    res
) {
    const params =
        reportIdParamSchema.safeParse(
            req.params
        );

    if (!params.success) {
        return res.status(400).json({
            message:
                "ID da denúncia inválido.",
        });
    }

    try {
        const attachments =
            await listAttachments(
                params.data.id
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

async function createAttachmentHandler(
    req,
    res
) {
    const params =
        reportIdParamSchema.safeParse(
            req.params
        );

    if (!params.success) {
        return res.status(400).json({
            message:
                "ID da denúncia inválido.",
        });
    }

    const visibility =
        req.body?.visibility ||
        "ADMIN_ONLY";

    if (
        ![
            "ADMIN_ONLY",
            "REPORTER_AND_ADMIN",
        ].includes(
            visibility
        )
    ) {
        return res.status(400).json({
            message:
                "Visibilidade inválida.",
        });
    }

    try {
        const attachment =
            await createAttachment(
                params.data.id,
                {
                    file:
                        req.file,

                    visibility,
                },
                req.auth.userId
            );

        return res.status(201).json({
            message:
                "Anexo adicionado com sucesso.",

            data: {
                attachment,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível adicionar o anexo."
        );
    }
}
function sanitizeDownloadFilename(
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

function buildContentDisposition(
    filename
) {
    const safeFilename =
        sanitizeDownloadFilename(
            filename
        );

    const asciiFallback =
        safeFilename.replace(
            /[^\x20-\x7E]/g,
            "_"
        );

    const encoded =
        encodeURIComponent(
            safeFilename
        );

    return (
        `attachment; ` +
        `filename="${asciiFallback}"; ` +
        `filename*=UTF-8''${encoded}`
    );
}

async function downloadAttachmentHandler(
    req,
    res
) {
    const params =
        attachmentParamSchema.safeParse(
            req.params
        );

    if (!params.success) {
        return res.status(400).json({
            message:
                "Parâmetros inválidos.",
        });
    }

    try {
        const download =
            await prepareAttachmentDownload(
                params.data.id,
                params.data.attachmentId,
                req.auth.userId
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
            buildContentDisposition(
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
            "admin_report_attachment_stream",
            error
        );

        return res.destroy();
    }
}
module.exports = {
    listAttachmentsHandler,
    createAttachmentHandler,
    downloadAttachmentHandler,
};
