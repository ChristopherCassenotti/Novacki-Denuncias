const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  assertActorCanAssignRoles,
  assertActorCanManageUser,
  assertActorCanModifyRole,
} = require("../../src/security/privilege.policy");

function fakeDatabase({
  userRoles = {},
  activeRoleIds = [],
  rolePermissions = {},
}) {
  return {
    user_roles: {
      async findMany({ where }) {
        return (userRoles[where.user_id] || []).map((role_id) => ({
          role_id,
        }));
      },
      async findUnique({ where }) {
        const { user_id, role_id } = where.user_id_role_id;
        return (userRoles[user_id] || []).includes(role_id)
          ? { user_id }
          : null;
      },
    },
    roles: {
      async findMany({ where }) {
        return where.id.in
          .filter((id) => activeRoleIds.includes(id))
          .map((id) => ({ id }));
      },
    },
    role_permissions: {
      async findMany({ where }) {
        return where.role_id.in.flatMap((roleId) =>
          (rolePermissions[roleId] || []).map((permission_id) => ({
            permission_id,
          }))
        );
      },
    },
  };
}

test("impede atribuir perfil com permissão que o ator não possui", async () => {
  const database = fakeDatabase({
    userRoles: { actor: ["manager"] },
    activeRoleIds: ["manager", "target"],
    rolePermissions: {
      manager: ["USER_MANAGE"],
      target: ["USER_MANAGE", "REPORT_VIEW"],
    },
  });

  await assert.rejects(
    assertActorCanAssignRoles(database, "actor", ["target"]),
    { statusCode: 403 }
  );
});

test("permite atribuir perfil limitado ao conjunto de permissões do ator", async () => {
  const database = fakeDatabase({
    userRoles: { actor: ["manager"] },
    activeRoleIds: ["manager", "target"],
    rolePermissions: {
      manager: ["USER_MANAGE", "TEAM_MANAGE"],
      target: ["TEAM_MANAGE"],
    },
  });

  await assert.doesNotReject(
    assertActorCanAssignRoles(database, "actor", ["target"])
  );
});

test("impede administrar usuário com privilégios superiores", async () => {
  const database = fakeDatabase({
    userRoles: {
      actor: ["manager"],
      targetUser: ["superior"],
    },
    activeRoleIds: ["manager", "superior"],
    rolePermissions: {
      manager: ["USER_MANAGE"],
      superior: ["USER_MANAGE", "ROLE_MANAGE"],
    },
  });

  await assert.rejects(
    assertActorCanManageUser(database, "actor", "targetUser"),
    { statusCode: 403 }
  );
});

test("impede alterar um perfil atribuído ao próprio ator", async () => {
  const database = fakeDatabase({
    userRoles: { actor: ["own-role"] },
    activeRoleIds: ["own-role"],
    rolePermissions: { "own-role": ["ROLE_MANAGE"] },
  });

  await assert.rejects(
    assertActorCanModifyRole(database, "actor", "own-role"),
    { statusCode: 403 }
  );
});
