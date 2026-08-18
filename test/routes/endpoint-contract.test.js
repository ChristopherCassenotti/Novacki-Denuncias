const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const app = require("../../src/app");
const accessRoutes = require("../../src/modules/access/access.routes");
const adminReportsRoutes = require("../../src/modules/adminReports/admin.routes");
const authRoutes = require("../../src/modules/auth/auth.routes");
const permissionsRoutes = require("../../src/modules/permissions/permissions.routes");
const publicRoutes = require("../../src/modules/public/public.routes");
const rolesRoutes = require("../../src/modules/roles/roles.routes");
const teamsRoutes = require("../../src/modules/teams/temas.routes");
const usersRoutes = require("../../src/modules/users/users.routes");
const {
  getReportStatusPermission,
} = require("../../src/modules/access/reportCapability.middleware");

let server;
let baseUrl;

function registeredRoutes(router) {
  return new Set(
    router.stack
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route.methods).map(
          (method) => `${method.toUpperCase()} ${layer.route.path}`
        )
      )
  );
}

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("registra todas as rotas publicas de denuncias e anexos", () => {
  const routes = registeredRoutes(publicRoutes);
  const expected = [
    "GET /report-categories",
    "GET /units",
    "GET /reports/current",
    "GET /reports/current/messages",
    "GET /reports/current/history",
    "GET /reports/current/attachments",
    "GET /reports/current/attachments/:attachmentId/download",
    "POST /reports",
    "POST /reports/access",
    "POST /reports/logout",
    "POST /reports/current/messages",
    "POST /reports/current/attachments",
    "POST /reports/with-attachments",
    "POST /with-attachments",
  ];

  for (const route of expected) {
    assert.equal(routes.has(route), true, `Rota ausente: ${route}`);
  }
});

test("registra todas as rotas administrativas de denuncias", () => {
  const routes = registeredRoutes(adminReportsRoutes);
  const expected = [
    "GET /",
    "GET /:id",
    "GET /:id/messages",
    "GET /:id/internal-notes",
    "GET /:id/identity",
    "GET /:id/restrictions",
    "GET /:id/access-grants",
    "GET /:id/attachments",
    "GET /:id/attachments/:attachmentId/download",
    "POST /:id/messages",
    "POST /:id/internal-notes",
    "POST /:id/restrictions",
    "POST /:id/access-grants",
    "POST /:id/attachments",
    "PATCH /:id/status",
    "PATCH /:id/priority",
    "PUT /:id/assignment",
    "DELETE /:id/assignment",
    "DELETE /:id/restrictions/:userId",
    "DELETE /:id/access-grants/:grantId",
  ];

  for (const route of expected) {
    assert.equal(routes.has(route), true, `Rota ausente: ${route}`);
  }
});

test("registra todas as rotas administrativas de configuracao e acesso", () => {
  const groups = [
    [authRoutes, [
      "GET /me",
      "POST /login",
      "POST /complete-credential-setup",
      "POST /change-initial-password",
      "POST /logout",
    ]],
    [accessRoutes, ["GET /me"]],
    [permissionsRoutes, ["GET /"]],
    [rolesRoutes, [
      "GET /",
      "GET /:id",
      "POST /",
      "PATCH /:id",
      "PATCH /:id/status",
      "PUT /:id/permissions",
    ]],
    [teamsRoutes, [
      "GET /",
      "GET /:id",
      "POST /",
      "PATCH /:id",
      "PATCH /:id/status",
      "PUT /:id/members",
    ]],
    [usersRoutes, [
      "GET /",
      "GET /:id",
      "POST /",
      "POST /:id/reset-password",
      "PATCH /:id",
      "PATCH /:id/status",
      "PUT /:id/roles",
    ]],
  ];

  for (const [router, expected] of groups) {
    const routes = registeredRoutes(router);

    for (const route of expected) {
      assert.equal(routes.has(route), true, `Rota ausente: ${route}`);
    }
  }
});

test("seleciona a permissao correta para cada mudanca de status", () => {
  assert.equal(
    getReportStatusPermission("CONCLUDED"),
    "REPORT_CONCLUDE"
  );
  assert.equal(
    getReportStatusPermission("ARCHIVED"),
    "REPORT_ARCHIVE"
  );
  assert.equal(
    getReportStatusPermission("INVESTIGATING"),
    "REPORT_CHANGE_STATUS"
  );
});

test("protege os endpoints de anexos do denunciante", async () => {
  const listResponse = await fetch(
    `${baseUrl}/api/public/reports/current/attachments`
  );
  const uploadResponse = await fetch(
    `${baseUrl}/api/public/reports/current/attachments`,
    { method: "POST" }
  );

  assert.equal(listResponse.status, 401);
  assert.equal(uploadResponse.status, 401);
});

test("aceita a rota multipart canonica e preserva o alias legado", async () => {
  for (const path of [
    "/api/public/reports/with-attachments",
    "/api/public/with-attachments",
  ]) {
    const form = new FormData();
    form.set("payload", "{");

    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      body: form,
    });

    assert.equal(response.status, 400);
  }
});

test("retorna 400 para tipo de arquivo nao permitido", async () => {
  const form = new FormData();
  form.set("payload", "{}");
  form.append(
    "files",
    new Blob(["conteudo"], { type: "text/plain" }),
    "evidencia.txt"
  );

  const response = await fetch(
    `${baseUrl}/api/public/reports/with-attachments`,
    {
      method: "POST",
      body: form,
    }
  );

  assert.equal(response.status, 400);
});

test("retorna 400 quando o multipart excede cinco arquivos", async () => {
  const form = new FormData();
  form.set("payload", "{}");

  for (let index = 0; index < 6; index += 1) {
    form.append(
      "files",
      new Blob([String(index)], { type: "image/png" }),
      `evidencia-${index}.png`
    );
  }

  const response = await fetch(
    `${baseUrl}/api/public/reports/with-attachments`,
    {
      method: "POST",
      body: form,
    }
  );

  assert.equal(response.status, 400);
});
