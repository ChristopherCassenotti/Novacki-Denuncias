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
    createScopedAuditLog,
} = require(
    "../adminAuditLogs/auditScope.service"
);

const {
  getActorUnitScope,
  getScopedUserIds,
  assertUnitIdsWithinActorScope,
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


function serializeAuditMetadata(
  metadata
) {
  return metadata == null
    ? null
    : JSON.stringify(
        metadata
      );
}


function normalizeDescription(
  description
) {
  if (
    description ===
    undefined
  ) {
    return undefined;
  }

  if (
    description ===
      null ||
    description.trim() ===
      ""
  ) {
    return null;
  }

  return description.trim();
}


async function findTeamOrFail(
  database,
  teamId
) {
  const team =
    await database
      .teams
      .findUnique({
        where: {
          id:
            teamId,
        },

        select: {
          id:
            true,

          name:
            true,

          description:
            true,

          is_independent:
            true,

          is_active:
            true,

          created_at:
            true,

          updated_at:
            true,
        },
      });

  if (!team) {
    throw createServiceError(
      "Equipe não encontrada.",
      404
    );
  }

  return team;
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

  const units =
    await database
      .units
      .findMany({
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


async function getTeamUnitIds(
  database,
  teamId
) {
  const assignments =
    await database
      .team_units
      .findMany({
        where: {
          team_id:
            teamId,
        },

        select: {
          unit_id:
            true,
        },
      });

  return assignments.map(
    (assignment) =>
      assignment.unit_id
  );
}


async function assertTeamWithinActorScope(
  actorUserId,
  teamId,
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

  const teamUnitIds =
    await getTeamUnitIds(
      database,
      teamId
    );

  /*
   * Equipe sem unidade é considerada
   * legada e não aparece para gerente
   * regional.
   */
  if (
    teamUnitIds.length ===
    0
  ) {
    throw createServiceError(
      "Equipe não encontrada.",
      404
    );
  }

  const actorUnits =
    new Set(
      scope.unitIds
    );

  const fullyInside =
    teamUnitIds.every(
      (unitId) =>
        actorUnits.has(
          unitId
        )
    );

  if (!fullyInside) {
    throw createServiceError(
      "Equipe não encontrada.",
      404
    );
  }

  return true;
}


async function getScopedTeamIds(
  actorUserId,
  database = prisma
) {
  const scope =
    await getActorUnitScope(
      actorUserId,
      database
    );

  /*
   * null = ADMIN_MASTER,
   * portanto sem filtro.
   */
  if (
    scope.isAdminMaster
  ) {
    return null;
  }

  if (
    scope.unitIds.length ===
    0
  ) {
    return [];
  }

  const inside =
    await database
      .team_units
      .findMany({
        where: {
          unit_id: {
            in:
              scope.unitIds,
          },
        },

        select: {
          team_id:
            true,
        },
      });

  const candidates = [
    ...new Set(
      inside.map(
        (item) =>
          item.team_id
      )
    ),
  ];

  if (
    candidates.length ===
    0
  ) {
    return [];
  }

  /*
   * Se uma equipe também possuir unidade
   * fora do escopo do ator, ela some
   * completamente para ele.
   */
  const outside =
    await database
      .team_units
      .findMany({
        where: {
          team_id: {
            in:
              candidates,
          },

          unit_id: {
            notIn:
              scope.unitIds,
          },
        },

        select: {
          team_id:
            true,
        },
      });

  const outsideIds =
    new Set(
      outside.map(
        (item) =>
          item.team_id
      )
    );

  return candidates.filter(
    (teamId) =>
      !outsideIds.has(
        teamId
      )
  );
}


async function validateMembers(
  database,
  members,
  teamUnitIds,
  actorUserId
) {
  if (
    members.length ===
    0
  ) {
    return [];
  }

  const userIds =
    members.map(
      (member) =>
        member.userId
    );

  const users =
    await database
      .users
      .findMany({
        where: {
          id: {
            in:
              userIds,
          },
        },

        select: {
          id:
            true,

          is_active:
            true,
        },
      });

  if (
    users.length !==
    userIds.length
  ) {
    throw createServiceError(
      "Um ou mais usuários informados não existem.",
      400
    );
  }

  const inactive =
    users.filter(
      (user) =>
        !user.is_active
    );

  if (
    inactive.length >
    0
  ) {
    throw createServiceError(
      "Usuários inativos não podem ser adicionados à equipe.",
      400
    );
  }

  /*
   * Um gerente regional nunca pode
   * adicionar membro fora do próprio
   * escopo.
   */
  const scopedUserIds =
    await getScopedUserIds(
      actorUserId,
      database
    );

  if (
    scopedUserIds !==
    null
  ) {
    const allowed =
      new Set(
        scopedUserIds
      );

    const outside =
      userIds.some(
        (userId) =>
          !allowed.has(
            userId
          )
      );

    if (outside) {
      throw createServiceError(
        "Um ou mais usuários não estão disponíveis no seu escopo.",
        403
      );
    }
  }

  /*
   * Cada membro precisa pertencer a
   * pelo menos uma das unidades da equipe.
   */
  const assignments =
    await database
      .user_units
      .findMany({
        where: {
          user_id: {
            in:
              userIds,
          },

          unit_id: {
            in:
              teamUnitIds,
          },
        },

        select: {
          user_id:
            true,
        },
      });

  const eligibleIds =
    new Set(
      assignments.map(
        (item) =>
          item.user_id
      )
    );

  const invalidMember =
    userIds.some(
      (userId) =>
        !eligibleIds.has(
          userId
        )
    );

  if (invalidMember) {
    throw createServiceError(
      "Um ou mais usuários não pertencem às unidades desta equipe.",
      400
    );
  }

  return members;
}


async function attachContext(
  team,
  database = prisma
) {
  const [
    unitAssignments,
    memberAssignments,
  ] =
    await Promise.all([
      database
        .team_units
        .findMany({
          where: {
            team_id:
              team.id,
          },

          select: {
            unit_id:
              true,
          },
        }),

      database
        .team_members
        .findMany({
          where: {
            team_id:
              team.id,
          },

          select: {
            user_id:
              true,

            role:
              true,

            joined_at:
              true,
          },
        }),
    ]);

  const unitIds =
    unitAssignments.map(
      (item) =>
        item.unit_id
    );

  const userIds =
    memberAssignments.map(
      (item) =>
        item.user_id
    );

  const [
    units,
    users,
  ] =
    await Promise.all([
      unitIds.length
        ? database
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
            })
        : [],

      userIds.length
        ? database
            .users
            .findMany({
              where: {
                id: {
                  in:
                    userIds,
                },
              },

              select: {
                id:
                  true,

                name:
                  true,

                email:
                  true,

                is_active:
                  true,
              },
            })
        : [],
    ]);

  const userMap =
    new Map(
      users.map(
        (user) => [
          user.id,
          user,
        ]
      )
    );

  const members =
    memberAssignments
      .map(
        (assignment) => {
          const user =
            userMap.get(
              assignment.user_id
            );

          if (!user) {
            return null;
          }

          return {
            ...user,

            teamRole:
              assignment.role,

            joinedAt:
              assignment.joined_at,
          };
        }
      )
      .filter(Boolean);

  return {
    ...team,

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

    members,
  };
}


async function getTeamById(
  teamId,
  actorUserId = null
) {
  if (
    actorUserId
  ) {
    await assertTeamWithinActorScope(
      actorUserId,
      teamId
    );
  }

  const team =
    await findTeamOrFail(
      prisma,
      teamId
    );

  return attachContext(
    team
  );
}


async function listTeams(
  actorUserId
) {
  const scopedIds =
    await getScopedTeamIds(
      actorUserId
    );

  if (
    scopedIds !== null &&
    scopedIds.length === 0
  ) {
    return [];
  }

  const teams =
    await prisma
      .teams
      .findMany({
        where:
          scopedIds === null
            ? {}
            : {
                id: {
                  in:
                    scopedIds,
                },
              },

        select: {
          id:
            true,

          name:
            true,

          description:
            true,

          is_independent:
            true,

          is_active:
            true,

          created_at:
            true,

          updated_at:
            true,
        },

        orderBy: {
          name:
            "asc",
        },
      });

  return Promise.all(
    teams.map(
      (team) =>
        attachContext(
          team
        )
    )
  );
}


async function createTeam(
  {
    name,
    description,
    isIndependent,
    unitIds,
    members,
  },
  actorUserId
) {
  const existingTeam =
    await prisma
      .teams
      .findUnique({
        where: {
          name,
        },

        select: {
          id:
            true,
        },
      });

  if (existingTeam) {
    throw createServiceError(
      "Já existe uma equipe com esse nome.",
      409
    );
  }

  const teamId =
    randomUUID();

  await prisma
    .$transaction(
      async (tx) => {
        const validUnitIds =
          await validateUnitIds(
            tx,
            unitIds
          );

        await assertUnitIdsWithinActorScope(
          actorUserId,
          validUnitIds,
          tx
        );

        const validMembers =
          await validateMembers(
            tx,
            members,
            validUnitIds,
            actorUserId
          );

        await tx
          .teams
          .create({
            data: {
              id:
                teamId,

              name,

              description:
                normalizeDescription(
                  description
                ) ?? null,

              is_independent:
                isIndependent,

              is_active:
                true,
            },
          });

        await tx
          .team_units
          .createMany({
            data:
              validUnitIds.map(
                (unitId) => ({
                  team_id:
                    teamId,

                  unit_id:
                    unitId,
                })
              ),

            skipDuplicates:
              true,
          });

        if (
          validMembers.length >
          0
        ) {
          await tx
            .team_members
            .createMany({
              data:
                validMembers.map(
                  (member) => ({
                    team_id:
                      teamId,

                    user_id:
                      member.userId,

                    role:
                      member.role,
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
                "TEAM_CREATED",

              entity_type:
                "TEAM",

              entity_id:
                teamId,

              success:
                true,

              request_id:
                randomUUID(),

              metadata_json:
                serializeAuditMetadata({
                  name,

                  isIndependent,

                  unitIds:
                    validUnitIds,

                  members:
                    validMembers,
                }),
            }
        );
      }
    );

  return getTeamById(
    teamId,
    actorUserId
  );
}


async function updateTeam(
  teamId,
  data,
  actorUserId
) {
  await assertTeamWithinActorScope(
    actorUserId,
    teamId
  );

  const currentTeam =
    await findTeamOrFail(
      prisma,
      teamId
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
    data.description !==
    undefined
  ) {
    updateData.description =
      normalizeDescription(
        data.description
      );
  }

  if (
    data.isIndependent !==
    undefined
  ) {
    updateData.is_independent =
      data.isIndependent;
  }

  await prisma
    .$transaction(
      async (tx) => {
        await tx
          .teams
          .update({
            where: {
              id:
                teamId,
            },

            data:
              updateData,
          });

        await createScopedAuditLog(
            tx,
            {
              actor_type:
                "ADMIN",

              actor_user_id:
                actorUserId,

              action:
                "TEAM_UPDATED",

              entity_type:
                "TEAM",

              entity_id:
                teamId,

              success:
                true,

              request_id:
                randomUUID(),

              metadata_json:
                serializeAuditMetadata({
                  previous: {
                    name:
                      currentTeam.name,

                    description:
                      currentTeam.description,

                    isIndependent:
                      currentTeam
                        .is_independent,
                  },

                  current:
                    updateData,
                }),
            }
        );
      }
    );

  return getTeamById(
    teamId,
    actorUserId
  );
}


async function replaceTeamMembers(
  teamId,
  members,
  actorUserId
) {
  await assertTeamWithinActorScope(
    actorUserId,
    teamId
  );

  await prisma
    .$transaction(
      async (tx) => {
        const teamUnitIds =
          await getTeamUnitIds(
            tx,
            teamId
          );

        const validMembers =
          await validateMembers(
            tx,
            members,
            teamUnitIds,
            actorUserId
          );

        const previousMembers =
          await tx
            .team_members
            .findMany({
              where: {
                team_id:
                  teamId,
              },

              select: {
                user_id:
                  true,

                role:
                  true,
              },
            });

        await tx
          .team_members
          .deleteMany({
            where: {
              team_id:
                teamId,
            },
          });

        if (
          validMembers.length >
          0
        ) {
          await tx
            .team_members
            .createMany({
              data:
                validMembers.map(
                  (member) => ({
                    team_id:
                      teamId,

                    user_id:
                      member.userId,

                    role:
                      member.role,
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
                "TEAM_MEMBERS_REPLACED",

              entity_type:
                "TEAM",

              entity_id:
                teamId,

              success:
                true,

              request_id:
                randomUUID(),

              metadata_json:
                serializeAuditMetadata({
                  previousMembers,

                  currentMembers:
                    validMembers,
                }),
            }
        );
      }
    );

  return getTeamById(
    teamId,
    actorUserId
  );
}


async function replaceTeamUnits(
  teamId,
  unitIds,
  actorUserId
) {
  await assertTeamWithinActorScope(
    actorUserId,
    teamId
  );

  await prisma
    .$transaction(
      async (tx) => {
        const validUnitIds =
          await validateUnitIds(
            tx,
            unitIds
          );

        await assertUnitIdsWithinActorScope(
          actorUserId,
          validUnitIds,
          tx
        );

        const previousUnits =
          await getTeamUnitIds(
            tx,
            teamId
          );

        const previousMembers =
          await tx
            .team_members
            .findMany({
              where: {
                team_id:
                  teamId,
              },

              select: {
                user_id:
                  true,
              },
            });

        await tx
          .team_units
          .deleteMany({
            where: {
              team_id:
                teamId,
            },
          });

        await tx
          .team_units
          .createMany({
            data:
              validUnitIds.map(
                (unitId) => ({
                  team_id:
                    teamId,

                  unit_id:
                    unitId,
                })
              ),

            skipDuplicates:
              true,
          });

        /*
         * Se uma unidade for retirada da
         * equipe, removemos automaticamente
         * membros que deixaram de pertencer
         * a qualquer unidade restante.
         */
        const memberIds =
          previousMembers.map(
            (item) =>
              item.user_id
          );

        let removedMemberIds = [];

        if (
          memberIds.length >
          0
        ) {
          const validAssignments =
            await tx
              .user_units
              .findMany({
                where: {
                  user_id: {
                    in:
                      memberIds,
                  },

                  unit_id: {
                    in:
                      validUnitIds,
                  },
                },

                select: {
                  user_id:
                    true,
                },
              });

          const stillEligible =
            new Set(
              validAssignments.map(
                (item) =>
                  item.user_id
              )
            );

          removedMemberIds =
            memberIds.filter(
              (userId) =>
                !stillEligible.has(
                  userId
                )
            );

          if (
            removedMemberIds.length >
            0
          ) {
            await tx
              .team_members
              .deleteMany({
                where: {
                  team_id:
                    teamId,

                  user_id: {
                    in:
                      removedMemberIds,
                  },
                },
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
                "TEAM_UNITS_REPLACED",

              entity_type:
                "TEAM",

              entity_id:
                teamId,

              success:
                true,

              request_id:
                randomUUID(),

              metadata_json:
                serializeAuditMetadata({
                  previousUnitIds:
                    previousUnits,

                  currentUnitIds:
                    validUnitIds,

                  removedMemberIds,
                }),
            },
            previousUnits
        );
      }
    );

  return getTeamById(
    teamId,
    actorUserId
  );
}


async function changeTeamStatus(
  teamId,
  isActive,
  actorUserId
) {
  await assertTeamWithinActorScope(
    actorUserId,
    teamId
  );

  const currentTeam =
    await findTeamOrFail(
      prisma,
      teamId
    );

  if (
    currentTeam.is_active ===
    isActive
  ) {
    return getTeamById(
      teamId,
      actorUserId
    );
  }

  await prisma
    .$transaction(
      async (tx) => {
        await tx
          .teams
          .update({
            where: {
              id:
                teamId,
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
                  ? "TEAM_ACTIVATED"
                  : "TEAM_DEACTIVATED",

              entity_type:
                "TEAM",

              entity_id:
                teamId,

              success:
                true,

              request_id:
                randomUUID(),

              metadata_json:
                serializeAuditMetadata({
                  previousStatus:
                    currentTeam
                      .is_active,

                  currentStatus:
                    isActive,
                }),
            }
        );
      }
    );

  return getTeamById(
    teamId,
    actorUserId
  );
}


module.exports = {
  getTeamById,
  listTeams,
  createTeam,
  updateTeam,
  replaceTeamMembers,
  replaceTeamUnits,
  changeTeamStatus,
};
