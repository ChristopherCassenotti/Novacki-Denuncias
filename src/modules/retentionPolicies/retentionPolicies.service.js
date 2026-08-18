const {
    randomUUID,
} = require(
    "node:crypto"
);

const prisma =
    require(
        "../../database/prisma"
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
                id: true,
                name: true,
                is_active: true,
            },
        });

    if (!category) {
        throw createServiceError(
            "Categoria não encontrada.",
            400
        );
    }

    return category;
}

async function ensureNoActiveConflict(
    database,
    {
        categoryId,
        appliesToStatus,
        ignorePolicyId = null,
    }
) {
    const existing =
        await database.retention_policies.findFirst({
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
                id: true,
                name: true,
            },
        });

    if (existing) {
        throw createServiceError(
            "Já existe uma política ativa para esta categoria e status.",
            409
        );
    }
}

function serializePolicy(
    policy,
    category = null
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

async function getPolicyById(
    policyId
) {
    const policy =
        await findPolicyOrFail(
            prisma,
            policyId
        );

    let category =
        null;

    if (policy.category_id) {
        category =
            await prisma.report_categories.findUnique({
                where: {
                    id:
                        policy.category_id,
                },

                select: {
                    id: true,
                    name: true,
                },
            });
    }

    return serializePolicy(
        policy,
        category
    );
}

async function listRetentionPolicies() {
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

    const categoryIds = [
        ...new Set(
            policies
                .map(
                    (policy) =>
                        policy.category_id
                )
                .filter(Boolean)
        ),
    ];

    const categories =
        categoryIds.length
            ? await prisma.report_categories.findMany({
                where: {
                    id: {
                        in:
                            categoryIds,
                    },
                },

                select: {
                    id: true,
                    name: true,
                },
            })
            : [];

    const categoryMap =
        new Map(
            categories.map(
                (category) => [
                    category.id,
                    category,
                ]
            )
        );

    return policies.map(
        (policy) =>
            serializePolicy(
                policy,
                policy.category_id
                    ? categoryMap.get(
                        policy.category_id
                    ) || null
                    : null
            )
    );
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

    if (data.isActive) {
        await ensureNoActiveConflict(
            prisma,
            {
                categoryId:
                    data.categoryId ??
                    null,

                appliesToStatus:
                    data.appliesToStatus,
            }
        );
    }

    const id =
        randomUUID();

    await prisma.$transaction(
        async (tx) => {
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

            await tx.audit_logs.create({
                data: {
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

                            isActive:
                                data.isActive,
                        }),
                },
            });
        }
    );

    return getPolicyById(
        id
    );
}

async function updateRetentionPolicy(
    policyId,
    data,
    actorUserId
) {
    const current =
        await findPolicyOrFail(
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

    if (current.is_active) {
        await ensureNoActiveConflict(
            prisma,
            {
                categoryId,

                appliesToStatus:
                    newStatus,

                ignorePolicyId:
                    policyId,
            }
        );
    }

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

    await prisma.$transaction(
        async (tx) => {
            await tx.retention_policies.update({
                where: {
                    id:
                        policyId,
                },

                data:
                    updateData,
            });

            await tx.audit_logs.create({
                data: {
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
                            changedFields:
                                Object.keys(
                                    updateData
                                ),
                        }),
                },
            });
        }
    );

    return getPolicyById(
        policyId
    );
}

async function changeRetentionPolicyStatus(
    policyId,
    isActive,
    actorUserId
) {
    const current =
        await findPolicyOrFail(
            prisma,
            policyId
        );

    if (
        current.is_active ===
        isActive
    ) {
        return getPolicyById(
            policyId
        );
    }

    if (isActive) {
        await ensureNoActiveConflict(
            prisma,
            {
                categoryId:
                    current.category_id,

                appliesToStatus:
                    current.applies_to_status,

                ignorePolicyId:
                    policyId,
            }
        );
    }

    await prisma.$transaction(
        async (tx) => {
            await tx.retention_policies.update({
                where: {
                    id:
                        policyId,
                },

                data: {
                    is_active:
                        isActive,
                },
            });

            await tx.audit_logs.create({
                data: {
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
                        }),
                },
            });
        }
    );

    return getPolicyById(
        policyId
    );
}

module.exports = {
    listRetentionPolicies,
    getPolicyById,
    createRetentionPolicy,
    updateRetentionPolicy,
    changeRetentionPolicyStatus,
};