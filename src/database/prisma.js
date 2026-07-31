require("dotenv/config");

const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

const requiredVariables = [
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASS",
  "DB_NAME",
];

const missingVariables = requiredVariables.filter(
  (variable) => !process.env[variable]
);

if (missingVariables.length > 0) {
  throw new Error(
    `Variáveis ausentes no .env: ${missingVariables.join(", ")}`
  );
}

const adapter = new PrismaMariaDb({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  connectionLimit: Number(
    process.env.DATABASE_CONNECTION_LIMIT || 5
  ),

  // O Prisma 7 usa 1 segundo por padrão no adapter MariaDB.
  connectTimeout: 10_000,

  // Tempo máximo aguardando uma conexão do pool.
  acquireTimeout: 20_000,

  // Segundos.
  idleTimeout: 300,
});

const prisma = new PrismaClient({
  adapter,
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["error"],
});

module.exports = prisma;