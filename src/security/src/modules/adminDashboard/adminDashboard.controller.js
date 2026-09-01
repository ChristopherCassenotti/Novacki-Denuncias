const { safeExceptionLog } = require("../../utils/safeLog");
const {
    dashboardQuerySchema,
} = require(
    "./adminDashboard.schema"
);

const {
    getAdminDashboard,
} = require(
    "./adminDashboard.service"
);

function formatErrors(
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

async function getDashboardHandler(
    req,
    res
) {
    const validation =
        dashboardQuerySchema.safeParse(
            req.query
        );

    if (!validation.success) {
        return res.status(400).json({
            message:
                "Filtros inválidos.",

            errors:
                formatErrors(
                    validation.error
                ),
        });
    }

    try {
        const dashboard =
            await getAdminDashboard(
                validation.data,
                req.auth.userId
            );

        return res.status(200).json({
            data:
                dashboard,
        });
    } catch (error) {
        safeExceptionLog("admin_dashboard", error);

        return res.status(500).json({
            message:
                "Não foi possível carregar o dashboard.",
        });
    }
}

module.exports = {
    getDashboardHandler,
};
