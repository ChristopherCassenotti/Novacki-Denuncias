const {
    randomUUID,
} = require("node:crypto");

const prisma =
    require("../../database/prisma");
const {
    createScopedAuditLog,
} = require(
    "../adminAuditLogs/auditScope.service"
);
const {
    isAdminMaster,
    getActorUnitScope,
    assertUnitIdsWithinActorScope,
    assertUserWithinActorScope,
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
async function assertRuleWithinActorScope(
    actorUserId,
    rule,
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

    /*
     * Regra global também fica invisível
     * para administrador regional.
     */
    if (
        !rule.unit_id ||
        !scope.unitIds.includes(
            rule.unit_id
        )
    ) {
        throw serviceError(
            "Regra de roteamento não encontrada.",
            404
        );
    }

    return true;
}


async function assertRuleUnitAllowed(
    actorUserId,
    unitId,
    database = prisma
) {
    const master =
        await isAdminMaster(
            actorUserId,
            database
        );

    if (master) {
        return true;
    }

    /*
     * RH regional não cria regra global.
     */
    if (!unitId) {
        throw serviceError(
            "A regra precisa estar vinculada a uma das suas unidades.",
            400
        );
    }

    await assertUnitIdsWithinActorScope(
        actorUserId,
        [unitId],
        database
    );

    return true;
}
function serializeRule(
    rule
) {
    return {
        id:
            rule.id,

        name:
            rule.name,

        priority:
            rule.priority,

        isActive:
            rule.is_active,

        stopProcessing:
            rule.stop_processing,

        conditions: {
            categoryId:
                rule.category_id,

            unitId:
                rule.unit_id,

            reportMode:
                rule.report_mode,

            relationshipType:
                rule.relationship_type,

            immediateRisk:
                rule.immediate_risk,

            restrictedRoleId:
                rule.restricted_role_id,
        },

        actions: {
            targetUserId:
                rule.target_user_id,

            targetTeamId:
                rule.target_team_id,

            setPriority:
                rule.set_priority,
        },

        createdByUserId:
            rule.created_by_user_id,

        createdAt:
            rule.created_at,

        updatedAt:
            rule.updated_at,
    };
}

async function findRuleOrFail(
    id
) {
    const rule =
        await prisma.routing_rules
            .findUnique({
                where: {
                    id,
                },
            });

    if (!rule) {
        throw serviceError(
            "Regra de roteamento não encontrada.",
            404
        );
    }

    return rule;
}

async function validateCategory(
    categoryId
) {
    if (!categoryId) {
        return;
    }

    const category =
        await prisma
            .report_categories
            .findUnique({
                where: {
                    id:
                        categoryId,
                },

                select: {
                    id: true,
                    is_active: true,
                },
            });

    if (
        !category ||
        !category.is_active
    ) {
        throw serviceError(
            "Categoria inválida ou inativa.",
            400
        );
    }
}

async function validateUnit(
    unitId
) {
    if (!unitId) {
        return;
    }

    const unit =
        await prisma.units.findUnique({
            where: {
                id:
                    unitId,
            },

            select: {
                id:
                    true,

                type:
                    true,

                is_active:
                    true,
            },
        });

    if (
        !unit ||
        !unit.is_active ||
        unit.type !== "UNIT"
    ) {
        throw serviceError(
            "Unidade inválida ou inativa.",
            400
        );
    }
}
async function validateRole(
    roleId
) {
    if (!roleId) {
        return;
    }

    const role =
        await prisma.roles.findUnique({
            where: {
                id:
                    roleId,
            },

            select: {
                id: true,
                is_active: true,
            },
        });

    if (
        !role ||
        !role.is_active
    ) {
        throw serviceError(
            "Perfil restrito inválido ou inativo.",
            400
        );
    }
}

async function validateTargetUser(
    userId,
    unitId,
    actorUserId
) {
    if (!userId) {
        return;
    }

    const user =
        await prisma.users.findUnique({
            where: {
                id:
                    userId,
            },

            select: {
                id:
                    true,

                is_active:
                    true,
            },
        });

    if (
        !user ||
        !user.is_active
    ) {
        throw serviceError(
            "Usuário de destino inválido ou inativo.",
            400
        );
    }

    /*
     * Para gerente regional, usuário
     * precisa estar no mesmo escopo.
     */
    if (actorUserId) {
        await assertUserWithinActorScope(
            actorUserId,
            userId
        );
    }

    /*
     * ADMIN_MASTER como destino é
     * considerado global.
     */
    const targetIsMaster =
        await isAdminMaster(
            userId
        );

    if (
        unitId &&
        !targetIsMaster
    ) {
        const assignment =
            await prisma.user_units.findFirst({
                where: {
                    user_id:
                        userId,

                    unit_id:
                        unitId,
                },

                select: {
                    user_id:
                        true,
                },
            });

        if (!assignment) {
            throw serviceError(
                "O usuário de destino não pertence à unidade da regra.",
                400
            );
        }
    }
}
async function validateTargetTeam(
    teamId,
    unitId,
    actorUserId
) {
    if (!teamId) {
        return null;
    }

    const team =
        await prisma.teams.findUnique({
            where: {
                id:
                    teamId,
            },

            select: {
                id:
                    true,

                is_active:
                    true,

                is_independent:
                    true,
            },
        });

    if (
        !team ||
        !team.is_active
    ) {
        throw serviceError(
            "Equipe de destino inválida ou inativa.",
            400
        );
    }

    const teamUnits =
        await prisma.team_units.findMany({
            where: {
                team_id:
                    teamId,
            },

            select: {
                unit_id:
                    true,
            },
        });

    /*
     * Gerente regional só pode sequer
     * utilizar equipes inteiramente
     * contidas no próprio escopo.
     */
    if (actorUserId) {
        const scope =
            await getActorUnitScope(
                actorUserId
            );

        if (
            !scope.isAdminMaster
        ) {
            if (
                teamUnits.length === 0
            ) {
                throw serviceError(
                    "Equipe de destino não encontrada.",
                    404
                );
            }

            const actorUnits =
                new Set(
                    scope.unitIds
                );

            const fullyInside =
                teamUnits.every(
                    (item) =>
                        actorUnits.has(
                            item.unit_id
                        )
                );

            if (!fullyInside) {
                throw serviceError(
                    "Equipe de destino não encontrada.",
                    404
                );
            }
        }
    }

    /*
     * Se a regra é da M1, a equipe precisa
     * possuir vínculo com a M1.
     */
    if (unitId) {
        const belongsToUnit =
            teamUnits.some(
                (item) =>
                    item.unit_id ===
                    unitId
            );

        if (!belongsToUnit) {
            throw serviceError(
                "A equipe de destino não pertence à unidade da regra.",
                400
            );
        }
    }

    return team;
}
async function validateRestrictedRouting(
    restrictedRoleId,
    targetUserId,
    targetTeamId
) {
    if (!restrictedRoleId) {
        return;
    }

    /*
     * Se a regra reage à presença de um
     * perfil restrito, não permitimos
     * encaminhar para um usuário que
     * pertença ao próprio perfil.
     */
    if (targetUserId) {
        const conflictingRole =
            await prisma
                .user_roles
                .findUnique({
                    where: {
                        user_id_role_id: {
                            user_id:
                                targetUserId,

                            role_id:
                                restrictedRoleId,
                        },
                    },

                    select: {
                        user_id:
                            true,
                    },
                });

        if (
            conflictingRole
        ) {
            throw serviceError(
                "O usuário de destino pertence ao perfil que a própria regra considera restrito.",
                409
            );
        }
    }

    /*
     * Se o destino for uma equipe em uma
     * regra de conflito, exigimos equipe
     * marcada como independente.
     */
    if (targetTeamId) {
        const team =
    await prisma.teams.findUnique({
        where: {
            id:
                targetTeamId,
        },

        select: {
            id:
                true,

            is_active:
                true,

            is_independent:
                true,
        },
    });

if (
    !team ||
    !team.is_active
) {
    throw serviceError(
        "Equipe de destino inválida ou inativa.",
        400
    );
}

        if (
            !team.is_independent
        ) {
            throw serviceError(
                "Regras baseadas em perfil restrito devem encaminhar para uma equipe independente.",
                409
            );
        }
    }
}

function validateActions(
    data
) {
    if (
        data.targetUserId &&
        data.targetTeamId
    ) {
        throw serviceError(
            "Escolha usuário ou equipe, não ambos.",
            400
        );
    }

    if (
        !data.targetUserId &&
        !data.targetTeamId &&
        !data.setPriority
    ) {
        throw serviceError(
            "A regra precisa executar pelo menos uma ação.",
            400
        );
    }
}

async function validateReferences(
    data,
    actorUserId
) {
    /*
     * Primeiro validamos condições
     * independentes.
     */
    await Promise.all([
        validateCategory(
            data.categoryId
        ),

        validateUnit(
            data.unitId
        ),

        validateRole(
            data.restrictedRoleId
        ),
    ]);

    await assertRuleUnitAllowed(
        actorUserId,
        data.unitId
    );

    /*
     * Destinos dependem da unidade
     * escolhida para a regra.
     */
    await Promise.all([
        validateTargetUser(
            data.targetUserId,
            data.unitId,
            actorUserId
        ),

        validateTargetTeam(
            data.targetTeamId,
            data.unitId,
            actorUserId
        ),
    ]);

    await validateRestrictedRouting(
        data.restrictedRoleId,
        data.targetUserId,
        data.targetTeamId
    );
}

async function listRoutingRules(
    actorUserId
) {
    const scope =
        await getActorUnitScope(
            actorUserId
        );

    if (
        !scope.isAdminMaster &&
        scope.unitIds.length === 0
    ) {
        return [];
    }

    const where =
        scope.isAdminMaster
            ? {}
            : {
                unit_id: {
                    in:
                        scope.unitIds,
                },
            };

    const rules =
        await prisma.routing_rules
            .findMany({
                where,

                orderBy: [
                    {
                        priority:
                            "asc",
                    },

                    {
                        created_at:
                            "asc",
                    },
                ],
            });

    return rules.map(
        serializeRule
    );
}

async function getRoutingRule(
    id,
    actorUserId
) {
    const rule =
        await findRuleOrFail(
            id
        );

    await assertRuleWithinActorScope(
        actorUserId,
        rule
    );

    return serializeRule(
        rule
    );
}

async function createRoutingRule(
    data,
    actorUserId
) {
    validateActions(data);

    await validateReferences(
    data,
    actorUserId
);
    const rule =
        await prisma.$transaction(
            async (tx) => {
                const created =
                    await tx
                        .routing_rules
                        .create({
                            data: {
                                id:
                                    randomUUID(),

                                name:
                                    data.name,

                                priority:
                                    data.priority,

                                is_active:
                                    data.isActive,

                                stop_processing:
                                    data.stopProcessing,

                                category_id:
                                    data.categoryId,

                                unit_id:
                                    data.unitId,

                                report_mode:
                                    data.reportMode,

                                relationship_type:
                                    data.relationshipType,

                                immediate_risk:
                                    data.immediateRisk,

                                restricted_role_id:
                                    data.restrictedRoleId,

                                target_user_id:
                                    data.targetUserId,

                                target_team_id:
                                    data.targetTeamId,

                                set_priority:
                                    data.setPriority,

                                created_by_user_id:
                                    actorUserId,
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
                            "ROUTING_RULE_CREATED",

                        entity_type:
                            "ROUTING_RULE",

                        entity_id:
                            created.id,

                        success:
                            true,

                        request_id:
                            randomUUID(),

                        metadata_json:
                            JSON.stringify({
                                priority:
                                    created.priority,

                                isActive:
                                    created.is_active,

                                unitId:
                                    created.unit_id,
                                
                                hasCategoryCondition:
                                    !!created.category_id,

                                hasUnitCondition:
                                    !!created.unit_id,

                                hasRestrictedRoleCondition:
                                    !!created.restricted_role_id,

                                hasUserTarget:
                                    !!created.target_user_id,

                                hasTeamTarget:
                                    !!created.target_team_id,

                                setsPriority:
                                    !!created.set_priority,
                            }),
                    }
                );

                return created;
            }
        );

    return serializeRule(
        rule
    );
}

async function updateRoutingRule(
    id,
    patch,
    actorUserId
) {
    const current =
        await findRuleOrFail(
            id
        );
await assertRuleWithinActorScope(
    actorUserId,
    current
);
    const merged = {
        name:
            patch.name ??
            current.name,

        priority:
            patch.priority ??
            current.priority,

        stopProcessing:
            patch.stopProcessing ??
            current.stop_processing,

        categoryId:
            patch.categoryId !==
            undefined
                ? patch.categoryId
                : current.category_id,

        unitId:
            patch.unitId !==
            undefined
                ? patch.unitId
                : current.unit_id,

        reportMode:
            patch.reportMode !==
            undefined
                ? patch.reportMode
                : current.report_mode,

        relationshipType:
            patch.relationshipType !==
            undefined
                ? patch.relationshipType
                : current.relationship_type,

        immediateRisk:
            patch.immediateRisk !==
            undefined
                ? patch.immediateRisk
                : current.immediate_risk,

        restrictedRoleId:
            patch.restrictedRoleId !==
            undefined
                ? patch.restrictedRoleId
                : current.restricted_role_id,

        targetUserId:
            patch.targetUserId !==
            undefined
                ? patch.targetUserId
                : current.target_user_id,

        targetTeamId:
            patch.targetTeamId !==
            undefined
                ? patch.targetTeamId
                : current.target_team_id,

        setPriority:
            patch.setPriority !==
            undefined
                ? patch.setPriority
                : current.set_priority,
    };

    validateActions(
        merged
    );

    await validateReferences(
        merged,
        actorUserId
    );

    const updated =
        await prisma.$transaction(
            async (tx) => {
                const rule =
                    await tx
                        .routing_rules
                        .update({
                            where: {
                                id,
                            },

                            data: {
                                name:
                                    merged.name,

                                priority:
                                    merged.priority,

                                stop_processing:
                                    merged.stopProcessing,

                                category_id:
                                    merged.categoryId,

                                unit_id:
                                    merged.unitId,

                                report_mode:
                                    merged.reportMode,

                                relationship_type:
                                    merged.relationshipType,

                                immediate_risk:
                                    merged.immediateRisk,

                                restricted_role_id:
                                    merged.restrictedRoleId,

                                target_user_id:
                                    merged.targetUserId,

                                target_team_id:
                                    merged.targetTeamId,

                                set_priority:
                                    merged.setPriority,
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
                            "ROUTING_RULE_UPDATED",

                        entity_type:
                            "ROUTING_RULE",

                        entity_id:
                            id,

                        success:
                            true,

                        request_id:
                            randomUUID(),

                        metadata_json:
                            JSON.stringify({
                                priority:
                                    rule.priority,
                            
                                unitId:
                                    rule.unit_id,
                                
                                stopProcessing:
                                    rule.stop_processing,
                            }),
                    },
                    current.unit_id
                        ? [
                            current.unit_id,
                        ]
                        : []
                );

                return rule;
            }
        );

    return serializeRule(
        updated
    );
}

async function changeRoutingRuleStatus(
    id,
    isActive,
    actorUserId
) {
    const current =
        await findRuleOrFail(
            id
        );
    
    await assertRuleWithinActorScope(
        actorUserId,
        current
    );

    if (
        current.is_active ===
        isActive
    ) {
        return serializeRule(
            current
        );
    }

    const updated =
        await prisma.$transaction(
            async (tx) => {
                const rule =
                    await tx
                        .routing_rules
                        .update({
                            where: {
                                id,
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
                                ? "ROUTING_RULE_ACTIVATED"
                                : "ROUTING_RULE_DEACTIVATED",

                        entity_type:
                            "ROUTING_RULE",

                        entity_id:
                            id,

                        success:
                            true,

                        request_id:
                            randomUUID(),

                        metadata_json:
                            JSON.stringify({
                                unitId:
                                    current.unit_id,
                                isActive,
                            }),
                    }
                );

                return rule;
            }
        );

    return serializeRule(
        updated
    );
}

module.exports = {
    listRoutingRules,
    getRoutingRule,
    createRoutingRule,
    updateRoutingRule,
    changeRoutingRuleStatus,
};
