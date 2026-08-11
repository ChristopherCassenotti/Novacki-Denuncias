require("dotenv/config");

const fs = require("node:fs");
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

function isLoopbackHost(host) {
  return ["localhost", "127.0.0.1", "::1"].includes(
    String(host || "").toLowerCase()
  );
}

function getSslOptions() {
  const isRemote = !isLoopbackHost(process.env.DB_HOST);
  const configured = process.env.DB_SSL?.trim().toLowerCase();
  const sslEnabled =
    configured === "true" || (configured === undefined && isRemote);
  const rejectUnauthorized =
    process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false";

  if (
    process.env.NODE_ENV === "production" &&
    isRemote &&
    (!sslEnabled || !rejectUnauthorized)
  ) {
    throw new Error(
      "Conexões remotas com o banco exigem TLS e validação de certificado em produção."
    );
  }

  if (!sslEnabled) {
    return undefined;
  }

  const ssl = { rejectUnauthorized };

  if (process.env.DB_SSL_CA_PATH) {
    ssl.ca = fs.readFileSync(process.env.DB_SSL_CA_PATH, "utf8");
  }

  return ssl;
}

if (
  process.env.NODE_ENV === "production" &&
  String(process.env.DB_PASS || "").length < 16
) {
  throw new Error(
    "DB_PASS precisa possuir pelo menos 16 caracteres em produção."
  );
}

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  connectionLimit: Number(
    process.env.DATABASE_CONNECTION_LIMIT || 5
  ),

  connectTimeout: 10000,
  acquireTimeout: 20000,
  idleTimeout: 300,

  charset: "utf8mb4",
  collation: "utf8mb4_unicode_ci",
  ssl: getSslOptions(),
});

const prisma = new PrismaClient({
  adapter,

  log:
    process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["error"],
});

module.exports = prisma;
