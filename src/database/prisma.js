require("dotenv/config");

const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

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
});

const prisma = new PrismaClient({
  adapter,

  log:
    process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["error"],
});

module.exports = prisma;