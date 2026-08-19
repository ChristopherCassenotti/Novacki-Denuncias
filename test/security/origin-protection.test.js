const assert = require("node:assert/strict");
const test = require("node:test");

const { requireAdminAuth } = require("../../src/modules/auth/auth.middleware");
const { requireReporterAuth } = require("../../src/modules/reports/reporterAuth.middleware");
const {
  requireTrustedOrigin,
} = require("../../src/middlewares/originProtection.middleware");

const adminRouters = [
  require("../../src/modules/access/access.routes"),
  require("../../src/modules/permissions/permissions.routes"),
  require("../../src/modules/users/users.routes"),
  require("../../src/modules/teams/temas.routes"),
  require("../../src/modules/roles/roles.routes"),
  require("../../src/modules/adminDashboard/adminDashboard.routes"),
  require("../../src/modules/adminAuditLogs/adminAuditLogs.routes"),
  require("../../src/modules/adminReports/admin.routes"),
  require("../../src/modules/retentionPolicies/retentionPolicies.routes"),
  require("../../src/modules/retentionScheduler/retentionScheduler.routes"),
  require("../../src/modules/retentionExecutor/retentionExecutor.routes"),
  require("../../src/modules/attachmentScanner/attachmentScanner.routes"),
  require("../../src/modules/routingRules/routingRules.routes"),
  require("../../src/modules/routingEngine/routingEngine.routes"),
];

const authRoutes = require("../../src/modules/auth/auth.routes");
const publicRoutes = require("../../src/modules/public/public.routes");

function routeHandlers(router, method, path) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods[method]
  );

  assert.ok(layer, `Rota ausente: ${method.toUpperCase()} ${path}`);

  return layer.route.stack.map((entry) => entry.handle);
}

test("proteção de origem vem depois da autenticação administrativa", () => {
  for (const router of adminRouters) {
    const middleware = router.stack
      .filter((layer) => !layer.route)
      .map((layer) => layer.handle);

    const authIndex = middleware.indexOf(requireAdminAuth);
    const originIndex = middleware.indexOf(requireTrustedOrigin);

    assert.notEqual(authIndex, -1);
    assert.equal(originIndex, authIndex + 1);
  }

  const logoutHandlers = routeHandlers(authRoutes, "post", "/logout");

  assert.equal(logoutHandlers[0], requireAdminAuth);
  assert.equal(logoutHandlers[1], requireTrustedOrigin);
});

test("protege somente mutações autenticadas do denunciante", () => {
  for (const path of [
    "/reports/logout",
    "/reports/current/messages",
    "/reports/current/attachments",
  ]) {
    const handlers = routeHandlers(publicRoutes, "post", path);

    assert.equal(handlers[0], requireReporterAuth);
    assert.equal(handlers[1], requireTrustedOrigin);
  }

  for (const path of [
    "/reports",
    "/reports/access",
    "/reports/with-attachments",
    "/with-attachments",
  ]) {
    const handlers = routeHandlers(publicRoutes, "post", path);

    assert.equal(handlers.includes(requireTrustedOrigin), false);
  }
});
