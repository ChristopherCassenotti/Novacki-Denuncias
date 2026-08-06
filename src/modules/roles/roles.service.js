const { randomUUID } = require("node:crypto");

const prisma = require("../../database/prisma");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizeDescription(description) {
  if (description === undefined) {
    return undefined;
  }

  if (description === null || description.trim() === "") {
    return null;
  }

  return description.trim();
}

async function findRoleOrFail(database, roleId) {
  const role = await database.roles.findUnique({
    where: {
      id: roleId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      is_system: true,
      is_active: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!role) {
    throw createServiceError("Perfil não encontrado.", 404);
  }

  return role;
}

function ensureRoleCanBeModified(role) {
  if (role.is_system) {
    throw createServiceError(
      "Perfis internos do sistema não podem ser modificados.",
      403
    );
  }
}

async function validatePermissionIds(database, permissionIds = []) {
  const uniquePermissionIds = [...new Set(permissionIds)];

  if (uniquePermissionIds.length === 0) {
    return [];
  }

  const permissions = await database.permissions.findMany({
    where: {
      id: {
        in: uniquePermissionIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (permissions.length !== uniquePermissionIds.length) {
    const existingPermissionIds = new Set(
      permissions.map((permission) => permission.id)
    );

    const invalidPermissionIds = uniquePermissionIds.filter(
      (permissionId) => !existingPermissionIds.has(permissionId)
    );

    throw createServiceError(
      `Uma ou mais permissões não existem: ${invalidPermissionIds.join(", ")}`,
      400
    );
  }

  return uniquePermissionIds;
}

async function getRoleById(roleId) {
  const role = await findRoleOrFail(prisma, roleId);

  const assignments = await prisma.role_permissions.findMany({
    where: {
      role_id: role.id,
    },
    select: {
      permission_id: true,
    },
  });

  const permissionIds = assignments.map(
    (assignment) => assignment.permission_id
  );

  const permissions =
    permissionIds.length === 0
      ? []
      : await prisma.permissions.findMany({
          where: {
            id: {
              in: permissionIds,
            },
          },
          select: {
            id: true,
            code: true,
            description: true,
          },
          orderBy: {
            code: "asc",
          },
        });

  return {
    ...role,
    permissions,
  };
}

async function listRoles() {
  const roles = await prisma.roles.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      is_system: true,
      is_active: true,
      created_at: true,
      updated_at: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  if (roles.length === 0) {
    return [];
  }

  const roleIds = roles.map((role) => role.id);

  const assignments = await prisma.role_permissions.findMany({
    where: {
      role_id: {
        in: roleIds,
      },
    },
    select: {
      role_id: true,
      permission_id: true,
    },
  });

  const permissionIds = [
    ...new Set(
      assignments.map(
        (assignment) => assignment.permission_id
      )
    ),
  ];

  const permissions =
    permissionIds.length === 0
      ? []
      : await prisma.permissions.findMany({
          where: {
            id: {
              in: permissionIds,
            },
          },
          select: {
            id: true,
            code: true,
            description: true,
          },
          orderBy: {
            code: "asc",
          },
        });

  const permissionMap = new Map(
    permissions.map((permission) => [
      permission.id,
      permission,
    ])
  );

  const permissionsByRole = new Map();

  for (const assignment of assignments) {
    const permission = permissionMap.get(
      assignment.permission_id
    );

    if (!permission) {
      continue;
    }

    const rolePermissions =
      permissionsByRole.get(assignment.role_id) || [];

    rolePermissions.push(permission);

    permissionsByRole.set(
      assignment.role_id,
      rolePermissions
    );
  }

  return roles.map((role) => ({
    ...role,
    permissions: (
      permissionsByRole.get(role.id) || []
    ).sort((a, b) =>
      a.code.localeCompare(b.code)
    ),
  }));
}

async function createRole(
  {
    code,
    name,
    description,
    permissionIds = [],
  },
  actorUserId
) {
  const existingRole = await prisma.roles.findUnique({
    where: {
      code,
    },
    select: {
      id: true,
    },
  });

  if (existingRole) {
    throw createServiceError(
      "Já existe um perfil com esse código.",
      409
    );
  }

  const roleId = randomUUID();

  await prisma.$transaction(async (tx) => {
    const validPermissionIds =
      await validatePermissionIds(
        tx,
        permissionIds
      );

    await tx.roles.create({
      data: {
        id: roleId,
        code,
        name,
        description:
          normalizeDescription(description) ?? null,
        is_system: false,
        is_active: true,
      },
    });

    if (validPermissionIds.length > 0) {
      await tx.role_permissions.createMany({
        data: validPermissionIds.map(
          (permissionId) => ({
            role_id: roleId,
            permission_id: permissionId,
          })
        ),
        skipDuplicates: true,
      });
    }

    await tx.audit_logs.create({
      data: {
        actor_type: "ADMIN",
        actor_user_id: actorUserId,
        action: "ROLE_CREATED",
        entity_type: "ROLE",
        entity_id: roleId,
        success: true,
        request_id: randomUUID(),
        metadata_json: JSON.stringify({
          code,
          name,
          permissionIds: validPermissionIds,
        }),
      },
    });
  });

  return getRoleById(roleId);
}

async function updateRole(
  roleId,
  {
    name,
    description,
  },
  actorUserId
) {
  const currentRole = await findRoleOrFail(
    prisma,
    roleId
  );

  ensureRoleCanBeModified(currentRole);

  const updateData = {};

  if (name !== undefined) {
    updateData.name = name;
  }

  if (description !== undefined) {
    updateData.description =
      normalizeDescription(description);
  }

  await prisma.$transaction(async (tx) => {
    await tx.roles.update({
      where: {
        id: roleId,
      },
      data: updateData,
    });

    await tx.audit_logs.create({
      data: {
        actor_type: "ADMIN",
        actor_user_id: actorUserId,
        action: "ROLE_UPDATED",
        entity_type: "ROLE",
        entity_id: roleId,
        success: true,
        request_id: randomUUID(),
        metadata_json: JSON.stringify({
          changedFields: Object.keys(updateData),
          previous: {
            name: currentRole.name,
            description: currentRole.description,
          },
          current: updateData,
        }),
      },
    });
  });

  return getRoleById(roleId);
}

async function replaceRolePermissions(
  roleId,
  permissionIds,
  actorUserId
) {
  const currentRole = await findRoleOrFail(
    prisma,
    roleId
  );

  ensureRoleCanBeModified(currentRole);

  await prisma.$transaction(async (tx) => {
    const validPermissionIds =
      await validatePermissionIds(
        tx,
        permissionIds
      );

    const previousAssignments =
      await tx.role_permissions.findMany({
        where: {
          role_id: roleId,
        },
        select: {
          permission_id: true,
        },
      });

    const previousPermissionIds =
      previousAssignments.map(
        (assignment) => assignment.permission_id
      );

    await tx.role_permissions.deleteMany({
      where: {
        role_id: roleId,
      },
    });

    if (validPermissionIds.length > 0) {
      await tx.role_permissions.createMany({
        data: validPermissionIds.map(
          (permissionId) => ({
            role_id: roleId,
            permission_id: permissionId,
          })
        ),
        skipDuplicates: true,
      });
    }

    await tx.audit_logs.create({
      data: {
        actor_type: "ADMIN",
        actor_user_id: actorUserId,
        action: "ROLE_PERMISSIONS_REPLACED",
        entity_type: "ROLE",
        entity_id: roleId,
        success: true,
        request_id: randomUUID(),
        metadata_json: JSON.stringify({
          previousPermissionIds,
          currentPermissionIds:
            validPermissionIds,
        }),
      },
    });
  });

  return getRoleById(roleId);
}

async function changeRoleStatus(
  roleId,
  isActive,
  actorUserId
) {
  const currentRole = await findRoleOrFail(
    prisma,
    roleId
  );

  ensureRoleCanBeModified(currentRole);

  if (currentRole.is_active === isActive) {
    return getRoleById(roleId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.roles.update({
      where: {
        id: roleId,
      },
      data: {
        is_active: isActive,
      },
    });

    await tx.audit_logs.create({
      data: {
        actor_type: "ADMIN",
        actor_user_id: actorUserId,
        action: isActive
          ? "ROLE_ACTIVATED"
          : "ROLE_DEACTIVATED",
        entity_type: "ROLE",
        entity_id: roleId,
        success: true,
        request_id: randomUUID(),
        metadata_json: JSON.stringify({
          previousStatus: currentRole.is_active,
          currentStatus: isActive,
        }),
      },
    });
  });

  return getRoleById(roleId);
}

module.exports = {
  getRoleById,
  listRoles,
  createRole,
  updateRole,
  replaceRolePermissions,
  changeRoleStatus,
};