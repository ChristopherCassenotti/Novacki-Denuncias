const crypto = require("node:crypto");
const { ipKeyGenerator, rateLimit } = require("express-rate-limit");

function integerFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

const commonOptions = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
};

const apiRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: integerFromEnv("API_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  limit: integerFromEnv("API_RATE_LIMIT_MAX", 300),
  message: {
    message: "Muitas requisições. Tente novamente mais tarde.",
  },
});

const loginRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: integerFromEnv("LOGIN_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  limit: integerFromEnv("LOGIN_RATE_LIMIT_MAX", 5),
  skipSuccessfulRequests: true,
  keyGenerator(req) {
    const ipKey = ipKeyGenerator(req.ip || "unknown");
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "missing";
    const identifierHash = crypto
      .createHash("sha256")
      .update(email)
      .digest("hex");

    return `${ipKey}:${identifierHash}`;
  },
  message: {
    message:
      "Muitas tentativas de autenticação. Aguarde antes de tentar novamente.",
  },
});

const credentialActionRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: integerFromEnv(
    "CREDENTIAL_RATE_LIMIT_WINDOW_MS",
    15 * 60 * 1000
  ),
  limit: integerFromEnv("CREDENTIAL_RATE_LIMIT_MAX", 10),
  message: {
    message:
      "Muitas tentativas de alteração de credencial. Tente novamente mais tarde.",
  },
});

module.exports = {
  apiRateLimiter,
  credentialActionRateLimiter,
  loginRateLimiter,
};
