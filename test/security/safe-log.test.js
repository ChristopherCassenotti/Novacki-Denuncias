const assert = require("node:assert/strict");
const test = require("node:test");

const {
  safeExceptionLog,
} = require("../../src/utils/safeLog");

test("logger seguro oculta dados sensíveis e mensagens em produção", () => {
  const originalConsoleError = console.error;
  const originalNodeEnv = process.env.NODE_ENV;
  const entries = [];

  console.error = (entry) => {
    entries.push(entry);
  };

  try {
    const error = Object.assign(
      new Error("detalhe interno"),
      { code: "INTERNAL_FAILURE" }
    );

    process.env.NODE_ENV = "production";
    safeExceptionLog(
      "test_context",
      error,
      {
        token: "token-secreto",
        nested: {
          password: "senha-secreta",
        },
      }
    );

    process.env.NODE_ENV = "development";
    safeExceptionLog("test_context", error);

    assert.equal(entries[0].token, "[REDACTED]");
    assert.equal(entries[0].nested.password, "[REDACTED]");
    assert.equal(entries[0].errorMessage, undefined);
    assert.equal(entries[0].errorCode, "INTERNAL_FAILURE");
    assert.equal(entries[1].errorMessage, "detalhe interno");
  } finally {
    console.error = originalConsoleError;

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});
