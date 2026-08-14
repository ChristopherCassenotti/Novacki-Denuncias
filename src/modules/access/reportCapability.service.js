const prisma = require(
  "../../database/prisma"
);

const SCOPE_LEVELS = {
  VIEW: 1,
  MESSAGE: 2,
  INVESTIGATE: 3,
  MANAGE: 4,
};

function createAccessError(
  message,
  statusCode
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  return error;
}

async function userHasPermission(
  userId,
  permissionCode
) {
  const assignments =
    await prisma.user_roles.findMany({
      where: {
        user_id: userId,
      },

      select: {
        role_id: true,
      },
    });

  if (!assignments.length) {
    return false;
  }

  const roleIds =
    assignments.map(
      (item) => item.role_id
    );

  const activeRoles =
    await prisma.roles.findMany({
      where: {
        id: {
          in: roleIds,
        },

        is_active: true,
      },

      select: {
        id: true,
      },
    });

  if (!activeRoles.length) {
    return false;
  }

  const activeRoleIds =
    activeRoles.map(
      (role) => role.id
    );

  const rolePermissions =
    await prisma.role_permissions.findMany({
      where: {
        role_id: {
          in: activeRoleIds,
        },
      },

      select: {
        permission_id: true,
      },
    });

  if (!rolePermissions.length) {
    return false;
  }

  const permissionIds =
    rolePermissions.map(
      (item) =>
        item.permission_id
    );

  const permission =
    await prisma.permissions.findFirst({
      where: {
        id: {
          in: permissionIds,
        },

        code:
          permissionCode,
      },

      select: {
        id: true,
      },
    });

  return Boolean(permission);
}

function getAcceptedScopes(
  requiredScope
) {
  const requiredLevel =
    SCOPE_LEVELS[
      requiredScope
    ];

  if (!requiredLevel) {
    throw new Error(
      `Scope inválido: ${requiredScope}`
    );
  }

  return Object.entries(
    SCOPE_LEVELS
  )
    .filter(
      ([, level]) =>
        level >=
        requiredLevel
    )
    .map(
      ([scope]) =>
        scope
    );
}

async function userHasReportGrant(
  reportId,
  userId,
  requiredScope
) {
  const acceptedScopes =
    getAcceptedScopes(
      requiredScope
    );

  const now =
    new Date();

  const grant =
    await prisma.report_access_grants.findFirst({
      where: {
        report_id:
          reportId,

        user_id:
          userId,

        scope: {
          in:
            acceptedScopes,
        },

        revoked_at:
          null,

        OR: [
          {
            expires_at:
              null,
          },

          {
            expires_at: {
              gt:
                now,
            },
          },
        ],
      },

      select: {
        id: true,
        scope: true,
      },
    });

  return Boolean(grant);
}

async function assertReportCapability({
  reportId,
  userId,
  permission,
  scope,
}) {
  const restriction =
    await prisma.report_restricted_users.findFirst({
      where: {
        report_id:
          reportId,

        user_id:
          userId,

        is_active:
          true,
      },

      select: {
        id: true,
      },
    });

  if (restriction) {
    throw createAccessError(
      "Você não possui acesso a esta denúncia.",
      403
    );
  }
  const hasGlobalPermission =
    await userHasPermission(
      userId,
      permission
    );

  if (
    hasGlobalPermission
  ) {
    return true;
  }

  const hasGrant =
    await userHasReportGrant(
      reportId,
      userId,
      scope
    );

  if (hasGrant) {
    return true;
  }

  throw createAccessError(
    "Você não possui permissão para realizar esta ação nesta denúncia.",
    403
  );
}
async function getReportListAccess(
  userId
) {
  const hasGlobalView =
    await userHasPermission(
      userId,
      "REPORT_VIEW"
    );

  const restrictions =
    await prisma.report_restricted_users.findMany({
      where: {
        user_id:
          userId,

        is_active:
          true,
      },

      select: {
        report_id:
          true,
      },
    });

  const restrictedReportIds =
    restrictions.map(
      (restriction) =>
        restriction.report_id
    );

  /*
   * Quem possui REPORT_VIEW global
   * vê todas, exceto as restritas.
   */
  if (hasGlobalView) {
    return {
      global:
        true,

      restrictedReportIds,
      grantedReportIds:
        [],
    };
  }

  const grants =
    await prisma.report_access_grants.findMany({
      where: {
        user_id:
          userId,

        scope: {
          in: [
            "VIEW",
            "MESSAGE",
            "INVESTIGATE",
            "MANAGE",
          ],
        },

        revoked_at:
          null,

        OR: [
          {
            expires_at:
              null,
          },

          {
            expires_at: {
              gt:
                new Date(),
            },
          },
        ],
      },

      select: {
        report_id:
          true,
      },
    });

  const grantedReportIds = [
    ...new Set(
      grants
        .map(
          (grant) =>
            grant.report_id
        )
        .filter(
          (reportId) =>
            !restrictedReportIds.includes(
              reportId
            )
        )
    ),
  ];

  return {
    global:
      false,

    restrictedReportIds,
    grantedReportIds,
  };
}
module.exports = {
  userHasPermission,
  userHasReportGrant,
  assertReportCapability,
  getAcceptedScopes,
  getReportListAccess,
};