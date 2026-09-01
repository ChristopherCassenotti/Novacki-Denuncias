const { safeExceptionLog } = require("../../utils/safeLog");
const {auditLogsQuerySchema,auditLogIdParamSchema} = require("./adminAuditLogs.schema");

const {listAuditLogs,getAuditLogById,} = require("./adminAuditLogs.service");

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

    safeExceptionLog("admin_audit_log", error);

    return res.status(500).json({
        message:
            fallback,
    });
}

async function listAuditLogsHandler(
    req,
    res
) {
    const validation =
        auditLogsQuerySchema.safeParse(
            req.query
        );

    if (!validation.success) {
        return res.status(400).json({
            message:
                "Filtros inválidos.",

            errors:
                formatValidationErrors(
                    validation.error
                ),
        });
    }

    try {
const result =
    await listAuditLogs(
        validation.data,
        req.auth.userId
    );

        return res.status(200).json({
            data:
                result,
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível carregar a auditoria."
        );
    }
}

async function getAuditLogHandler(
    req,
    res
) {
    const validation =
        auditLogIdParamSchema.safeParse(
            req.params
        );

    if (!validation.success) {
        return res.status(400).json({
            message:
                "ID de auditoria inválido.",
        });
    }

    try {
        const log =
    await getAuditLogById(
        validation.data.id,
        req.auth.userId
    );

        return res.status(200).json({
            data: {
                log,
            },
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Não foi possível carregar o registro de auditoria."
        );
    }
}

module.exports = {
    listAuditLogsHandler,
    getAuditLogHandler,
};
