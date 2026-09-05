#!/usr/bin/env node
/**
 * Validates and migrates a clean PostgreSQL database, then exercises
 * two-shop isolation, official Session rows, JSON settings, and uninstall.
 *
 * Prisma Client is generated from one schema at a time. This script generates
 * the PostgreSQL client, runs the check, then restores the SQLite client so
 * local `npm test` keeps working.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/verify-postgres-tenant.mjs
 *   SEGMENTIVA_POSTGRES_TEST_URL=postgresql://... npm run test:postgres
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const helper = join(ROOT, "scripts/prisma-with-db.mjs");

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
  return result.stdout;
}

const baseUrl =
  process.env.SEGMENTIVA_POSTGRES_TEST_URL ?? process.env.DATABASE_URL;
if (!baseUrl || !/^(postgres|postgresql):/i.test(baseUrl)) {
  process.stderr.write(
    "test:postgres requires DATABASE_URL or SEGMENTIVA_POSTGRES_TEST_URL with a postgresql:// URL.\n",
  );
  process.exit(2);
}

const url = new URL(baseUrl);
url.searchParams.set(
  "schema",
  `segmentiva_it_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
);
const databaseUrl = url.toString();
const env = { DATABASE_URL: databaseUrl };

let restoredSqlite = false;
try {
  run("node", [helper, "generate"], env);
  run("node", [helper, "validate"], env);
  run("node", [helper, "migrate", "deploy"], env);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const shopA = `shop-pg-a-${Date.now()}.myshopify.com`;
  const shopB = `shop-pg-b-${Date.now()}.myshopify.com`;

  await prisma.shop.create({
    data: {
      shopDomain: shopA,
      installationState: "INSTALLED",
      installedAt: new Date(),
      installGeneration: 1,
      lastDiagnosticSummary: { status: "ok" },
    },
  });
  await prisma.shop.create({
    data: {
      shopDomain: shopB,
      installationState: "INSTALLED",
      installedAt: new Date(),
      installGeneration: 1,
    },
  });
  await prisma.session.create({
    data: {
      id: `offline_${shopA}`,
      shop: shopA,
      state: "offline",
      isOnline: false,
      accessToken: "token-a",
    },
  });
  await prisma.session.create({
    data: {
      id: `offline_${shopB}`,
      shop: shopB,
      state: "offline",
      isOnline: false,
      accessToken: "token-b",
    },
  });

  const { UninstallService } = await import("../app/services/shop/uninstall.ts");
  const { ProcessedWebhookRepository } = await import(
    "../app/repositories/processed-webhook-repository.ts"
  );
  const uninstall = new UninstallService(prisma);
  const webhookId = `wh-${shopA}`;
  const result = await uninstall.handleAppUninstalled(
    { shopDomain: shopA },
    { topic: "APP_UNINSTALLED", webhookId },
  );
  if (!result.processingStopped) {
    throw new Error("Expected uninstall to stop processing for shop A.");
  }
  const status = await new ProcessedWebhookRepository(prisma).getStatus(
    { shopDomain: shopA },
    webhookId,
  );
  const sessionsA = await prisma.session.count({ where: { shop: shopA } });
  const sessionsB = await prisma.session.count({ where: { shop: shopB } });
  const leftoverB = await prisma.shop.findUniqueOrThrow({
    where: { shopDomain: shopB },
  });
  await prisma.$disconnect();

  if (status !== "COMPLETED" || sessionsA !== 0 || sessionsB !== 1) {
    throw new Error(
      `PostgreSQL isolation failed: status=${status} sessionsA=${sessionsA} sessionsB=${sessionsB}`,
    );
  }
  if (leftoverB.installationState !== "INSTALLED") {
    throw new Error("Shop B was modified by Shop A uninstall.");
  }
  process.stdout.write("PostgreSQL tenant isolation check passed.\n");
} finally {
  run("node", [helper, "generate"], { DATABASE_URL: "file:dev.sqlite" });
  restoredSqlite = true;
}

if (!restoredSqlite) {
  process.exit(1);
}
