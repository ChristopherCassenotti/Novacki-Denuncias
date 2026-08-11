import "dotenv/config";
import { defineConfig, env } from "prisma/config";

function databaseUrlWithTls(rawUrl: string) {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  const isRemote = !["localhost", "127.0.0.1", "::1"].includes(host);

  if (isRemote && !url.searchParams.has("sslaccept")) {
    url.searchParams.set("sslaccept", "strict");
  }

  return url.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js",
  },

  datasource: {
    url: databaseUrlWithTls(env("DATABASE_URL")),
  },
});
