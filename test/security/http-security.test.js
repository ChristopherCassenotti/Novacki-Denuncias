const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const app = require("../../src/app");

let server;
let baseUrl;

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

test("remove identificação do Express e adiciona headers defensivos", async () => {
  const response = await fetch(`${baseUrl}/missing`);

  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), null);
});

test("JSON inválido retorna erro sanitizado", async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  const body = await response.text();

  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal(body.includes("node_modules"), false);
  assert.equal(body.includes("SyntaxError"), false);
});

test("bloqueia origem cross-site em operações administrativas", async () => {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    },
    body: "{}",
  });

  assert.equal(response.status, 403);
});

test("limita tentativas repetidas de login", async () => {
  let response;
  const configuredLimit = Number(process.env.RATE_LIMIT_LOGIN_MAX);
  const loginLimit =
    Number.isInteger(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : 10;

  for (let attempt = 0; attempt <= loginLimit; attempt += 1) {
    response = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "rate-limit@example.com" }),
    });
  }

  assert.equal(response.status, 429);
});
