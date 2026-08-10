const {
  randomUUID,
  randomBytes,
} = require("node:crypto");

const bcrypt = require("bcryptjs");

const prisma = require("../../database/prisma");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function serializeAuditMetadata(metadata) {
  if (metadata === undefined || metadata === null) {
    return null;
  }

  return JSON.stringify(metadata);
}

function generateTemporaryPassword() {
  const randomPart = randomBytes(12).toString("base64url");

  return `Nvk!${randomPart}9a`;
}

async function findUserOrFail(database, userId) {
  const user = await database.users.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      is_active: true,
      must_change_password: true,
      last_login_at: true,
      password_changed_at: true,
      disabled_at: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!user) {
    throw createServiceError(
      "Usuário não encontrado.",
      404
    );
  }

  return user;
}

async function validateRoleIds(
  database,
  roleIds = []
) {
  const uniqueRoleIds = [...new Set(roleIds)];

  if (uniqueRoleIds.length === 0) {
    throw createServiceError(
      "O usuário precisa possuir pelo menos um perfil.",
      400
    );
  }

  const roles = await database.roles.findMany({
    where: {
      id: {
        in: uniqueRoleIds,
      },
    },
    select: {
      id: true,
      code: true,
      is_active: true,
    },
  });

  const existingRoleIds = new Set(
    roles.map((role) => role.id)
  );

  const invalidRoleIds = uniqueRoleIds.filter(
    (roleId) => !existingRoleIds.has(roleId)
  );

  if (invalidRoleIds.length > 0) {
    throw createServiceError(
      `Um ou mais perfis não existem: ${invalidRoleIds.join(", ")}`,
      400
    );
  }

  const inactiveRoleIds = roles
    .filter((role) => !role.is_active)
    .map((role) => role.id);

  if (inactiveRoleIds.length > 0) {
    throw createServiceError(
      `Não é possível atribuir perfis inativos: ${inactiveRoleIds.join(", ")}`,
      400
    );
  }

  return uniqueRoleIds;
}

async function attachRolesToUsers(users) {
  if (users.length === 0) {
    return [];
  }

  const userIds = users.map((user) => user.id);

  const assignments =
    await prisma.user_roles.findMany({
      where: {
        user_id: {
          in: userIds,
        },
      },
      select: {
        user_id: true,
        role_id: true,
        assigned_at: true,
      },
    });

  if (assignments.length === 0) {
    return users.map((user) => ({
      ...user,
      roles: [],
    }));
  }

  const roleIds = [
    ...new Set(
      assignments.map(
        (assignment) => assignment.role_id
      )
    ),
  ];

  const roles = await prisma.roles.findMany({
    where: {
      id: {
        in: roleIds,
      },
    },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      is_system: true,
      is_active: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const roleMap = new Map(
    roles.map((role) => [role.id, role])
  );

  const rolesByUser = new Map();

  for (const assignment of assignments) {
    const role = roleMap.get(
      assignment.role_id
    );

    if (!role) {
      continue;
    }

    const currentRoles =
      rolesByUser.get(assignment.user_id) || [];

    currentRoles.push({
      ...role,
      assigned_at: assignment.assigned_at,
    });

    rolesByUser.set(
      assignment.user_id,
      currentRoles
    );
  }

  return users.map((user) => ({
    ...user,
    roles: rolesByUser.get(user.id) || [],
  }));
}

async function getUserById(userId) {
  const user = await findUserOrFail(
    prisma,
    userId
  );

  const [userWithRoles] =
    await attachRolesToUsers([user]);

  return userWithRoles;
}

async function listUsers({
  page,
  limit,
  search,
  isActive,
  roleId,
}) {
  const where = {};

  let filteredUserIds = null;
  if (search) {
    const searchPattern = `%${search}%`;

    const matchedUsers = await prisma.$queryRaw`
      SELECT id
      FROM users
      WHERE
        name COLLATE utf8mb4_unicode_ci
          LIKE (
            CAST(
              ${searchPattern}
              AS CHAR CHARACTER SET utf8mb4
            )
            COLLATE utf8mb4_unicode_ci
          )

        OR

        email COLLATE utf8mb4_unicode_ci
          LIKE (
            CAST(
              ${searchPattern}
              AS CHAR CHARACTER SET utf8mb4
            )
            COLLATE utf8mb4_unicode_ci
          )
    `;

    filteredUserIds = matchedUsers.map(
      (user) => user.id
    );
  }

  if (isActive !== undefined) {
    where.is_active = isActive;
  }

  if (roleId) {
    const assignments =
      await prisma.user_roles.findMany({
        where: {
          role_id: roleId,
        },
        select: {
          user_id: true,
        },
      });

    const userIds = assignments.map(
      (assignment) => assignment.user_id
    );

    if (userIds.length === 0) {
      return {
        users: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    where.id = {
      in: userIds,
    };
  }

  const skip = (page - 1) * limit;

  const [total, users] = await Promise.all([
    prisma.users.count({
      where,
    }),

    prisma.users.findMany({
      where,
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        is_active: true,
        must_change_password: true,
        last_login_at: true,
        password_changed_at: true,
        disabled_at: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: {
        created_at: "desc",
      },
    }),
  ]);

  const usersWithRoles =
    await attachRolesToUsers(users);

  return {
    users: usersWithRoles,

    pagination: {
      page,
      limit,
      total,
      totalPages:
        total === 0
          ? 0
          : Math.ceil(total / limit),
    },
  };
}

async function createUser(
  {
    name,
    email,
    roleIds,
    temporaryPassword,
  },
  actorUserId
) {
  const existingUser =
    await prisma.users.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

  if (existingUser) {
    throw createServiceError(
      "Já existe um usuário com esse e-mail.",
      409
    );
  }

  const generatedPassword =
    temporaryPassword ||
    generateTemporaryPassword();

  const passwordHash = await bcrypt.hash(
    generatedPassword,
    12
  );

  const userId = randomUUID();

  await prisma.$transaction(async (tx) => {
    const validRoleIds =
      await validateRoleIds(
        tx,
        roleIds
      );

    await tx.users.create({
      data: {
        id: userId,
        name,
        email,
        password_hash: passwordHash,
        is_active: true,
        must_change_password: true,
      },
    });

    await tx.user_roles.createMany({
      data: validRoleIds.map((roleId) => ({
        user_id: userId,
        role_id: roleId,
      })),
      skipDuplicates: true,
    });

    await tx.audit_logs.create({
      data: {
        actor_type: "ADMIN",
        actor_user_id: actorUserId,
        action: "USER_CREATED",
        entity_type: "USER",
        entity_id: userId,
        success: true,
        request_id: randomUUID(),

        metadata_json:
          serializeAuditMetadata({
            name,
            email,
            roleIds: validRoleIds,
            temporaryPasswordGenerated:
              temporaryPassword === undefined,
          }),
      },
    });
  });

  return {
    user: await getUserById(userId),

    temporaryPassword:
      generatedPassword,

    passwordWasGenerated:
      temporaryPassword === undefined,
  };
}

async function updateUser(
  userId,
  {
    name,
    email,
  },
  actorUserId
) {
  const currentUser =
    await findUserOrFail(
      prisma,
      userId
    );

  if (
    email !== undefined &&
    email !== currentUser.email
  ) {
    const existingUser =
      await prisma.users.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
        },
      });

    if (
      existingUser &&
      existingUser.id !== userId
    ) {
      throw createServiceError(
        "Já existe um usuário com esse e-mail.",
        409
      );
    }
  }

  const updateData = {};

  if (name !== undefined) {
    updateData.name = name;
  }

  if (email !== undefined) {
    updateData.email = email;
  }

  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: {
        id: userId,
      },
      data: updateData,
    });

    await tx.audit_logs.create({
      data: {
        actor_type: "ADMIN",
        actor_user_id: actorUserId,
        action: "USER_UPDATED",
        entity_type: "USER",
        entity_id: userId,
        success: true,
        request_id: randomUUID(),

        metadata_json:
          serializeAuditMetadata({
            changedFields:
              Object.keys(updateData),

            previous: {
              name: currentUser.name,
              email: currentUser.email,
            },

            current: updateData,
          }),
      },
    });
  });

  return getUserById(userId);
}

async function replaceUserRoles(
  userId,
  roleIds,
  actorUserId
) {
  await findUserOrFail(
    prisma,
    userId
  );

  if (userId === actorUserId) {
    throw createServiceError(
      "Você não pode alterar seus próprios perfis.",
      403
    );
  }

  await prisma.$transaction(async (tx) => {
    const validRoleIds =
      await validateRoleIds(
        tx,
        roleIds
      );

    const previousAssignments =
      await tx.user_roles.findMany({
        where: {
          user_id: userId,
        },
        select: {
          role_id: true,
        },
      });

    const previousRoleIds =
      previousAssignments.map(
        (assignment) => assignment.role_id
      );

    await tx.user_roles.deleteMany({
      where: {
        user_id: userId,
      },
    });

    await tx.user_roles.createMany({
      data: validRoleIds.map((roleId) => ({
        user_id: userId,
        role_id: roleId,
      })),
      skipDuplicates: true,
    });

    await tx.user_sessions.updateMany({
      where: {
        user_id: userId,
        revoked_at: null,
      },
      data: {
        revoked_at: new Date(),
      },
    });

    await tx.audit_logs.create({
      data: {
        actor_type: "ADMIN",
        actor_user_id: actorUserId,
        action: "USER_ROLES_REPLACED",
        entity_type: "USER",
        entity_id: userId,
        success: true,
        request_id: randomUUID(),

        metadata_json:
          serializeAuditMetadata({
            previousRoleIds,
            currentRoleIds: validRoleIds,
          }),
      },
    });
  });

  return getUserById(userId);
}

async function changeUserStatus(
  userId,
  isActive,
  actorUserId
) {
  const currentUser =
    await findUserOrFail(
      prisma,
      userId
    );

  if (userId === actorUserId) {
    throw createServiceError(
      "Você não pode alterar o status da própria conta.",
      403
    );
  }

  if (
    currentUser.is_active === isActive
  ) {
    return getUserById(userId);
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: {
        id: userId,
      },
      data: {
        is_active: isActive,
        disabled_at: isActive
          ? null
          : now,
      },
    });

    if (!isActive) {
      await tx.user_sessions.updateMany({
        where: {
          user_id: userId,
          revoked_at: null,
        },
        data: {
          revoked_at: now,
        },
      });
    }

    await tx.audit_logs.create({
      data: {
        actor_type: "ADMIN",
        actor_user_id: actorUserId,
        action: isActive
          ? "USER_ACTIVATED"
          : "USER_DEACTIVATED",
        entity_type: "USER",
        entity_id: userId,
        success: true,
        request_id: randomUUID(),

        metadata_json:
          serializeAuditMetadata({
            previousStatus:
              currentUser.is_active,
            currentStatus:
              isActive,
          }),
      },
    });
  });

  return getUserById(userId);
}

async function resetUserPassword(
  userId,
  temporaryPassword,
  actorUserId
) {
  await findUserOrFail(
    prisma,
    userId
  );

  if (userId === actorUserId) {
    throw createServiceError(
      "Use a rota de alteração de senha para modificar sua própria senha.",
      403
    );
  }

  const generatedPassword =
    temporaryPassword ||
    generateTemporaryPassword();

  const passwordHash = await bcrypt.hash(
    generatedPassword,
    12
  );

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: {
        id: userId,
      },
      data: {
        password_hash: passwordHash,
        must_change_password: true,
        password_changed_at: now,
      },
    });

    await tx.user_sessions.updateMany({
      where: {
        user_id: userId,
        revoked_at: null,
      },
      data: {
        revoked_at: now,
      },
    });

    await tx.user_one_time_tokens.deleteMany({
      where: {
        user_id: userId,
      },
    });

    await tx.audit_logs.create({
      data: {
        actor_type: "ADMIN",
        actor_user_id: actorUserId,
        action: "USER_PASSWORD_RESET",
        entity_type: "USER",
        entity_id: userId,
        success: true,
        request_id: randomUUID(),

        metadata_json:
          serializeAuditMetadata({
            temporaryPasswordGenerated:
              temporaryPassword === undefined,
            sessionsRevoked: true,
          }),
      },
    });
  });

  return {
    user: await getUserById(userId),

    temporaryPassword:
      generatedPassword,

    passwordWasGenerated:
      temporaryPassword === undefined,
  };
}

module.exports = {
  getUserById,
  listUsers,
  createUser,
  updateUser,
  replaceUserRoles,
  changeUserStatus,
  resetUserPassword,
};