#!/usr/bin/env node
/**
 * Runs Prisma CLI against the schema and migration history that match DATABASE_URL.
 *
 * Local SQLite (default): prisma/schema.prisma + prisma/migrations
 * PostgreSQL: prisma/postgresql/schema.prisma + prisma/postgresql/migrations
 *
 * Changing only DATABASE_URL while running raw `npx prisma` against the SQLite
 * schema is not supported (Prisma P1012). Always use this script or `npm run setup`.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function isPostgresUrl(url) {
  return /^(postgres|postgresql):/i.test(url);
}

export function resolvePrismaLayout(databaseUrl = process.env.DATABASE_URL) {
  const url = databaseUrl ?? "file:dev.sqlite";
  if (isPostgresUrl(url)) {
    return {
      provider: "postgresql",
      databaseUrl: url,
      schemaPath: join(ROOT, "prisma/postgresql/schema.prisma"),
    };
  }
  return {
    provider: "sqlite",
    databaseUrl: url,
    schemaPath: join(ROOT, "prisma/schema.prisma"),
  };
}

const args = process.argv.slice(2);
if (args[0] === "--print-layout") {
  const layout = resolvePrismaLayout(process.env.DATABASE_URL);
  process.stdout.write(`${JSON.stringify(layout)}\n`);
  process.exit(0);
}

if (args.length === 0) {
  console.error("Usage: node scripts/prisma-with-db.mjs <prisma args>");
  process.exit(1);
}

const layout = resolvePrismaLayout(process.env.DATABASE_URL);
process.env.DATABASE_URL = layout.databaseUrl;

const prismaArgs = [...args];
if (!prismaArgs.includes("--schema")) {
  prismaArgs.push("--schema", layout.schemaPath);
}

const result = spawnSync("npx", ["prisma", ...prismaArgs], {
  stdio: "inherit",
  env: process.env,
  cwd: ROOT,
});

process.exit(result.status ?? 1);
