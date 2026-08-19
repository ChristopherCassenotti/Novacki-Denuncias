const assert = require("node:assert/strict");
const test = require("node:test");

const {
  clearSessionCookie,
  setSessionCookie,
} = require("../../src/modules/auth/auth.cookies");

test("cookie administrativo usa opções centrais e maxAge", () => {
  const originalName = process.env.ADMIN_COOKIE_NAME;
  const originalSameSite = process.env.COOKIE_SAME_SITE;
  const originalSecure = process.env.COOKIE_SECURE;

  process.env.ADMIN_COOKIE_NAME = "test_admin_session";
  process.env.COOKIE_SAME_SITE = "lax";
  process.env.COOKIE_SECURE = "false";

  const calls = {};
  const response = {
    cookie(name, token, options) {
      calls.cookie = { name, token, options };
    },
    clearCookie(name, options) {
      calls.clearCookie = { name, options };
    },
  };

  const durationMs = 60_000;

  try {
    setSessionCookie(
      response,
      "session-token",
      new Date(Date.now() + durationMs)
    );
    clearSessionCookie(response);

    assert.equal(calls.cookie.name, "test_admin_session");
    assert.equal(calls.cookie.token, "session-token");
    assert.equal(calls.cookie.options.httpOnly, true);
    assert.equal(calls.cookie.options.secure, false);
    assert.equal(calls.cookie.options.sameSite, "lax");
    assert.equal(calls.cookie.options.path, "/");
    assert.ok(calls.cookie.options.maxAge > 0);
    assert.ok(calls.cookie.options.maxAge <= durationMs);
    assert.equal("expires" in calls.cookie.options, false);

    assert.equal(calls.clearCookie.name, calls.cookie.name);
    assert.deepEqual(
      calls.clearCookie.options,
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
      }
    );
  } finally {
    if (originalName === undefined) {
      delete process.env.ADMIN_COOKIE_NAME;
    } else {
      process.env.ADMIN_COOKIE_NAME = originalName;
    }

    if (originalSameSite === undefined) {
      delete process.env.COOKIE_SAME_SITE;
    } else {
      process.env.COOKIE_SAME_SITE = originalSameSite;
    }

    if (originalSecure === undefined) {
      delete process.env.COOKIE_SECURE;
    } else {
      process.env.COOKIE_SECURE = originalSecure;
    }
  }
});
