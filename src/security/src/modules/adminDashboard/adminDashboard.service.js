const prisma =
    require(
        "../../database/prisma"
    );

const {
    getReportListAccess,
} = require(
    "../access/reportCapability.service"
);

function createDateFilter({
    dateFrom,
    dateTo,
}) {
    if (
        !dateFrom &&
        !dateTo
    ) {
        return undefined;
    }

    const createdAt = {};

    if (dateFrom) {
        createdAt.gte =
            new Date(
                dateFrom
            );
    }

    if (dateTo) {
        createdAt.lte =
            new Date(
                dateTo
            );
    }

    return createdAt;
}

async function buildDashboardWhere(
    actorUserId,
    filters
) {
    const access =
        await getReportListAccess(
            actorUserId
        );

    const where = {};

    /*
     * Controle de acesso.
     */
    if (access.global) {
        if (
            access
                .restrictedReportIds
                .length > 0
        ) {
            where.id = {
                notIn:
                    access
                        .restrictedReportIds,
            };
        }
    } else {
        where.id = {
            in:
                access
                    .grantedReportIds,
        };
    }

    const createdAt =
        createDateFilter(
            filters
        );

    if (createdAt) {
        where.created_at =
            createdAt;
    }

    return where;
}

async function attachCategoryNames(
    groups
) {
    const ids =
        groups
            .map(
                (item) =>
                    item.category_id
            )
            .filter(Boolean);

    if (!ids.length) {
        return [];
    }

    const categories =
        await prisma.report_categories.findMany({
            where: {
                id: {
                    in: ids,
                },
            },

            select: {
                id: true,
                name: true,
            },
        });

    const map =
        new Map(
            categories.map(
                (category) => [
                    category.id,
                    category.name,
                ]
            )
        );

    return groups.map(
        (item) => ({
            categoryId:
                item.category_id,

            categoryName:
                map.get(
                    item.category_id
                ) || null,

            total:
                item._count
                    ._all,
        })
    );
}

async function attachUnitNames(
    groups
) {
    const ids =
        groups
            .map(
                (item) =>
                    item.unit_id
            )
            .filter(Boolean);

    const units =
        ids.length
            ? await prisma.units.findMany({
                where: {
                    id: {
                        in: ids,
                    },
                },

                select: {
                    id: true,
                    name: true,
                },
            })
            : [];

    const map =
        new Map(
            units.map(
                (unit) => [
                    unit.id,
                    unit.name,
                ]
            )
        );

    return groups.map(
        (item) => ({
            unitId:
                item.unit_id,

            unitName:
                item.unit_id
                    ? map.get(
                        item.unit_id
                    ) || null
                    : "Não informada",

            total:
                item._count
                    ._all,
        })
    );
}

async function getAdminDashboard(
    filters,
    actorUserId
) {
    const where =
        await buildDashboardWhere(
            actorUserId,
            filters
        );

    const [
        total,
        immediateRisk,
        byStatusRaw,
        byPriorityRaw,
        byModeRaw,
        byCategoryRaw,
        byUnitRaw,
    ] =
        await Promise.all([
            prisma.reports.count({
                where,
            }),

            prisma.reports.count({
                where: {
                    ...where,

                    immediate_risk:
                        true,
                },
            }),

            prisma.reports.groupBy({
                by: [
                    "status",
                ],

                where,

                _count: {
                    _all:
                        true,
                },
            }),

            prisma.reports.groupBy({
                by: [
                    "priority",
                ],

                where,

                _count: {
                    _all:
                        true,
                },
            }),

            prisma.reports.groupBy({
                by: [
                    "mode",
                ],

                where,

                _count: {
                    _all:
                        true,
                },
            }),

            prisma.reports.groupBy({
                by: [
                    "category_id",
                ],

                where,

                _count: {
                    _all:
                        true,
                },
            }),

            prisma.reports.groupBy({
                by: [
                    "unit_id",
                ],

                where,

                _count: {
                    _all:
                        true,
                },
            }),
        ]);

    const statusMap =
        new Map(
            byStatusRaw.map(
                (item) => [
                    item.status,
                    item._count
                        ._all,
                ]
            )
        );

    const concluded =
        statusMap.get(
            "CONCLUDED"
        ) || 0;

    const archived =
        statusMap.get(
            "ARCHIVED"
        ) || 0;

    const open =
        total -
        concluded -
        archived;

    const byStatus =
        byStatusRaw.map(
            (item) => ({
                status:
                    item.status,

                total:
                    item._count
                        ._all,
            })
        );

    const byPriority =
        byPriorityRaw.map(
            (item) => ({
                priority:
                    item.priority,

                total:
                    item._count
                        ._all,
            })
        );

    const byMode =
        byModeRaw.map(
            (item) => ({
                mode:
                    item.mode,

                total:
                    item._count
                        ._all,
            })
        );

    const [
        byCategory,
        byUnit,
    ] =
        await Promise.all([
            attachCategoryNames(
                byCategoryRaw
            ),

            attachUnitNames(
                byUnitRaw
            ),
        ]);

    return {
        period: {
            dateFrom:
                filters
                    .dateFrom ||
                null,

            dateTo:
                filters
                    .dateTo ||
                null,
        },

        summary: {
            total,
            open,
            concluded,
            archived,
            immediateRisk,
        },

        byStatus,
        byPriority,
        byMode,
        byCategory,
        byUnit,
    };
}

module.exports = {
    getAdminDashboard,
};