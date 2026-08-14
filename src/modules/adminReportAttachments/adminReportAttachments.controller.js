const {
    reportIdParamSchema,
} = require(
    "../adminReports/adminReports.schema"
);

const {
    listAttachments,
    createAttachment,
} = require(
    "./adminReportAttachments.service"
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
        req.body.visibility ||
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

module.exports = {
    listAttachmentsHandler,
    createAttachmentHandler,
};