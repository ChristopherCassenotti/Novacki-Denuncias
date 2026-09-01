const prisma =
    require(
        "../../database/prisma"
    );

const {
    getActorUnitScope,
} = require(
    "../access/unitScope.service"
);


function createServiceError(
    message,
    statusCode
) {
    const error =
        new Error(message);

    error.statusCode =
        statusCode;

    return error;
}


function normalizeMetadata(
    value
) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    if (
        typeof value ===
        "object"
    ) {
        return value;
    }

    if (
        typeof value ===
        "string"
    ) {
        try {
            return JSON.parse(
                value
            );
        } catch {
            return null;
        }
    }

    return null;
}


const auditLogSelect = {
    id:
        true,

    actor_type:
        true,

    actor_user_id:
        true,

    action:
        true,

    entity_type:
        true,

    entity_id:
        true,

    success:
        true,

    request_id:
        true,

    metadata_json:
        true,

    created_at:
        true,

    audit_log_units: {
        select: {
            unit_id:
                true,
        },
    },
};


async function attachActors(
    logs
) {
    const actorIds = [
        ...new Set(
            logs
                .map(
                    (log) =>
                        log.actor_user_id
                )
                .filter(Boolean)
        ),
    ];

    if (!actorIds.length) {
        return new Map();
    }

    const users =
        await prisma.users.findMany({
            where: {
                id: {
                    in:
                        actorIds,
                },
            },

            select: {
                id:
                    true,

                name:
                    true,

                email:
                    true,
            },
        });

    return new Map(
        users.map(
            (user) => [
                user.id,
                user,
            ]
        )
    );
}


async function attachUnits(
    logs
) {
    const unitIds = [
        ...new Set(
            logs.flatMap(
                (log) =>
                    (
                        log.audit_log_units ??
                        []
                    ).map(
                        (item) =>
                            item.unit_id
                    )
            )
        ),
    ];

    if (!unitIds.length) {
        return new Map();
    }

    const units =
        await prisma.units.findMany({
            where: {
                id: {
                    in:
                        unitIds,
                },
            },

            select: {
                id:
                    true,

                code:
                    true,

                name:
                    true,
            },
        });

    return new Map(
        units.map(
            (unit) => [
                unit.id,
                unit,
            ]
        )
    );
}


function serializeAuditLog(
    log,
    actor,
    unitMap,
    preferredUnitIds = []
) {
    const units =
        (
            log.audit_log_units ??
            []
        )
            .map(
                (assignment) =>
                    unitMap.get(
                        assignment.unit_id
                    )
            )
            .filter(Boolean)
            .map(
                (unit) => ({
                    id:
                        unit.id,

                    code:
                        unit.code,

                    name:
                        unit.name,
                })
            )
            .sort(
                (a, b) =>
                    a.name.localeCompare(
                        b.name,
                        "pt-BR"
                    )
            );

    const preferredSet =
        new Set(
            preferredUnitIds
        );

    /*
     * Isso é importante em movimentos.
     *
     * Exemplo:
     * M1 -> Monte Mor
     *
     * O mesmo log pode estar associado
     * às duas unidades, mas para Neide
     * mostramos M1; para Monte Mor,
     * mostramos Monte Mor.
     */
    const displayUnit =
        units.find(
            (unit) =>
                preferredSet.has(
                    unit.id
                )
        ) ??
        units[0] ??
        null;

    return {
        id:
            log.id.toString(),

        actorType:
            log.actor_type,

        actor:
            actor
                ? {
                    id:
                        actor.id,

                    name:
                        actor.name,

                    email:
                        actor.email,
                }
                : null,

        actorId:
            actor?.id ??
            null,

        actorName:
            actor?.name ??
            null,

        action:
            log.action,

        entityType:
            log.entity_type,

        entityId:
            log.entity_id,

        success:
            log.success,

        requestId:
            log.request_id,

        metadata:
            normalizeMetadata(
                log.metadata_json
            ),

        /*
         * O frontend atual usa "unit"
         * singular.
         */
        unit:
            displayUnit,

        /*
         * E já retornamos todas para
         * deixar o contrato preparado.
         */
        units,

        createdAt:
            log.created_at,
    };
}


function buildWhere({
    actorUserId,
    action,
    entityType,
    entityId,
    success,
    requestId,
    dateFrom,
    dateTo,
}) {
    const where = {};

    if (actorUserId) {
        where.actor_user_id =
            actorUserId;
    }

    if (action) {
        where.action =
            action;
    }

    if (entityType) {
        where.entity_type =
            entityType;
    }

    if (entityId) {
        where.entity_id =
            entityId;
    }

    if (
        success !==
        undefined
    ) {
        where.success =
            success;
    }

    if (requestId) {
        where.request_id =
            requestId;
    }

    if (
        dateFrom ||
        dateTo
    ) {
        where.created_at =
            {};

        if (dateFrom) {
            where.created_at.gte =
                new Date(
                    dateFrom
                );
        }

        if (dateTo) {
            where.created_at.lte =
                new Date(
                    dateTo
                );
        }
    }

    return where;
}


function emptyResult(
    page,
    limit
) {
    return {
        logs:
            [],

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


async function listAuditLogs(
    {
        page,
        limit,
        unitId,
        ...filters
    },
    actorUserId
) {
    const scope =
        await getActorUnitScope(
            actorUserId
        );

    const where =
        buildWhere(
            filters
        );

    let preferredUnitIds =
        [];

    if (
        scope.isAdminMaster
    ) {
        /*
         * Master pode ver logs globais.
         * Se filtrar por unidade,
         * mostramos só logs daquela
         * unidade.
         */
        if (unitId) {
            where.audit_log_units = {
                some: {
                    unit_id:
                        unitId,
                },
            };

            preferredUnitIds = [
                unitId,
            ];
        }
    } else {
        /*
         * Usuário regional sem unidade
         * não recebe auditoria alguma.
         */
        if (
            scope.unitIds.length ===
            0
        ) {
            return emptyResult(
                page,
                limit
            );
        }

        let effectiveUnitIds =
            scope.unitIds;

        if (unitId) {
            /*
             * Não revelamos se outra
             * unidade existe.
             * Apenas retornamos vazio.
             */
            if (
                !scope.unitIds.includes(
                    unitId
                )
            ) {
                return emptyResult(
                    page,
                    limit
                );
            }

            effectiveUnitIds = [
                unitId,
            ];
        }

        where.audit_log_units = {
            some: {
                unit_id: {
                    in:
                        effectiveUnitIds,
                },
            },
        };

        preferredUnitIds =
            effectiveUnitIds;
    }

    const skip =
        (page - 1) *
        limit;

    const [
        total,
        logs,
    ] =
        await Promise.all([
            prisma.audit_logs.count({
                where,
            }),

            prisma.audit_logs.findMany({
                where,

                skip,

                take:
                    limit,

                select:
                    auditLogSelect,

                orderBy: [
                    {
                        created_at:
                            "desc",
                    },

                    {
                        id:
                            "desc",
                    },
                ],
            }),
        ]);

    const [
        actors,
        unitMap,
    ] =
        await Promise.all([
            attachActors(
                logs
            ),

            attachUnits(
                logs
            ),
        ]);

    return {
        logs:
            logs.map(
                (log) =>
                    serializeAuditLog(
                        log,

                        log.actor_user_id
                            ? actors.get(
                                log.actor_user_id
                            ) ??
                            null
                            : null,

                        unitMap,

                        preferredUnitIds
                    )
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


async function getAuditLogById(
    id,
    actorUserId
) {
    const scope =
        await getActorUnitScope(
            actorUserId
        );

    const auditId =
        BigInt(id);

    const where = {
        id:
            auditId,
    };

    let preferredUnitIds =
        [];

    if (
        !scope.isAdminMaster
    ) {
        if (
            scope.unitIds.length ===
            0
        ) {
            throw createServiceError(
                "Registro de auditoria não encontrado.",
                404
            );
        }

        where.audit_log_units = {
            some: {
                unit_id: {
                    in:
                        scope.unitIds,
                },
            },
        };

        preferredUnitIds =
            scope.unitIds;
    }

    /*
     * findFirst porque estamos combinando
     * ID + escopo regional.
     */
    const log =
        await prisma.audit_logs.findFirst({
            where,

            select:
                auditLogSelect,
        });

    if (!log) {
        throw createServiceError(
            "Registro de auditoria não encontrado.",
            404
        );
    }

    const [
        actors,
        unitMap,
    ] =
        await Promise.all([
            attachActors([
                log,
            ]),

            attachUnits([
                log,
            ]),
        ]);

    const actor =
        log.actor_user_id
            ? actors.get(
                log.actor_user_id
            ) ??
            null
            : null;

    return serializeAuditLog(
        log,
        actor,
        unitMap,
        preferredUnitIds
    );
}


module.exports = {
    listAuditLogs,
    getAuditLogById,
};