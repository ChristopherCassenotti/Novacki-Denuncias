const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  );

  if (req.originalUrl.startsWith("/api/admin")) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
  }

  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
}

function getAllowedOrigins(req) {
  const configuredOrigins = (process.env.ADMIN_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (configuredOrigins.length > 0) {
    return new Set(configuredOrigins);
  }

  return new Set([`${req.protocol}://${req.get("host")}`]);
}

function requireTrustedOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (req.get("sec-fetch-site") === "cross-site") {
    return res.status(403).json({
      message: "Origem da requisição não autorizada.",
    });
  }

  const origin = req.get("origin");

  // Clientes não-browser normalmente não enviam Origin. Navegadores
  // modernos enviam esse cabeçalho em requisições que alteram estado.
  if (!origin) {
    return next();
  }

  let normalizedOrigin;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return res.status(403).json({
      message: "Origem da requisição não autorizada.",
    });
  }

  if (!getAllowedOrigins(req).has(normalizedOrigin)) {
    return res.status(403).json({
      message: "Origem da requisição não autorizada.",
    });
  }

  return next();
}

function notFoundHandler(req, res) {
  return res.status(404).json({
    message: "Rota não encontrada.",
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({
      message: "JSON inválido.",
    });
  }

  if (error?.type === "entity.too.large") {
    return res.status(413).json({
      message: "Corpo da requisição muito grande.",
    });
  }

  if (error?.name === "MulterError") {
    const fileTooLarge = error.code === "LIMIT_FILE_SIZE";

    return res.status(fileTooLarge ? 413 : 400).json({
      message: fileTooLarge
        ? "Arquivo muito grande."
        : "Upload de arquivo inválido.",
    });
  }

  if (
    Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
  ) {
    return res.status(error.statusCode).json({
      message:
        error.message ||
        "Não foi possível processar a requisição.",
    });
  }

  console.error("Erro não tratado na API:", error);

  return res.status(500).json({
    message: "Erro interno do servidor.",
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
  requireTrustedOrigin,
  securityHeaders,
};
