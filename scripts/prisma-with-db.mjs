#!/usr/bin/env node
/**
 * Runs Prisma CLI with a local SQLite default when DATABASE_URL is unset.
 * Shared environments should set DATABASE_URL explicitly (PostgreSQL).
 */
import { spawnSync } from "node:child_process";

process.env.DATABASE_URL ??= "file:dev.sqlite";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma-with-db.mjs <prisma args>");
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
