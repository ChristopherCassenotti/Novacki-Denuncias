const prisma =
    require(
        "../../database/prisma"
    );

const {
    createPublicReport,
} = require(
    "../reports/publicReport.service"
);

const {
    createInitialReporterAttachments,
} = require(
    "../publicReportAttachments/publicReportAttachments.service"
);

const {
    createPublicReportSchema,
} = require(
    "../reports/publicReport.schema"
);

function formatValidationErrors(
    error
) {
    return error.issues.map(
        (issue) => ({
            field:
                issue.path.join("."),

            message:
                issue.message,
        })
    );
}

async function createPublicReportWithAttachmentsHandler(
    req,
    res
) {
    let payload;

    /*
     * multipart/form-data não envia
     * objetos JSON diretamente.
     *
     * Então recebemos a denúncia em:
     * req.body.payload
     */
    try {
        payload =
            JSON.parse(
                req.body?.payload
            );
    } catch {
        return res.status(400).json({
            message:
                "Payload da denúncia inválido.",
        });
    }

    const validation =
        createPublicReportSchema.safeParse(
            payload
        );

    if (!validation.success) {
        return res.status(400).json({
            message:
                "Dados da denúncia inválidos.",

            errors:
                formatValidationErrors(
                    validation.error
                ),
        });
    }

    let reportId =
        null;

    try {
        /*
         * Usa exatamente o mesmo fluxo
         * de criação que já está testado.
         */
        const result =
            await createPublicReport(
                validation.data
            );

        reportId =
            result.reportId;

        const attachments =
            await createInitialReporterAttachments(
                reportId,
                req.files || []
            );

        return res.status(201).json({
            message:
                "Denúncia registrada com sucesso.",

            data: {
                protocol:
                    result.protocol,

                accessSecret:
                    result.accessSecret,

                createdAt:
                    result.createdAt,

                attachments:
                    attachments.map(
                        (attachment) => ({
                            id:
                                attachment.id,

                            originalName:
                                attachment.originalName,

                            scanStatus:
                                attachment.scanStatus,
                        })
                    ),
            },

            warning:
                "Guarde o protocolo e a chave secreta. A chave não poderá ser recuperada posteriormente.",
        });
    } catch (error) {
        /*
         * Se a denúncia já foi criada,
         * mas os anexos falharam antes
         * da resposta ser entregue,
         * removemos a denúncia inteira.
         *
         * As tabelas relacionadas usam
         * cascade.
         */
        if (reportId) {
            try {
                await prisma.reports.delete({
                    where: {
                        id:
                            reportId,
                    },
                });
            } catch (
                cleanupError
            ) {
                console.error(
                    "Erro ao desfazer denúncia após falha de anexos:",
                    cleanupError
                );
            }
        }

        console.error(
            "Erro ao registrar denúncia com anexos:",
            error
        );

        return res.status(
            error?.statusCode ||
            500
        ).json({
            message:
                error?.statusCode
                    ? error.message
                    : "Não foi possível registrar a denúncia.",
        });
    }
}

module.exports = {
    createPublicReportWithAttachmentsHandler,
};
