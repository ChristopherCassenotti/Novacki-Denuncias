const {
    randomUUID,
} = require(
    "node:crypto"
);

const prisma =
    require(
        "../../database/prisma"
    );

const {
    getActorUnitScope,
    assertUnitIdsWithinActorScope,
} = require(
    "../access/unitScope.service"
);

const {
    createScopedAuditLog,
} = require(
    "../adminAuditLogs/auditScope.service"
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


function isTransactionConflict(
    error
) {
    return [
        "P2034",
        "ER_LOCK_DEADLOCK",
        "ER_LOCK_WAIT_TIMEOUT",
        "1213",
        "1205",
    ].includes(
        String(
            error?.code ||
            error?.cause?.code ||
            ""
        )
    );
}


async function runPolicyTransaction(
    operation
) {
    try {
        return await prisma.$transaction(
            operation,
            {
                isolationLevel:
                    "Serializable",

                maxWait:
                    5_000,

                timeout:
                    15_000,
            }
        );
    } catch (error) {
        if (
            isTransactionConflict(
                error
            )
        ) {
            throw createServiceError(
                "A política foi alterada por outra requisição. Tente novamente.",
                409
            );
        }

        throw error;
    }
}


async function findPolicyOrFail(
    database,
    policyId
) {
    const policy =
        await database.retention_policies.findUnique({
            where: {
                id:
                    policyId,
            },
        });

    if (!policy) {
        throw createServiceError(
            "Política de retenção não encontrada.",
            404
        );
    }

    return policy;
}


async function validateCategory(
    database,
    categoryId
) {
    if (!categoryId) {
        return null;
    }

    const category =
        await database.report_categories.findUnique({
            where: {
                id:
                    categoryId,
            },

            select: {
                id:
                    true,

                name:
                    true,

                is_active:
                    true,
            },
        });

    if (
        !category ||
        !category.is_active
    ) {
        throw createServiceError(
            "Categoria não encontrada ou inativa.",
            400
        );
    }

    return category;
}


async function validateUnitIds(
    database,
    unitIds
) {
    const uniqueIds = [
        ...new Set(
            unitIds
        ),
    ];

    if (
        uniqueIds.length ===
        0
    ) {
        return [];
    }

    const units =
        await database.units.findMany({
            where: {
                id: {
                    in:
                        uniqueIds,
                },

                type:
                    "UNIT",

                is_active:
                    true,
            },

            select: {
                id:
                    true,
            },
        });

    if (
        units.length !==
        uniqueIds.length
    ) {
        throw createServiceError(
            "Uma ou mais unidades são inválidas ou estão inativas.",
            400
        );
    }

    return uniqueIds;
}


async function getPolicyUnitIds(
    database,
    policyId
) {
    const assignments =
        await database
            .retention_policy_units
            .findMany({
                where: {
                    policy_id:
                        policyId,
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


async function assertPolicyUnitsAllowed(
    actorUserId,
    unitIds,
    database = prisma
) {
    const scope =
        await getActorUnitScope(
            actorUserId,
            database
        );

    /*
     * Apenas master pode criar
     * política global.
     */
    if (
        !scope.isAdminMaster &&
        unitIds.length === 0
    ) {
        throw createServiceError(
            "A política precisa estar vinculada a pelo menos uma das suas unidades.",
            400
        );
    }

    await assertUnitIdsWithinActorScope(
        actorUserId,
        unitIds,
        database
    );

    return true;
}


async function assertPolicyManageable(
    actorUserId,
    policyId,
    database = prisma
) {
    const scope =
        await getActorUnitScope(
            actorUserId,
            database
        );

    if (
        scope.isAdminMaster
    ) {
        return true;
    }

    const unitIds =
        await getPolicyUnitIds(
            database,
            policyId
        );

    /*
     * Política global aparece para
     * consulta, mas só o master altera.
     */
    if (
        unitIds.length === 0
    ) {
        throw createServiceError(
            "Somente o Administrador Geral pode alterar uma política global.",
            403
        );
    }

    const actorUnits =
        new Set(
            scope.unitIds
        );

    const fullyInside =
        unitIds.every(
            (unitId) =>
                actorUnits.has(
                    unitId
                )
        );

    if (!fullyInside) {
        throw createServiceError(
            "Política de retenção não encontrada.",
            404
        );
    }

    return true;
}


async function policyVisibleToActor(
    actorUserId,
    policyId,
    database = prisma
) {
    const scope =
        await getActorUnitScope(
            actorUserId,
            database
        );

    if (
        scope.isAdminMaster
    ) {
        return true;
    }

    const unitIds =
        await getPolicyUnitIds(
            database,
            policyId
        );

    /*
     * Globais podem ser consultadas
     * pelo gerente.
     */
    if (
        unitIds.length === 0
    ) {
        return true;
    }

    const actorUnits =
        new Set(
            scope.unitIds
        );

    return unitIds.every(
        (unitId) =>
            actorUnits.has(
                unitId
            )
    );
}


async function ensureNoActiveConflict(
    database,
    {
        categoryId,
        appliesToStatus,
        unitIds,
        ignorePolicyId = null,
    }
) {
    const candidates =
        await database.retention_policies.findMany({
            where: {
                category_id:
                    categoryId ?? null,

                applies_to_status:
                    appliesToStatus,

                is_active:
                    true,

                ...(ignorePolicyId
                    ? {
                        id: {
                            not:
                                ignorePolicyId,
                        },
                    }
                    : {}),
            },

            select: {
                id:
                    true,

                name:
                    true,
            },
        });

    if (
        candidates.length ===
        0
    ) {
        return;
    }

    const candidateIds =
        candidates.map(
            (policy) =>
                policy.id
        );

    const assignments =
        await database
            .retention_policy_units
            .findMany({
                where: {
                    policy_id: {
                        in:
                            candidateIds,
                    },
                },

                select: {
                    policy_id:
                        true,

                    unit_id:
                        true,
                },
            });

    const unitsByPolicy =
        new Map();

    for (
        const assignment of assignments
    ) {
        if (
            !unitsByPolicy.has(
                assignment.policy_id
            )
        ) {
            unitsByPolicy.set(
                assignment.policy_id,
                []
            );
        }

        unitsByPolicy
            .get(
                assignment.policy_id
            )
            .push(
                assignment.unit_id
            );
    }

    /*
     * Uma global conflita apenas com
     * outra global de mesma categoria
     * e status.
     */
    if (
        unitIds.length ===
        0
    ) {
        const globalConflict =
            candidates.find(
                (policy) =>
                    (
                        unitsByPolicy.get(
                            policy.id
                        ) ??
                        []
                    ).length === 0
            );

        if (globalConflict) {
            throw createServiceError(
                "Já existe uma política global ativa para esta categoria e status.",
                409
            );
        }

        return;
    }

    const requestedUnits =
        new Set(
            unitIds
        );

    /*
     * Política regional pode coexistir
     * com a global.
     *
     * Mas duas regionais não podem
     * disputar a mesma unidade,
     * categoria e status.
     */
    const regionalConflict =
        candidates.find(
            (policy) => {
                const existingUnits =
                    unitsByPolicy.get(
                        policy.id
                    ) ??
                    [];

                if (
                    existingUnits.length ===
                    0
                ) {
                    return false;
                }

                return existingUnits.some(
                    (unitId) =>
                        requestedUnits.has(
                            unitId
                        )
                );
            }
        );

    if (regionalConflict) {
        throw createServiceError(
            "Já existe uma política ativa para uma das unidades selecionadas, nesta categoria e status.",
            409
        );
    }
}


async function loadUnits(
    database,
    unitIds
) {
    if (
        unitIds.length ===
        0
    ) {
        return [];
    }

    return database.units.findMany({
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

            is_active:
                true,
        },

        orderBy: {
            name:
                "asc",
        },
    });
}


function serializePolicy(
    policy,
    category = null,
    units = []
) {
    return {
        id:
            policy.id,

        name:
            policy.name,

        category:
            category
                ? {
                    id:
                        category.id,

                    name:
                        category.name,
                }
                : null,

        units:
            units.map(
                (unit) => ({
                    id:
                        unit.id,

                    code:
                        unit.code,

                    name:
                        unit.name,

                    isActive:
                        unit.is_active,
                })
            ),

        appliesToStatus:
            policy.applies_to_status,

        retentionDays:
            policy.retention_days,

        action:
            policy.action,

        isActive:
            policy.is_active,

        createdAt:
            policy.created_at,

        updatedAt:
            policy.updated_at,
    };
}


async function serializePolicyWithContext(
    database,
    policy
) {
    const [
        category,
        unitIds,
    ] =
        await Promise.all([
            policy.category_id
                ? database
                    .report_categories
                    .findUnique({
                        where: {
                            id:
                                policy.category_id,
                        },

                        select: {
                            id:
                                true,

                            name:
                                true,
                        },
                    })
                : null,

            getPolicyUnitIds(
                database,
                policy.id
            ),
        ]);

    const units =
        await loadUnits(
            database,
            unitIds
        );

    return serializePolicy(
        policy,
        category,
        units
    );
}


async function getPolicyById(
    policyId,
    actorUserId = null
) {
    const policy =
        await findPolicyOrFail(
            prisma,
            policyId
        );

    if (actorUserId) {
        const visible =
            await policyVisibleToActor(
                actorUserId,
                policyId
            );

        if (!visible) {
            throw createServiceError(
                "Política de retenção não encontrada.",
                404
            );
        }
    }

    return serializePolicyWithContext(
        prisma,
        policy
    );
}


async function listRetentionPolicies(
    actorUserId
) {
    const scope =
        await getActorUnitScope(
            actorUserId
        );

    const policies =
        await prisma.retention_policies.findMany({
            orderBy: [
                {
                    is_active:
                        "desc",
                },

                {
                    name:
                        "asc",
                },
            ],
        });

    if (
        scope.isAdminMaster
    ) {
        return Promise.all(
            policies.map(
                (policy) =>
                    serializePolicyWithContext(
                        prisma,
                        policy
                    )
            )
        );
    }

    const visible = [];

    for (
        const policy of policies
    ) {
        if (
            await policyVisibleToActor(
                actorUserId,
                policy.id
            )
        ) {
            visible.push(
                await serializePolicyWithContext(
                    prisma,
                    policy
                )
            );
        }
    }

    return visible;
}


async function createRetentionPolicy(
    data,
    actorUserId
) {
    const category =
        await validateCategory(
            prisma,
            data.categoryId
        );

    const id =
        randomUUID();

    await runPolicyTransaction(
        async (tx) => {
            const validUnitIds =
                await validateUnitIds(
                    tx,
                    data.unitIds ??
                    []
                );

            await assertPolicyUnitsAllowed(
                actorUserId,
                validUnitIds,
                tx
            );

            if (
                data.isActive
            ) {
                await ensureNoActiveConflict(
                    tx,
                    {
                        categoryId:
                            category?.id ??
                            null,

                        appliesToStatus:
                            data.appliesToStatus,

                        unitIds:
                            validUnitIds,
                    }
                );
            }

            await tx.retention_policies.create({
                data: {
                    id,

                    name:
                        data.name,

                    category_id:
                        category?.id ??
                        null,

                    applies_to_status:
                        data.appliesToStatus,

                    retention_days:
                        data.retentionDays,

                    action:
                        data.action,

                    is_active:
                        data.isActive,
                },
            });

            if (
                validUnitIds.length >
                0
            ) {
                await tx
                    .retention_policy_units
                    .createMany({
                        data:
                            validUnitIds.map(
                                (unitId) => ({
                                    policy_id:
                                        id,

                                    unit_id:
                                        unitId,
                                })
                            ),

                        skipDuplicates:
                            true,
                    });
            }

            await createScopedAuditLog(
                tx,
                {
                    actor_type:
                        "ADMIN",

                    actor_user_id:
                        actorUserId,

                    action:
                        "RETENTION_POLICY_CREATED",

                    entity_type:
                        "RETENTION_POLICY",

                    entity_id:
                        id,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            appliesToStatus:
                                data.appliesToStatus,

                            retentionDays:
                                data.retentionDays,

                            action:
                                data.action,

                            hasCategory:
                                Boolean(
                                    category
                                ),

                            unitIds:
                                validUnitIds,

                            isGlobal:
                                validUnitIds.length ===
                                0,

                            isActive:
                                data.isActive,
                        }),
                },

                validUnitIds
            );
        }
    );

    return getPolicyById(
        id,
        actorUserId
    );
}


async function updateRetentionPolicy(
    policyId,
    data,
    actorUserId
) {
    await assertPolicyManageable(
        actorUserId,
        policyId
    );

    const current =
        await findPolicyOrFail(
            prisma,
            policyId
        );

    const previousUnitIds =
        await getPolicyUnitIds(
            prisma,
            policyId
        );

    let categoryId =
        current.category_id;

    if (
        data.categoryId !==
        undefined
    ) {
        const category =
            await validateCategory(
                prisma,
                data.categoryId
            );

        categoryId =
            category?.id ??
            null;
    }

    const newStatus =
        data.appliesToStatus ??
        current.applies_to_status;

    const newUnitIds =
        data.unitIds !==
        undefined
            ? await validateUnitIds(
                prisma,
                data.unitIds
            )
            : previousUnitIds;

    await assertPolicyUnitsAllowed(
        actorUserId,
        newUnitIds
    );

    const updateData = {};

    if (
        data.name !==
        undefined
    ) {
        updateData.name =
            data.name;
    }

    if (
        data.categoryId !==
        undefined
    ) {
        updateData.category_id =
            categoryId;
    }

    if (
        data.appliesToStatus !==
        undefined
    ) {
        updateData.applies_to_status =
            data.appliesToStatus;
    }

    if (
        data.retentionDays !==
        undefined
    ) {
        updateData.retention_days =
            data.retentionDays;
    }

    if (
        data.action !==
        undefined
    ) {
        updateData.action =
            data.action;
    }

    await runPolicyTransaction(
        async (tx) => {
            if (
                current.is_active
            ) {
                await ensureNoActiveConflict(
                    tx,
                    {
                        categoryId,

                        appliesToStatus:
                            newStatus,

                        unitIds:
                            newUnitIds,

                        ignorePolicyId:
                            policyId,
                    }
                );
            }

            await tx
                .retention_policies
                .update({
                    where: {
                        id:
                            policyId,
                    },

                    data:
                        updateData,
                });

            if (
                data.unitIds !==
                undefined
            ) {
                await tx
                    .retention_policy_units
                    .deleteMany({
                        where: {
                            policy_id:
                                policyId,
                        },
                    });

                if (
                    newUnitIds.length >
                    0
                ) {
                    await tx
                        .retention_policy_units
                        .createMany({
                            data:
                                newUnitIds.map(
                                    (unitId) => ({
                                        policy_id:
                                            policyId,

                                        unit_id:
                                            unitId,
                                    })
                                ),

                            skipDuplicates:
                                true,
                        });
                }
            }

            await createScopedAuditLog(
                tx,
                {
                    actor_type:
                        "ADMIN",

                    actor_user_id:
                        actorUserId,

                    action:
                        "RETENTION_POLICY_UPDATED",

                    entity_type:
                        "RETENTION_POLICY",

                    entity_id:
                        policyId,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            changedFields: [
                                ...Object.keys(
                                    updateData
                                ),

                                ...(data.unitIds !==
                                undefined
                                    ? [
                                        "unitIds",
                                    ]
                                    : []),
                            ],

                            previousUnitIds,

                            currentUnitIds:
                                newUnitIds,
                        }),
                },

                [
                    ...previousUnitIds,
                    ...newUnitIds,
                ]
            );
        }
    );

    return getPolicyById(
        policyId,
        actorUserId
    );
}


async function changeRetentionPolicyStatus(
    policyId,
    isActive,
    actorUserId
) {
    await assertPolicyManageable(
        actorUserId,
        policyId
    );

    const current =
        await findPolicyOrFail(
            prisma,
            policyId
        );

    const unitIds =
        await getPolicyUnitIds(
            prisma,
            policyId
        );

    if (
        current.is_active ===
        isActive
    ) {
        return getPolicyById(
            policyId,
            actorUserId
        );
    }

    await runPolicyTransaction(
        async (tx) => {
            if (
                isActive
            ) {
                await ensureNoActiveConflict(
                    tx,
                    {
                        categoryId:
                            current.category_id,

                        appliesToStatus:
                            current.applies_to_status,

                        unitIds,

                        ignorePolicyId:
                            policyId,
                    }
                );
            }

            await tx
                .retention_policies
                .update({
                    where: {
                        id:
                            policyId,
                    },

                    data: {
                        is_active:
                            isActive,
                    },
                });

            await createScopedAuditLog(
                tx,
                {
                    actor_type:
                        "ADMIN",

                    actor_user_id:
                        actorUserId,

                    action:
                        isActive
                            ? "RETENTION_POLICY_ACTIVATED"
                            : "RETENTION_POLICY_DEACTIVATED",

                    entity_type:
                        "RETENTION_POLICY",

                    entity_id:
                        policyId,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            previous:
                                current.is_active,

                            current:
                                isActive,

                            unitIds,
                        }),
                },

                unitIds
            );
        }
    );

    return getPolicyById(
        policyId,
        actorUserId
    );
}


module.exports = {
    listRetentionPolicies,
    getPolicyById,
    createRetentionPolicy,
    updateRetentionPolicy,
    changeRetentionPolicyStatus,
    getPolicyUnitIds,
};