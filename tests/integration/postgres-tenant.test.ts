import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { ShopLifecycleService } from "../../app/services/shop/lifecycle";
import { UninstallService } from "../../app/services/shop/uninstall";
import { ProcessedWebhookRepository } from "../../app/repositories/processed-webhook-repository";
import { insertOfflineSession, uniqueShop } from "../helpers/test-db";

const ROOT = process.cwd();

function postgresUrl(): string | null {
  const url = process.env.SEGMENTIVA_POSTGRES_TEST_URL ?? process.env.DATABASE_URL;
  if (url && /^(postgres|postgresql):/i.test(url)) {
    return url;
  }
  return null;
}

describe("PostgreSQL tenant schema", () => {
  const baseUrl = postgresUrl();
  if (!baseUrl) {
    it.skip("requires a postgresql:// DATABASE_URL or SEGMENTIVA_POSTGRES_TEST_URL", () => {
      expect(baseUrl).toBeTruthy();
    });
    return;
  }

  const url = new URL(baseUrl);
  url.pathname = `/segmentiva_it_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const databaseUrl = url.toString();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  it("validates, migrates, and isolates two shops including webhook uninstall", async () => {
    execFileSync(
      "node",
      ["scripts/prisma-with-db.mjs", "validate"],
      { cwd: ROOT, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" },
    );
    execFileSync(
      "node",
      ["scripts/prisma-with-db.mjs", "migrate", "deploy"],
      { cwd: ROOT, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe" },
    );

    const lifecycle = new ShopLifecycleService(prisma);
    const uninstall = new UninstallService(prisma);
    const webhooks = new ProcessedWebhookRepository(prisma);
    const shopA = { shopDomain: uniqueShop("pg-a") };
    const shopB = { shopDomain: uniqueShop("pg-b") };

    await lifecycle.ensureInstalled(shopA);
    await lifecycle.ensureInstalled(shopB);
    await insertOfflineSession(prisma, shopA.shopDomain, `offline_${shopA.shopDomain}`);
    await insertOfflineSession(prisma, shopB.shopDomain, `offline_${shopB.shopDomain}`);

    await prisma.shop.update({
      where: { shopDomain: shopA.shopDomain },
      data: {
        lastDiagnosticStatus: "ok",
        lastDiagnosticSummary: { status: "ok" },
        lastDiagnosticAt: new Date(),
      },
    });

    const webhookId = `wh-${shopA.shopDomain}`;
    const result = await uninstall.handleAppUninstalled(shopA, {
      topic: "APP_UNINSTALLED",
      webhookId,
    });
    expect(result.processingStopped).toBe(true);
    expect(await webhooks.getStatus(shopA, webhookId)).toBe("COMPLETED");
    expect(await prisma.session.count({ where: { shop: shopA.shopDomain } })).toBe(0);
    expect(await prisma.session.count({ where: { shop: shopB.shopDomain } })).toBe(1);
    const leftoverB = await prisma.shop.findUniqueOrThrow({
      where: { shopDomain: shopB.shopDomain },
    });
    expect(leftoverB.installationState).toBe("INSTALLED");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
