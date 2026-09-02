const prisma =
    require(
        "../../database/prisma"
    );

const {
    getActorUnitScope,
} = require(
    "../access/unitScope.service"
);


function serviceError(
    message,
    statusCode
) {
    const error =
        new Error(message);

    error.statusCode =
        statusCode;

    return error;
}


async function assertRetentionExecutionWithinActorScope(
    actorUserId,
    executionId,
    database = prisma
) {
    const execution =
        await database
            .report_retention_executions
            .findUnique({
                where: {
                    id:
                        executionId,
                },

                select: {
                    id:
                        true,

                    unit_id:
                        true,
                },
            });

    if (!execution) {
        throw serviceError(
            "Execução de retenção não encontrada.",
            404
        );
    }

    const scope =
        await getActorUnitScope(
            actorUserId,
            database
        );

    if (
        scope.isAdminMaster
    ) {
        return execution;
    }

    /*
     * Execução antiga sem unidade não é
     * revelada para administrador regional.
     */
    if (
        !execution.unit_id ||
        !scope.unitIds.includes(
            execution.unit_id
        )
    ) {
        throw serviceError(
            "Execução de retenção não encontrada.",
            404
        );
    }

    return execution;
}


async function listRetentionExecutions(
    {
        page,
        limit,
        status,
        action,
        unitId,
    },
    actorUserId
) {
    const scope =
        await getActorUnitScope(
            actorUserId
        );

    const where = {};

    if (status) {
        where.status =
            status;
    }

    if (action) {
        where.action =
            action;
    }

    if (
        scope.isAdminMaster
    ) {
        if (unitId) {
            where.unit_id =
                unitId;
        }
    } else {
        if (
            scope.unitIds.length ===
            0
        ) {
            return {
                executions: [],

                pagination: {
                    page,
                    limit,
                    total:
                        0,

                    totalPages:
                        0,
                },
            };
        }

        if (
            unitId &&
            !scope.unitIds.includes(
                unitId
            )
        ) {
            return {
                executions: [],

                pagination: {
                    page,
                    limit,
                    total:
                        0,

                    totalPages:
                        0,
                },
            };
        }

        where.unit_id =
            unitId
                ? unitId
                : {
                    in:
                        scope.unitIds,
                };
    }

    const skip =
        (page - 1) *
        limit;

    const [
        total,
        executions,
    ] =
        await Promise.all([
            prisma
                .report_retention_executions
                .count({
                    where,
                }),

            prisma
                .report_retention_executions
                .findMany({
                    where,

                    skip,

                    take:
                        limit,

                    select: {
                        id:
                            true,

                        report_id:
                            true,

                        unit_id:
                            true,

                        report_protocol_snapshot:
                            true,

                        action:
                            true,

                        status:
                            true,

                        scheduled_at:
                            true,

                        started_at:
                            true,

                        completed_at:
                            true,

                        error_message:
                            true,

                        attempt_count:
                            true,

                        created_at:
                            true,
                    },

                    orderBy: [
                        {
                            scheduled_at:
                                "desc",
                        },

                        {
                            created_at:
                                "desc",
                        },
                    ],
                }),
        ]);

    const unitIds = [
        ...new Set(
            executions
                .map(
                    (item) =>
                        item.unit_id
                )
                .filter(Boolean)
        ),
    ];

    const units =
        unitIds.length
            ? await prisma
                .units
                .findMany({
                    where: {
                        id: {
                            in:
                                unitIds,
                        },
                    },

                    select: {
                        id:
                            true,

                        name:
                            true,

                        code:
                            true,
                    },
                })
            : [];

    const unitMap =
        new Map(
            units.map(
                (unit) => [
                    unit.id,
                    unit,
                ]
            )
        );

    return {
        executions:
            executions.map(
                (execution) => {
                    const unit =
                        execution.unit_id
                            ? unitMap.get(
                                execution.unit_id
                            )
                            : null;

                    return {
                        id:
                            execution.id,

                        reportId:
                            execution.report_id,

                        reportProtocol:
                            execution
                                .report_protocol_snapshot,

                        unit:
                            unit
                                ? {
                                    id:
                                        unit.id,

                                    name:
                                        unit.name,

                                    code:
                                        unit.code,
                                }
                                : null,

                        scheduledAt:
                            execution.scheduled_at,

                        action:
                            execution.action,

                        status:
                            execution.status,

                        attempts:
                            execution.attempt_count,

                        startedAt:
                            execution.started_at,

                        completedAt:
                            execution.completed_at,

                        error:
                            execution.error_message,

                        createdAt:
                            execution.created_at,
                    };
                }
            ),

        pagination: {
            page,
            limit,
            total,

            totalPages:
                total === 0
                    ? 0
                    : Math.ceil(
                        total /
                        limit
                    ),
        },
    };
}


module.exports = {
    listRetentionExecutions,
    assertRetentionExecutionWithinActorScope,
};