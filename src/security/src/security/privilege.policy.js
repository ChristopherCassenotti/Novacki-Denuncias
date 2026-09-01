function createForbiddenError(message) {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

async function getEffectivePermissionIds(database, userId) {
  const assignments = await database.user_roles.findMany({
    where: { user_id: userId },
    select: { role_id: true },
  });

  if (assignments.length === 0) {
    return new Set();
  }

  const assignedRoleIds = assignments.map(({ role_id }) => role_id);
  const activeRoles = await database.roles.findMany({
    where: {
      id: { in: assignedRoleIds },
      is_active: true,
    },
    select: { id: true },
  });

  if (activeRoles.length === 0) {
    return new Set();
  }

  const rolePermissions = await database.role_permissions.findMany({
    where: {
      role_id: { in: activeRoles.map(({ id }) => id) },
    },
    select: { permission_id: true },
  });

  return new Set(
    rolePermissions.map(({ permission_id }) => permission_id)
  );
}

function findMissingPermissions(actorPermissionIds, requestedPermissionIds) {
  return [...new Set(requestedPermissionIds)].filter(
    (permissionId) => !actorPermissionIds.has(permissionId)
  );
}

async function assertActorCanGrantPermissions(
  database,
  actorUserId,
  permissionIds
) {
  const actorPermissionIds = await getEffectivePermissionIds(
    database,
    actorUserId
  );
  const missingPermissionIds = findMissingPermissions(
    actorPermissionIds,
    permissionIds
  );

  if (missingPermissionIds.length > 0) {
    throw createForbiddenError(
      "Você não pode conceder permissões que não possui."
    );
  }
}

async function getPermissionIdsForRoles(database, roleIds) {
  if (roleIds.length === 0) {
    return [];
  }

  const assignments = await database.role_permissions.findMany({
    where: { role_id: { in: [...new Set(roleIds)] } },
    select: { permission_id: true },
  });

  return [...new Set(assignments.map(({ permission_id }) => permission_id))];
}

async function assertActorCanAssignRoles(database, actorUserId, roleIds) {
  const targetPermissionIds = await getPermissionIdsForRoles(
    database,
    roleIds
  );

  await assertActorCanGrantPermissions(
    database,
    actorUserId,
    targetPermissionIds
  );
}

async function assertActorCanManageUser(
  database,
  actorUserId,
  targetUserId
) {
  if (actorUserId === targetUserId) {
    return;
  }

  const [actorPermissionIds, targetPermissionIds] = await Promise.all([
    getEffectivePermissionIds(database, actorUserId),
    getEffectivePermissionIds(database, targetUserId),
  ]);

  const missingPermissionIds = findMissingPermissions(
    actorPermissionIds,
    targetPermissionIds
  );

  if (missingPermissionIds.length > 0) {
    throw createForbiddenError(
      "Você não pode administrar um usuário com privilégios superiores aos seus."
    );
  }
}

async function assertActorCanModifyRole(database, actorUserId, roleId) {
  const actorAssignment = await database.user_roles.findUnique({
    where: {
      user_id_role_id: {
        user_id: actorUserId,
        role_id: roleId,
      },
    },
    select: { user_id: true },
  });

  if (actorAssignment) {
    throw createForbiddenError(
      "Você não pode modificar um perfil atribuído à sua própria conta."
    );
  }

  const currentPermissionIds = await getPermissionIdsForRoles(database, [
    roleId,
  ]);

  await assertActorCanGrantPermissions(
    database,
    actorUserId,
    currentPermissionIds
  );
}

module.exports = {
  assertActorCanAssignRoles,
  assertActorCanGrantPermissions,
  assertActorCanManageUser,
  assertActorCanModifyRole,
  getEffectivePermissionIds,
};
