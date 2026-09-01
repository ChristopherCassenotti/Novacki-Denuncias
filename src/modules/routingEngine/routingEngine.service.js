const {
    randomUUID,
} = require("node:crypto");
const {
    assertUserCanReceiveReportAccess,
} = require(
    "../adminReportRestrictions/reportAccess.service"
);
const prisma =
    require("../../database/prisma");

const {
    encryptJson,
} = require(
    "../../security/crypto.service"
);

const PRIORITY_WEIGHT = {
    LOW: 0,
    NORMAL: 1,
    HIGH: 2,
    CRITICAL: 3,
};

function serviceError(
    message,
    statusCode,
    code = null
) {
    const error =
        new Error(message);

    error.statusCode =
        statusCode;

    error.code =
        code;

    return error;
}

async function getReport(
    reportId
) {
    const report =
        await prisma.reports.findUnique({
            where: {
                id:
                    reportId,
            },

            select: {
                id: true,

                mode: true,

                relationship_type:
                    true,

                unit_id: true,

                category_id:
                    true,

                immediate_risk:
                    true,

                priority: true,

                status: true,

                current_assignee_user_id:
                    true,

                current_assignee_team_id:
                    true,
            },
        });

    if (!report) {
        throw serviceError(
            "Denúncia não encontrada.",
            404
        );
    }

    return report;
}

async function getRestrictionContext(
    reportId
) {
    const restrictions =
        await prisma
            .report_restricted_users
            .findMany({
                where: {
                    report_id:
                        reportId,

                    is_active:
                        true,
                },

                select: {
                    user_id:
                        true,
                },
            });

    const restrictedUserIds =
        restrictions.map(
            (item) =>
                item.user_id
        );

    if (
        restrictedUserIds.length ===
        0
    ) {
        return {
            restrictedUserIds:
                new Set(),

            restrictedRoleIds:
                new Set(),
        };
    }

    const roles =
        await prisma
            .user_roles
            .findMany({
                where: {
                    user_id: {
                        in:
                            restrictedUserIds,
                    },
                },

                select: {
                    role_id:
                        true,
                },
            });

    return {
        restrictedUserIds:
            new Set(
                restrictedUserIds
            ),

        restrictedRoleIds:
            new Set(
                roles.map(
                    (item) =>
                        item.role_id
                )
            ),
    };
}

function ruleMatches(
    rule,
    report,
    restrictionContext
) {
    if (
        rule.category_id &&
        rule.category_id !==
            report.category_id
    ) {
        return false;
    }

    if (
        rule.unit_id &&
        rule.unit_id !==
            report.unit_id
    ) {
        return false;
    }

    if (
        rule.report_mode &&
        rule.report_mode !==
            report.mode
    ) {
        return false;
    }

    if (
        rule.relationship_type &&
        rule.relationship_type !==
            report.relationship_type
    ) {
        return false;
    }

    if (
        rule.immediate_risk !==
            null &&
        rule.immediate_risk !==
            report.immediate_risk
    ) {
        return false;
    }

    /*
     * Esta condição significa:
     *
     * "Existe alguma pessoa atualmente
     * restrita neste caso que possui
     * esse perfil?"
     */
    if (
        rule.restricted_role_id &&
        !restrictionContext
            .restrictedRoleIds
            .has(
                rule
                    .restricted_role_id
            )
    ) {
        return false;
    }

    return true;
}

function strongerPriority(
    current,
    candidate
) {
    if (!candidate) {
        return current;
    }

    if (
        PRIORITY_WEIGHT[
            candidate
        ] >
        PRIORITY_WEIGHT[
            current
        ]
    ) {
        return candidate;
    }

    /*
     * O roteamento automático nunca
     * reduz uma prioridade já existente.
     */
    return current;
}

async function targetUserIsSafe(
    userId,
    reportId,
    restrictionContext
) {
    /*
     * Restrição individual continua
     * vencendo qualquer outra regra.
     */
    if (
        restrictionContext
            .restrictedUserIds
            .has(userId)
    ) {
        return false;
    }

    const user =
        await prisma.users.findUnique({
            where: {
                id: userId,
            },

            select: {
                is_active: true,
            },
        });

    if (
        !user ||
        !user.is_active
    ) {
        return false;
    }

    /*
     * Aqui entra a segregação por unidade.
     *
     * Usuário comum precisa pertencer
     * à unidade da denúncia.
     *
     * ADMIN_MASTER continua permitido.
     */
    try {
        await assertUserCanReceiveReportAccess(
            reportId,
            userId
        );

        return true;
    } catch (error) {
        if (
            error.statusCode === 403 ||
            error.statusCode === 409
        ) {
            return false;
        }

        throw error;
    }
}

async function targetTeamIsSafe(
    teamId,
    requiresIndependent
) {
    const team =
        await prisma.teams.findUnique({
            where: {
                id:
                    teamId,
            },

            select: {
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
        return false;
    }

    if (
        requiresIndependent &&
        !team.is_independent
    ) {
        return false;
    }

    return true;
}

async function buildRoutingPlan(
    report,
    rules,
    restrictionContext
) {
    let targetUserId =
        null;

    let targetTeamId =
        null;

    let priority =
        report.priority;

    const matchedRuleIds =
        [];

    const skippedUnsafeRuleIds =
        [];

    for (
        const rule of rules
    ) {
        if (
            !ruleMatches(
                rule,
                report,
                restrictionContext
            )
        ) {
            continue;
        }

        matchedRuleIds.push(
            rule.id
        );

        priority =
            strongerPriority(
                priority,
                rule.set_priority
            );

        /*
         * Primeiro destino seguro vence.
         *
         * Isso impede uma regra fallback
         * posterior de substituir uma
         * regra específica.
         */
        let targetAccepted =
            true;

        const targetRequested =
            !!rule.target_user_id ||
            !!rule.target_team_id;

        if (
            !targetUserId &&
            !targetTeamId
        ) {
            if (
                rule.target_user_id
            ) {
            const safe =
                await targetUserIsSafe(
                    rule.target_user_id,
                    report.id,
                    restrictionContext
                );

                if (safe) {
                    targetUserId =
                        rule.target_user_id;
                } else {
                    targetAccepted =
                        false;

                    skippedUnsafeRuleIds
                        .push(
                            rule.id
                        );
                }
            }

            if (
                rule.target_team_id
            ) {
                const safe =
                    await targetTeamIsSafe(
                        rule.target_team_id,

                        !!rule
                            .restricted_role_id
                    );

                if (safe) {
                    targetTeamId =
                        rule.target_team_id;
                } else {
                    targetAccepted =
                        false;

                    skippedUnsafeRuleIds
                        .push(
                            rule.id
                        );
                }
            }
        }

        /*
         * Se a regra queria encaminhar
         * para um destino inseguro,
         * continuamos procurando outra.
         */
        if (
            rule.stop_processing &&
            (
                !targetRequested ||
                targetAccepted
            )
        ) {
            break;
        }
    }

    return {
        targetUserId,
        targetTeamId,
        priority,
        matchedRuleIds,
        skippedUnsafeRuleIds,
    };
}

function sameAssignment(
    report,
    plan
) {
    return (
        (
            report
                .current_assignee_user_id ||
            null
        ) ===
            (
                plan.targetUserId ||
                null
            ) &&
        (
            report
                .current_assignee_team_id ||
            null
        ) ===
            (
                plan.targetTeamId ||
                null
            )
    );
}

async function applyRoutingPlan(
    report,
    plan,
    restrictionContext,
    trigger
) {
    const currentUserRestricted =
        !!report
            .current_assignee_user_id &&
        restrictionContext
            .restrictedUserIds
            .has(
                report
                    .current_assignee_user_id
            );

    /*
     * Se nenhuma regra encontrou destino,
     * conservamos a atribuição atual,
     * EXCETO quando o usuário atual ficou
     * restrito.
     */
    if (
        !plan.targetUserId &&
        !plan.targetTeamId &&
        !currentUserRestricted
    ) {
        plan.targetUserId =
            report
                .current_assignee_user_id;

        plan.targetTeamId =
            report
                .current_assignee_team_id;
    }

    const assignmentChanged =
        !sameAssignment(
            report,
            plan
        );

    const priorityChanged =
        plan.priority !==
        report.priority;

    if (
        !assignmentChanged &&
        !priorityChanged
    ) {
        return {
            routed:
                false,

            reason:
                "NO_CHANGES",

            matchedRuleIds:
                plan.matchedRuleIds,

            skippedUnsafeRuleIds:
                plan
                    .skippedUnsafeRuleIds,
        };
    }

    const now =
        new Date();

    const metadata =
        encryptJson(
            {
                automatic:
                    true,

                trigger,

                matchedRuleIds:
                    plan
                        .matchedRuleIds,
            },
            "REPORT_EVENT_METADATA"
        );

    await prisma.$transaction(
        async (tx) => {
            if (
                plan.targetUserId
            ) {
                const targetUser =
                    await tx.users.findUnique({
                        where: {
                            id:
                                plan.targetUserId,
                        },

                        select: {
                            is_active:
                                true,
                        },
                    });

                if (
                    !targetUser ||
                    !targetUser.is_active
                ) {
                    throw serviceError(
                        "O destino tornou-se inválido durante o roteamento.",
                        409,
                        "ROUTING_TARGET_UNSAFE"
                    );
                }

                try {
                    await assertUserCanReceiveReportAccess(
                        report.id,
                        plan.targetUserId,
                        tx
                    );
                } catch (error) {
                    if (
                        error.statusCode === 403 ||
                        error.statusCode === 409
                    ) {
                        throw serviceError(
                            "O destino tornou-se inválido durante o roteamento.",
                            409,
                            "ROUTING_TARGET_UNSAFE"
                        );
                    }

                    throw error;
                }
            }

            const updateResult =
                await tx.reports
                    .updateMany({
                        where: {
                            id:
                                report.id,

                            priority:
                                report.priority,

                            current_assignee_user_id:
                                report
                                    .current_assignee_user_id,

                            current_assignee_team_id:
                                report
                                    .current_assignee_team_id,
                        },

                        data: {
                            priority:
                                plan.priority,

                            current_assignee_user_id:
                                plan
                                    .targetUserId,

                            current_assignee_team_id:
                                plan
                                    .targetTeamId,

                            last_activity_at:
                                now,
                        },
                    });

            if (
                updateResult.count !==
                1
            ) {
                throw serviceError(
                    "A denúncia foi alterada durante o roteamento.",
                    409,
                    "REPORT_STATE_CHANGED"
                );
            }

            if (
                assignmentChanged
            ) {
                /*
                 * Encerra a atribuição
                 * correspondente ao destino
                 * atual.
                 */
                if (
                    report
                        .current_assignee_user_id
                ) {
                    await tx
                        .report_assignments
                        .updateMany({
                            where: {
                                report_id:
                                    report.id,

                                assigned_user_id:
                                    report
                                        .current_assignee_user_id,

                                ended_at:
                                    null,
                            },

                            data: {
                                ended_at:
                                    now,
                            },
                        });
                }

                if (
                    report
                        .current_assignee_team_id
                ) {
                    await tx
                        .report_assignments
                        .updateMany({
                            where: {
                                report_id:
                                    report.id,

                                assigned_team_id:
                                    report
                                        .current_assignee_team_id,

                                ended_at:
                                    null,
                            },

                            data: {
                                ended_at:
                                    now,
                            },
                        });
                }

                /*
                 * Também encerra qualquer
                 * assignment ainda ativo de
                 * usuário individualmente
                 * restrito.
                 */
                const restrictedIds =
                    [
                        ...restrictionContext
                            .restrictedUserIds,
                    ];

                if (
                    restrictedIds.length
                ) {
                    await tx
                        .report_assignments
                        .updateMany({
                            where: {
                                report_id:
                                    report.id,

                                assigned_user_id: {
                                    in:
                                        restrictedIds,
                                },

                                ended_at:
                                    null,
                            },

                            data: {
                                ended_at:
                                    now,
                            },
                        });
                }

                if (
                    plan.targetUserId ||
                    plan.targetTeamId
                ) {
                    await tx
                        .report_assignments
                        .create({
                            data: {
                                id:
                                    randomUUID(),

                                report_id:
                                    report.id,

                                assigned_user_id:
                                    plan
                                        .targetUserId,

                                assigned_team_id:
                                    plan
                                        .targetTeamId,

                                assigned_by_type:
                                    "SYSTEM",

                                assigned_by_user_id:
                                    null,

                                type:
                                    plan
                                        .targetTeamId
                                        ? "TEAM"
                                        : "PRIMARY",

                                started_at:
                                    now,
                            },
                        });
                }

                if (
                    report
                        .current_assignee_user_id ||
                    report
                        .current_assignee_team_id
                ) {
                    await tx.report_events
                        .create({
                            data: {
                                id:
                                    randomUUID(),

                                report_id:
                                    report.id,

                                event_type:
                                    "UNASSIGNED",

                                actor_type:
                                    "SYSTEM",

                                actor_user_id:
                                    null,

                                metadata_ciphertext:
                                    metadata
                                        .ciphertext,

                                metadata_iv:
                                    metadata
                                        .iv,

                                metadata_auth_tag:
                                    metadata
                                        .authTag,

                                metadata_key_version:
                                    metadata
                                        .keyVersion,
                            },
                        });
                }

                if (
                    plan.targetUserId ||
                    plan.targetTeamId
                ) {
                    await tx.report_events
                        .create({
                            data: {
                                id:
                                    randomUUID(),

                                report_id:
                                    report.id,

                                event_type:
                                    "ASSIGNED",

                                actor_type:
                                    "SYSTEM",

                                actor_user_id:
                                    null,

                                metadata_ciphertext:
                                    metadata
                                        .ciphertext,

                                metadata_iv:
                                    metadata
                                        .iv,

                                metadata_auth_tag:
                                    metadata
                                        .authTag,

                                metadata_key_version:
                                    metadata
                                        .keyVersion,
                            },
                        });
                }
            }

            if (
                priorityChanged
            ) {
                const priorityMetadata =
                    encryptJson(
                        {
                            automatic:
                                true,

                            trigger,

                            previousPriority:
                                report.priority,

                            newPriority:
                                plan.priority,

                            matchedRuleIds:
                                plan
                                    .matchedRuleIds,
                        },
                        "REPORT_EVENT_METADATA"
                    );

                await tx.report_events
                    .create({
                        data: {
                            id:
                                randomUUID(),

                            report_id:
                                report.id,

                            event_type:
                                "PRIORITY_CHANGED",

                            actor_type:
                                "SYSTEM",

                            actor_user_id:
                                null,

                            metadata_ciphertext:
                                priorityMetadata
                                    .ciphertext,

                            metadata_iv:
                                priorityMetadata
                                    .iv,

                            metadata_auth_tag:
                                priorityMetadata
                                    .authTag,

                            metadata_key_version:
                                priorityMetadata
                                    .keyVersion,
                        },
                    });
            }

            await tx.audit_logs.create({
                data: {
                    actor_type:
                        "SYSTEM",

                    actor_user_id:
                        null,

                    action:
                        "REPORT_ROUTED_AUTOMATICALLY",

                    entity_type:
                        "REPORT",

                    entity_id:
                        report.id,

                    success:
                        true,

                    request_id:
                        randomUUID(),

                    metadata_json:
                        JSON.stringify({
                            trigger,

                            matchedRuleIds:
                                plan
                                    .matchedRuleIds,

                            skippedUnsafeRuleIds:
                                plan
                                    .skippedUnsafeRuleIds,

                            assignmentChanged,

                            priorityChanged,
                        }),
                },
            });
        }
    );

    return {
        routed:
            true,

        assignmentChanged,
        priorityChanged,

        targetUserId:
            plan.targetUserId,

        targetTeamId:
            plan.targetTeamId,

        priority:
            plan.priority,

        matchedRuleIds:
            plan.matchedRuleIds,

        skippedUnsafeRuleIds:
            plan.skippedUnsafeRuleIds,
    };
}

async function routeReport(
    reportId,
    trigger =
        "MANUAL_REEVALUATION"
) {
    const report =
        await getReport(
            reportId
        );

    /*
     * Não roteamos casos já encerrados.
     */
    if (
        [
            "CONCLUDED",
            "ARCHIVED",
        ].includes(
            report.status
        )
    ) {
        return {
            routed:
                false,

            reason:
                "STATUS_NOT_ROUTABLE",
        };
    }

    const restrictionContext =
        await getRestrictionContext(
            reportId
        );

    const rules =
        await prisma
            .routing_rules
            .findMany({
                where: {
                    is_active:
                        true,
                },

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

    const plan =
        await buildRoutingPlan(
            report,
            rules,
            restrictionContext
        );

    try {
        return await applyRoutingPlan(
            report,
            plan,
            restrictionContext,
            trigger
        );
    } catch (error) {
        if (
        [
            "REPORT_STATE_CHANGED",
            "ROUTING_TARGET_RESTRICTED",
            "ROUTING_TARGET_UNSAFE",
        ].includes(
            error.code
        )
        ) {
            const freshReport =
                await getReport(
                    reportId
                );

            const freshRestrictions =
                await getRestrictionContext(
                    reportId
                );

            const freshPlan =
                await buildRoutingPlan(
                    freshReport,
                    rules,
                    freshRestrictions
                );

            return applyRoutingPlan(
                freshReport,
                freshPlan,
                freshRestrictions,
                `${trigger}_RETRY`
            );
        }

        throw error;
    }
}

module.exports = {
    routeReport,
};
