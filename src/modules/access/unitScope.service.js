const prisma =
  require("../../database/prisma");

function createScopeError(
  message,
  statusCode = 403
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  return error;
}

async function isAdminMaster(
  userId,
  database = prisma
) {
  const role =
    await database.roles.findFirst({
      where: {
        code: "ADMIN_MASTER",
        is_active: true,
      },

      select: {
        id: true,
      },
    });

  if (!role) {
    return false;
  }

  const assignment =
    await database.user_roles.findUnique({
      where: {
        user_id_role_id: {
          user_id: userId,
          role_id: role.id,
        },
      },

      select: {
        user_id: true,
      },
    });

  return Boolean(assignment);
}

async function getUserUnitIds(
  userId,
  database = prisma
) {
  const assignments =
    await database.user_units.findMany({
      where: {
        user_id: userId,
      },

      select: {
        unit_id: true,
      },
    });

  return assignments.map(
    (assignment) =>
      assignment.unit_id
  );
}

async function getActorUnitScope(
  actorUserId,
  database = prisma
) {
  const master =
    await isAdminMaster(
      actorUserId,
      database
    );

  if (master) {
    return {
      isAdminMaster: true,
      unitIds: [],
    };
  }

  return {
    isAdminMaster: false,

    unitIds:
      await getUserUnitIds(
        actorUserId,
        database
      ),
  };
}

async function assertUnitIdsWithinActorScope(
  actorUserId,
  unitIds,
  database = prisma
) {
  const scope =
    await getActorUnitScope(
      actorUserId,
      database
    );

  if (scope.isAdminMaster) {
    return true;
  }

  const actorUnits =
    new Set(scope.unitIds);

  const outside =
    [...new Set(unitIds)]
      .filter(
        (unitId) =>
          !actorUnits.has(unitId)
      );

  if (outside.length > 0) {
    throw createScopeError(
      "Você só pode utilizar unidades vinculadas à sua conta.",
      403
    );
  }

  return true;
}

/*
 * Usuários regionais só podem enxergar
 * pessoas totalmente contidas no próprio
 * escopo.
 *
 * Exemplo:
 * ator = M1/M2/Escritório
 * alvo = M1 -> permitido
 * alvo = Monte Mor -> 404
 * alvo = M1 + Monte Mor -> 404
 * alvo = ADMIN_MASTER -> 404
 */
async function assertUserWithinActorScope(
  actorUserId,
  targetUserId,
  database = prisma
) {
  const scope =
    await getActorUnitScope(
      actorUserId,
      database
    );

  if (scope.isAdminMaster) {
    return true;
  }

  const targetIsMaster =
    await isAdminMaster(
      targetUserId,
      database
    );

  if (targetIsMaster) {
    throw createScopeError(
      "Usuário não encontrado.",
      404
    );
  }

  const targetUnitIds =
    await getUserUnitIds(
      targetUserId,
      database
    );

  /*
   * Usuário sem unidade também não deve
   * aparecer para administração regional.
   */
  if (
    targetUnitIds.length === 0
  ) {
    throw createScopeError(
      "Usuário não encontrado.",
      404
    );
  }

  const actorUnits =
    new Set(scope.unitIds);

  const fullyInside =
    targetUnitIds.every(
      (unitId) =>
        actorUnits.has(unitId)
    );

  if (!fullyInside) {
    throw createScopeError(
      "Usuário não encontrado.",
      404
    );
  }

  return true;
}

async function getScopedUserIds(
  actorUserId,
  database = prisma
) {
  const scope =
    await getActorUnitScope(
      actorUserId,
      database
    );

  /*
   * null significa:
   * sem filtro regional.
   */
  if (scope.isAdminMaster) {
    return null;
  }

  if (
    scope.unitIds.length === 0
  ) {
    return [];
  }

  /*
   * Primeiro pegamos quem possui pelo
   * menos uma unidade dentro do escopo.
   */
  const insideAssignments =
    await database.user_units.findMany({
      where: {
        unit_id: {
          in: scope.unitIds,
        },
      },

      select: {
        user_id: true,
      },
    });

  const candidateIds = [
    ...new Set(
      insideAssignments.map(
        (item) => item.user_id
      )
    ),
  ];

  if (
    candidateIds.length === 0
  ) {
    return [];
  }

  /*
   * Depois removemos usuários que também
   * possuam alguma unidade fora do escopo.
   */
  const outsideAssignments =
    await database.user_units.findMany({
      where: {
        user_id: {
          in: candidateIds,
        },

        unit_id: {
          notIn: scope.unitIds,
        },
      },

      select: {
        user_id: true,
      },
    });

  const outsideIds =
    new Set(
      outsideAssignments.map(
        (item) => item.user_id
      )
    );

  /*
   * ADMIN_MASTER nunca aparece para
   * gerente regional.
   */
  const masterRole =
    await database.roles.findFirst({
      where: {
        code: "ADMIN_MASTER",
      },

      select: {
        id: true,
      },
    });

  let masterUserIds =
    new Set();

  if (masterRole) {
    const masterAssignments =
      await database.user_roles.findMany({
        where: {
          role_id:
            masterRole.id,

          user_id: {
            in: candidateIds,
          },
        },

        select: {
          user_id: true,
        },
      });

    masterUserIds =
      new Set(
        masterAssignments.map(
          (item) =>
            item.user_id
        )
      );
  }

  return candidateIds.filter(
    (userId) =>
      !outsideIds.has(userId) &&
      !masterUserIds.has(userId)
  );
}

async function assertAdminMaster(
  actorUserId,
  database = prisma
) {
  if (
    !await isAdminMaster(
      actorUserId,
      database
    )
  ) {
    throw createScopeError(
      "Somente o Administrador Geral pode alterar as unidades de um usuário.",
      403
    );
  }

  return true;
}

async function assertUnitWithinActorScope(
  actorUserId,
  unitId,
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

  const allowed =
    scope.unitIds.includes(
      unitId
    );

  if (!allowed) {
    /*
     * 404 de propósito:
     * o gerente regional não deve nem
     * confirmar a existência de uma
     * unidade fora do seu escopo.
     */
    throw createScopeError(
      "Unidade não encontrada.",
      404
    );
  }

  return true;
}

module.exports = {
  isAdminMaster,
  getUserUnitIds,
  getActorUnitScope,
  getScopedUserIds,
  assertUnitIdsWithinActorScope,
  assertUnitWithinActorScope,
  assertUserWithinActorScope,
  assertAdminMaster,
};