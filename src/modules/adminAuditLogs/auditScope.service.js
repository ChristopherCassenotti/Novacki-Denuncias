const prisma =
    require(
        "../../database/prisma"
    );


function uniqueUnitIds(
    unitIds
) {
    return [
        ...new Set(
            unitIds
                .filter(Boolean)
        ),
    ];
}


async function resolveEntityUnitIds(
    database,
    entityType,
    entityId
) {
    if (!entityId) {
        return [];
    }

    switch (entityType) {
        case "REPORT": {
            const report =
                await database.reports.findUnique({
                    where: {
                        id:
                            entityId,
                    },

                    select: {
                        unit_id:
                            true,
                    },
                });

            return report?.unit_id
                ? [
                    report.unit_id,
                ]
                : [];
        }


        case "USER": {
            const assignments =
                await database.user_units.findMany({
                    where: {
                        user_id:
                            entityId,
                    },

                    select: {
                        unit_id:
                            true,
                    },
                });

            return assignments.map(
                (item) =>
                    item.unit_id
            );
        }


        case "TEAM": {
            const assignments =
                await database.team_units.findMany({
                    where: {
                        team_id:
                            entityId,
                    },

                    select: {
                        unit_id:
                            true,
                    },
                });

            return assignments.map(
                (item) =>
                    item.unit_id
            );
        }


        case "UNIT": {
            const unit =
                await database.units.findUnique({
                    where: {
                        id:
                            entityId,
                    },

                    select: {
                        id:
                            true,

                        type:
                            true,
                    },
                });

            return (
                unit &&
                unit.type === "UNIT"
            )
                ? [
                    unit.id,
                ]
                : [];
        }


        case "ROUTING_RULE": {
            const rule =
                await database.routing_rules.findUnique({
                    where: {
                        id:
                            entityId,
                    },

                    select: {
                        unit_id:
                            true,
                    },
                });

            return rule?.unit_id
                ? [
                    rule.unit_id,
                ]
                : [];
        }


        default:
            /*
             * ROLE, autenticação,
             * jobs técnicos etc.
             *
             * Permanecem globais e,
             * portanto, serão visíveis
             * somente ao ADMIN_MASTER.
             */
            return [];
    }
}


async function createScopedAuditLog(
    database,
    data,
    extraUnitIds = []
) {
    const resolvedUnitIds =
        await resolveEntityUnitIds(
            database,
            data.entity_type,
            data.entity_id
        );

    const unitIds =
        uniqueUnitIds([
            ...resolvedUnitIds,
            ...extraUnitIds,
        ]);

    const log =
        await database.audit_logs.create({
            data,

            select: {
                id:
                    true,
            },
        });

    if (
        unitIds.length >
        0
    ) {
        await database.audit_log_units.createMany({
            data:
                unitIds.map(
                    (unitId) => ({
                        audit_log_id:
                            log.id,

                        unit_id:
                            unitId,
                    })
                ),

            skipDuplicates:
                true,
        });
    }

    return log;
}


module.exports = {
    resolveEntityUnitIds,
    createScopedAuditLog,
};