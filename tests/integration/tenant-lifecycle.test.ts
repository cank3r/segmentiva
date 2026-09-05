import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ProcessedWebhookRepository } from "../../app/repositories/processed-webhook-repository";
import { ShopRepository } from "../../app/repositories/shop-repository";
import {
  PilotSeedNotConfirmedError,
  PilotSeedService,
} from "../../app/services/pilot-seed/import";
import { buildOverviewSnapshot } from "../../app/services/shop/overview";
import { ShopLifecycleService, ShopNotProcessableError } from "../../app/services/shop/lifecycle";
import {
  InjectedUninstallFailure,
  UninstallService,
} from "../../app/services/shop/uninstall";
import {
  InjectedScopesUpdateFailure,
  ScopesUpdateService,
} from "../../app/services/shop/scopes-update";
import {
  createMigratedTestDatabase,
  insertOfflineSession,
  uniqueShop,
} from "../helpers/test-db";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function webhookTriggeredAt(from = new Date()): string {
  return new Date(from.getTime() + 1_000).toISOString();
}

describe("tenant isolation and installation lifecycle", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    ({ prisma } = createMigratedTestDatabase());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps Shop A and Shop B records isolated", async () => {
    const shopA = { shopDomain: uniqueShop("iso-a") };
    const shopB = { shopDomain: uniqueShop("iso-b") };
    const lifecycle = new ShopLifecycleService(prisma);
    const shops = new ShopRepository(prisma);
    const seed = new PilotSeedService(prisma);

    await lifecycle.ensureInstalled(shopA);
    await lifecycle.ensureInstalled(shopB);
    await seed.importPack({
      shop: shopA,
      packId: "kliquea-pilot",
      confirm: true,
    });

    const recordA = await shops.getByVerifiedShop(shopA);
    const recordB = await shops.getByVerifiedShop(shopB);
    expect(shops.settingsOf(recordA).pilotSeed?.packId).toBe("kliquea-pilot");
    expect(shops.settingsOf(recordB).pilotSeed).toBeUndefined();
    expect(recordA.shopDomain).not.toBe(recordB.shopDomain);
  });

  it("refuses to import a pilot pack without explicit confirmation", async () => {
    const shop = { shopDomain: uniqueShop("seed-noconfirm") };
    await new ShopLifecycleService(prisma).ensureInstalled(shop);
    await expect(
      new PilotSeedService(prisma).importPack({
        shop,
        packId: "kliquea-pilot",
        confirm: false,
      }),
    ).rejects.toBeInstanceOf(PilotSeedNotConfirmedError);
  });

  it("stops processing after uninstall, deletes only that shop's sessions, and keeps settings", async () => {
    const shopA = { shopDomain: uniqueShop("uninst-a") };
    const shopB = { shopDomain: uniqueShop("uninst-b") };
    const lifecycle = new ShopLifecycleService(prisma);
    const shops = new ShopRepository(prisma);
    const seed = new PilotSeedService(prisma);
    const uninstall = new UninstallService(prisma);

    await lifecycle.ensureInstalled(shopA);
    await lifecycle.ensureInstalled(shopB);
    await seed.importPack({ shop: shopA, packId: "kliquea-pilot", confirm: true });
    await insertOfflineSession(prisma, shopA.shopDomain, `offline_${shopA.shopDomain}`);
    await insertOfflineSession(prisma, shopB.shopDomain, `offline_${shopB.shopDomain}`);

    const first = await uninstall.handleAppUninstalled(shopA, {
      topic: "APP_UNINSTALLED",
      webhookId: `wh-${shopA.shopDomain}-1`,
      triggeredAt: webhookTriggeredAt(),
    });
    expect(first.alreadyProcessed).toBe(false);
    expect(first.processingStopped).toBe(true);

    const uninstalled = await shops.getByVerifiedShop(shopA);
    expect(uninstalled.installationState).toBe("UNINSTALLED");
    expect(shops.isProcessable(uninstalled)).toBe(false);
    expect(shops.settingsOf(uninstalled).pilotSeed?.packId).toBe("kliquea-pilot");
    expect(await prisma.session.count({ where: { shop: shopA.shopDomain } })).toBe(0);
    expect(await prisma.session.count({ where: { shop: shopB.shopDomain } })).toBe(1);

    await expect(
      seed.importPack({ shop: shopA, packId: "kliquea-pilot", confirm: true }),
    ).rejects.toBeInstanceOf(ShopNotProcessableError);
  });

  it("does not revive an uninstalled shop from an authenticated Admin load", async () => {
    const shop = { shopDomain: uniqueShop("no-revive") };
    const lifecycle = new ShopLifecycleService(prisma);
    const uninstall = new UninstallService(prisma);
    await lifecycle.ensureInstalled(shop);
    await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId: `wh-${shop.shopDomain}`,
      triggeredAt: webhookTriggeredAt(),
    });

    const loaded = await lifecycle.loadOrCreateWithoutReinstall(shop);
    expect(loaded.installationState).toBe("UNINSTALLED");
    expect(lifecycle.canProcess(loaded)).toBe(false);
  });

  it("reinstalls through afterAuth and ignores the previous uninstall webhook id", async () => {
    const shop = { shopDomain: uniqueShop("reinstall") };
    const lifecycle = new ShopLifecycleService(prisma);
    const shops = new ShopRepository(prisma);
    const seed = new PilotSeedService(prisma);
    const uninstall = new UninstallService(prisma);

    await lifecycle.ensureInstalled(shop);
    await seed.importPack({ shop, packId: "kliquea-pilot", confirm: true });
    const webhookId = `wh-${shop.shopDomain}-1`;
    await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId,
      triggeredAt: webhookTriggeredAt(),
    });

    await insertOfflineSession(prisma, shop.shopDomain, `offline_${shop.shopDomain}-re`);
    const reinstalled = await lifecycle.ensureInstalled(shop);
    expect(reinstalled.installationState).toBe("INSTALLED");
    expect(shops.settingsOf(reinstalled).pilotSeed?.packId).toBe("kliquea-pilot");

    const replay = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId,
    });
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.processingStopped).toBe(false);
    expect(await prisma.session.count({ where: { shop: shop.shopDomain } })).toBe(1);
  });

  it("invalidates a previous ok diagnostic after uninstall and reinstall", async () => {
    const shop = { shopDomain: uniqueShop("reinstall-diag") };
    const lifecycle = new ShopLifecycleService(prisma);
    const shops = new ShopRepository(prisma);
    const uninstall = new UninstallService(prisma);

    await lifecycle.ensureInstalled(shop);
    await shops.updateDiagnostic(shop, {
      status: "ok",
      ranAt: new Date("2026-09-04T00:00:00.000Z"),
      summary: { status: "ok" },
    });
    const beforeUninstall = await shops.getByVerifiedShop(shop);
    expect(
      buildOverviewSnapshot(shop.shopDomain, beforeUninstall, true).checklist.find(
        (item) => item.id === "diagnostic",
      )?.status,
    ).toBe("complete");

    await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId: `wh-${shop.shopDomain}-diag`,
      triggeredAt: webhookTriggeredAt(),
    });
    const reinstalled = await lifecycle.ensureInstalled(shop);
    expect(shops.settingsOf(reinstalled).lastDiagnostic).toBeUndefined();
    expect(
      buildOverviewSnapshot(shop.shopDomain, reinstalled, true).checklist.find(
        (item) => item.id === "diagnostic",
      )?.status,
    ).toBe("pending");
  });

  it("ignores a stale uninstall webhook with a new id after a newer reinstall", async () => {
    const shop = { shopDomain: uniqueShop("stale") };
    const lifecycle = new ShopLifecycleService(prisma);
    const uninstall = new UninstallService(prisma);
    const installed = await lifecycle.ensureInstalled(shop);
    await insertOfflineSession(prisma, shop.shopDomain, `offline_${shop.shopDomain}`);

    const result = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId: `wh-${shop.shopDomain}-stale`,
      triggeredAt: new Date(installed.installedAt.getTime() - 60_000).toISOString(),
    });

    expect(result.ignoredAsStale).toBe(true);
    expect(result.processingStopped).toBe(false);
    const current = await new ShopRepository(prisma).getByVerifiedShop(shop);
    expect(current.installationState).toBe("INSTALLED");
    expect(await prisma.session.count({ where: { shop: shop.shopDomain } })).toBe(1);
  });

  it("handles concurrent first installs for the same shop", async () => {
    const shop = { shopDomain: uniqueShop("concurrent-install") };
    const lifecycle = new ShopLifecycleService(prisma);
    const [first, second] = await Promise.all([
      lifecycle.ensureInstalled(shop),
      lifecycle.ensureInstalled(shop),
    ]);
    expect(first.shopDomain).toBe(shop.shopDomain);
    expect(second.shopDomain).toBe(shop.shopDomain);
    expect(await prisma.shop.count({ where: { shopDomain: shop.shopDomain } })).toBe(1);
  });

  it("marks the overview diagnostic checklist complete after a stored ok result", async () => {
    const shop = { shopDomain: uniqueShop("overview-diag") };
    const lifecycle = new ShopLifecycleService(prisma);
    const shops = new ShopRepository(prisma);
    await lifecycle.ensureInstalled(shop);
    await shops.updateDiagnostic(shop, {
      status: "ok",
      ranAt: new Date("2026-09-04T00:00:00.000Z"),
      summary: { status: "ok" },
    });
    const record = await shops.getByVerifiedShop(shop);
    const overview = buildOverviewSnapshot(shop.shopDomain, record, true);
    const diagnostic = overview.checklist.find((item) => item.id === "diagnostic");
    expect(diagnostic?.status).toBe("complete");

    const stillInstalled = await lifecycle.ensureInstalled(shop);
    expect(shops.settingsOf(stillInstalled).lastDiagnostic?.status).toBe("ok");
    expect(
      buildOverviewSnapshot(shop.shopDomain, stillInstalled, true).checklist.find(
        (item) => item.id === "diagnostic",
      )?.status,
    ).toBe("complete");
  });

  it("resumes APP_UNINSTALLED after an injected failure following claim", async () => {
    const shop = { shopDomain: uniqueShop("fail-claim") };
    const other = { shopDomain: uniqueShop("fail-claim-other") };
    const lifecycle = new ShopLifecycleService(prisma);
    const webhooks = new ProcessedWebhookRepository(prisma);
    await lifecycle.ensureInstalled(shop);
    await lifecycle.ensureInstalled(other);
    await insertOfflineSession(prisma, shop.shopDomain, `offline_${shop.shopDomain}`);
    await insertOfflineSession(prisma, other.shopDomain, `offline_${other.shopDomain}`);

    const webhookId = `wh-${shop.shopDomain}-claim`;
    const uninstall = new UninstallService(prisma);
    await expect(
      uninstall.handleAppUninstalled(
        shop,
        {
          topic: "APP_UNINSTALLED",
          webhookId,
          triggeredAt: webhookTriggeredAt(),
        },
        { failAt: "after_claim" },
      ),
    ).rejects.toBeInstanceOf(InjectedUninstallFailure);

    expect(await webhooks.getStatus(shop, webhookId)).toBe("PENDING");
    expect((await lifecycle.load(shop))?.installationState).toBe("INSTALLED");

    const retry = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId,
    });
    expect(retry.alreadyProcessed).toBe(false);
    expect(retry.processingStopped).toBe(true);
    expect(await webhooks.getStatus(shop, webhookId)).toBe("COMPLETED");
    expect((await lifecycle.load(shop))?.installationState).toBe("UNINSTALLED");
    expect(await prisma.session.count({ where: { shop: shop.shopDomain } })).toBe(0);
    expect(await prisma.session.count({ where: { shop: other.shopDomain } })).toBe(1);
    expect(lifecycle.canProcess(await lifecycle.load(shop))).toBe(false);

    const duplicate = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId,
    });
    expect(duplicate.alreadyProcessed).toBe(true);
  });

  it("resumes APP_UNINSTALLED after an injected failure following the state change", async () => {
    const shop = { shopDomain: uniqueShop("fail-state") };
    const lifecycle = new ShopLifecycleService(prisma);
    const uninstall = new UninstallService(prisma);
    const webhooks = new ProcessedWebhookRepository(prisma);
    await lifecycle.ensureInstalled(shop);
    await insertOfflineSession(prisma, shop.shopDomain, `offline_${shop.shopDomain}`);
    const webhookId = `wh-${shop.shopDomain}-state`;

    await expect(
      uninstall.handleAppUninstalled(
        shop,
        {
          topic: "APP_UNINSTALLED",
          webhookId,
          triggeredAt: webhookTriggeredAt(),
        },
        { failAt: "after_state_change" },
      ),
    ).rejects.toBeInstanceOf(InjectedUninstallFailure);

    expect((await lifecycle.load(shop))?.installationState).toBe("UNINSTALLED");
    expect(await prisma.session.count({ where: { shop: shop.shopDomain } })).toBe(1);
    expect(await webhooks.getStatus(shop, webhookId)).toBe("PENDING");

    const retry = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId,
    });
    expect(retry.processingStopped).toBe(true);
    expect(await prisma.session.count({ where: { shop: shop.shopDomain } })).toBe(0);
    expect(await webhooks.getStatus(shop, webhookId)).toBe("COMPLETED");
  });

  it("resumes APP_UNINSTALLED after an injected failure during session delete", async () => {
    const shop = { shopDomain: uniqueShop("fail-delete") };
    const lifecycle = new ShopLifecycleService(prisma);
    const uninstall = new UninstallService(prisma);
    await lifecycle.ensureInstalled(shop);
    await insertOfflineSession(prisma, shop.shopDomain, `offline_${shop.shopDomain}`, "token-a");
    await insertOfflineSession(
      prisma,
      shop.shopDomain,
      `offline_${shop.shopDomain}-2`,
      "token-b",
    );
    const webhookId = `wh-${shop.shopDomain}-delete`;

    await expect(
      uninstall.handleAppUninstalled(
        shop,
        {
          topic: "APP_UNINSTALLED",
          webhookId,
          triggeredAt: webhookTriggeredAt(),
        },
        { failAt: "during_session_delete" },
      ),
    ).rejects.toBeInstanceOf(InjectedUninstallFailure);

    expect((await lifecycle.load(shop))?.installationState).toBe("UNINSTALLED");
    expect(await prisma.session.count({ where: { shop: shop.shopDomain } })).toBe(1);

    const retry = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId,
    });
    expect(retry.processingStopped).toBe(true);
    expect((await lifecycle.load(shop))?.installationState).toBe("UNINSTALLED");
    expect(await prisma.session.count({ where: { shop: shop.shopDomain } })).toBe(0);
  });

  it("resumes APP_SCOPES_UPDATE after an injected failure following claim", async () => {
    const shop = { shopDomain: uniqueShop("scopes-fail") };
    const lifecycle = new ShopLifecycleService(prisma);
    const scopes = new ScopesUpdateService(prisma);
    const webhooks = new ProcessedWebhookRepository(prisma);
    await lifecycle.ensureInstalled(shop);
    const sessionId = `offline_${shop.shopDomain}`;
    await insertOfflineSession(prisma, shop.shopDomain, sessionId, "old-token");
    await prisma.session.update({
      where: { id: sessionId },
      data: { scope: "read_customers" },
    });
    const webhookId = `wh-${shop.shopDomain}-scopes`;

    await expect(
      scopes.handleAppScopesUpdate(
        shop,
        {
          topic: "APP_SCOPES_UPDATE",
          webhookId,
          sessionId,
          scope: "read_customers,write_customers",
        },
        { failAt: "after_claim" },
      ),
    ).rejects.toBeInstanceOf(InjectedScopesUpdateFailure);

    expect(await webhooks.getStatus(shop, webhookId)).toBe("PENDING");
    const retry = await scopes.handleAppScopesUpdate(shop, {
      topic: "APP_SCOPES_UPDATE",
      webhookId,
      sessionId,
      scope: "read_customers,write_customers",
    });
    expect(retry.alreadyProcessed).toBe(false);
    expect(retry.applied).toBe(true);
    expect(await webhooks.getStatus(shop, webhookId)).toBe("COMPLETED");
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.scope).toBe("read_customers,write_customers");

    const duplicate = await scopes.handleAppScopesUpdate(shop, {
      topic: "APP_SCOPES_UPDATE",
      webhookId,
      sessionId,
      scope: "read_customers",
    });
    expect(duplicate.alreadyProcessed).toBe(true);
    const unchanged = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(unchanged.scope).toBe("read_customers,write_customers");
  });

  it("resumes APP_SCOPES_UPDATE after an injected failure following the scope write", async () => {
    const shop = { shopDomain: uniqueShop("scopes-write-fail") };
    const lifecycle = new ShopLifecycleService(prisma);
    const scopes = new ScopesUpdateService(prisma);
    const webhooks = new ProcessedWebhookRepository(prisma);
    await lifecycle.ensureInstalled(shop);
    const sessionId = `offline_${shop.shopDomain}`;
    await insertOfflineSession(prisma, shop.shopDomain, sessionId, "old-token");
    await prisma.session.update({
      where: { id: sessionId },
      data: { scope: "read_customers" },
    });
    const webhookId = `wh-${shop.shopDomain}-scopes-write`;

    await expect(
      scopes.handleAppScopesUpdate(
        shop,
        {
          topic: "APP_SCOPES_UPDATE",
          webhookId,
          sessionId,
          scope: "read_customers,write_customers",
        },
        { failAt: "after_scope_write" },
      ),
    ).rejects.toBeInstanceOf(InjectedScopesUpdateFailure);

    expect(await webhooks.getStatus(shop, webhookId)).toBe("PENDING");
    const written = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(written.scope).toBe("read_customers,write_customers");

    const retry = await scopes.handleAppScopesUpdate(shop, {
      topic: "APP_SCOPES_UPDATE",
      webhookId,
      sessionId,
      scope: "read_customers,write_customers",
    });
    expect(retry.alreadyProcessed).toBe(false);
    expect(retry.applied).toBe(true);
    expect(await webhooks.getStatus(shop, webhookId)).toBe("COMPLETED");
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.scope).toBe("read_customers,write_customers");
  });

  it("does not apply a PENDING scopes update after a newer verified install", async () => {
    const shop = { shopDomain: uniqueShop("scopes-reinstall") };
    const lifecycle = new ShopLifecycleService(prisma);
    const scopes = new ScopesUpdateService(prisma);
    await lifecycle.ensureInstalled(shop);
    const sessionId = `offline_${shop.shopDomain}`;
    await insertOfflineSession(prisma, shop.shopDomain, sessionId, "old-token");
    await prisma.session.update({
      where: { id: sessionId },
      data: { scope: "read_customers" },
    });
    const webhookId = `wh-${shop.shopDomain}-scopes-stale`;

    await expect(
      scopes.handleAppScopesUpdate(
        shop,
        {
          topic: "APP_SCOPES_UPDATE",
          webhookId,
          sessionId,
          scope: "read_customers,write_customers",
        },
        { failAt: "after_claim" },
      ),
    ).rejects.toBeInstanceOf(InjectedScopesUpdateFailure);

    await prisma.session.update({
      where: { id: sessionId },
      data: { accessToken: "reinstall-token", scope: "read_customers" },
    });
    await lifecycle.ensureInstalled(shop);

    const retry = await scopes.handleAppScopesUpdate(shop, {
      topic: "APP_SCOPES_UPDATE",
      webhookId,
      sessionId,
      scope: "read_customers,write_customers",
    });
    expect(retry.applied).toBe(false);
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.scope).toBe("read_customers");
    expect(session.accessToken).toBe("reinstall-token");
  });

  it("lets afterAuth win when uninstall creates the Shop row first", async () => {
    const shop = { shopDomain: uniqueShop("race-uninstall-first") };
    const installReady = deferred();
    const uninstallCreated = deferred();

    const install = new ShopLifecycleService(prisma, {
      beforeCreate: async () => {
        installReady.resolve();
        await uninstallCreated.promise;
      },
    });
    const uninstall = new UninstallService(prisma, {
      beforeCreate: async () => {
        await installReady.promise;
      },
      afterCreate: async () => {
        uninstallCreated.resolve();
      },
    });

    const triggeredAt = new Date().toISOString();
    const [, installed] = await Promise.all([
      uninstall.handleAppUninstalled(shop, {
        topic: "APP_UNINSTALLED",
        webhookId: `wh-${shop.shopDomain}`,
        triggeredAt,
      }),
      install.ensureInstalled(shop),
    ]);

    expect(installed.installationState).toBe("INSTALLED");
    expect(installed.installGeneration).toBeGreaterThanOrEqual(1);
  });

  it("does not let a concurrent uninstall revert a verified install that created the Shop row first", async () => {
    const shop = { shopDomain: uniqueShop("race-install-first") };
    const uninstallReady = deferred();
    const installCreated = deferred();

    const install = new ShopLifecycleService(prisma, {
      beforeCreate: async () => {
        await uninstallReady.promise;
      },
      afterCreate: async () => {
        installCreated.resolve();
      },
    });
    const uninstall = new UninstallService(prisma, {
      beforeCreate: async () => {
        uninstallReady.resolve();
        await installCreated.promise;
      },
    });

    await insertOfflineSession(prisma, shop.shopDomain, `offline_${shop.shopDomain}`);
    const staleTriggeredAt = new Date(Date.now() - 120_000).toISOString();

    const [uninstalled] = await Promise.all([
      uninstall.handleAppUninstalled(shop, {
        topic: "APP_UNINSTALLED",
        webhookId: `wh-${shop.shopDomain}`,
        triggeredAt: staleTriggeredAt,
      }),
      install.ensureInstalled(shop),
    ]);

    const record = await new ShopRepository(prisma).getByVerifiedShop(shop);
    expect(record.installationState).toBe("INSTALLED");
    expect(uninstalled.ignoredAsStale || !uninstalled.processingStopped).toBe(true);
    expect(await prisma.session.count({ where: { shop: shop.shopDomain } })).toBe(1);
  });

  it("does not delete a reinstall session when a late uninstall webhook arrives", async () => {
    const shop = { shopDomain: uniqueShop("late-uninst-session") };
    const lifecycle = new ShopLifecycleService(prisma);
    const uninstall = new UninstallService(prisma);
    const first = await lifecycle.ensureInstalled(shop);
    await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId: `wh-${shop.shopDomain}-old`,
      triggeredAt: first.installedAt.toISOString(),
    });

    await insertOfflineSession(
      prisma,
      shop.shopDomain,
      `offline_${shop.shopDomain}`,
      "reinstall-token",
    );
    const reinstalled = await lifecycle.ensureInstalled(shop);
    expect(reinstalled.installationState).toBe("INSTALLED");

    const late = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId: `wh-${shop.shopDomain}-late`,
      triggeredAt: new Date(reinstalled.installedAt.getTime() - 1_000).toISOString(),
    });
    expect(late.ignoredAsStale).toBe(true);
    expect(await prisma.session.count({ where: { shop: shop.shopDomain } })).toBe(1);
    const session = await prisma.session.findFirstOrThrow({
      where: { shop: shop.shopDomain },
    });
    expect(session.accessToken).toBe("reinstall-token");
  });

  it("does not lose a seed write when a diagnostic updates at the same time", async () => {
    const shop = { shopDomain: uniqueShop("settings-lost") };
    const lifecycle = new ShopLifecycleService(prisma);
    const shops = new ShopRepository(prisma);
    const seed = new PilotSeedService(prisma);
    await lifecycle.ensureInstalled(shop);

    await Promise.all([
      seed.importPack({ shop, packId: "kliquea-pilot", confirm: true }),
      shops.updateDiagnostic(shop, {
        status: "ok",
        ranAt: new Date(),
        summary: { status: "ok" },
      }),
    ]);

    const record = await shops.getByVerifiedShop(shop);
    const settings = shops.settingsOf(record);
    expect(settings.pilotSeed?.packId).toBe("kliquea-pilot");
    expect(settings.lastDiagnostic?.status).toBe("ok");
  });

  it("resets an applied pilot seed so it can be imported again", async () => {
    const shop = { shopDomain: uniqueShop("seed-reset") };
    const lifecycle = new ShopLifecycleService(prisma);
    const seed = new PilotSeedService(prisma);
    await lifecycle.ensureInstalled(shop);
    await seed.importPack({ shop, packId: "kliquea-pilot", confirm: true });
    await seed.resetPack({ shop, packId: "kliquea-pilot", confirm: true });
    const shops = new ShopRepository(prisma);
    expect(shops.settingsOf(await shops.getByVerifiedShop(shop)).pilotSeed).toBeUndefined();
    const again = await seed.importPack({ shop, packId: "kliquea-pilot", confirm: true });
    expect(again.alreadyImported).toBe(false);
  });

  it("does not revert a newer reinstall when a late uninstall omits X-Shopify-Triggered-At", async () => {
    const shop = { shopDomain: uniqueShop("missing-triggered") };
    const lifecycle = new ShopLifecycleService(prisma);
    const uninstall = new UninstallService(prisma);
    const first = await lifecycle.ensureInstalled(shop);
    await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId: `wh-${shop.shopDomain}-old`,
      triggeredAt: webhookTriggeredAt(first.installedAt),
    });

    await insertOfflineSession(
      prisma,
      shop.shopDomain,
      `offline_${shop.shopDomain}`,
      "reinstall-token",
    );
    const reinstalled = await lifecycle.ensureInstalled(shop);
    expect(reinstalled.installationState).toBe("INSTALLED");

    const late = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId: `wh-${shop.shopDomain}-late`,
    });
    expect(late.ignoredAsStale).toBe(true);
    expect(late.processingStopped).toBe(false);
    const current = await new ShopRepository(prisma).getByVerifiedShop(shop);
    expect(current.installationState).toBe("INSTALLED");
    expect(await prisma.session.count({ where: { shop: shop.shopDomain } })).toBe(
      1,
    );
    const session = await prisma.session.findFirstOrThrow({
      where: { shop: shop.shopDomain },
    });
    expect(session.accessToken).toBe("reinstall-token");
  });

  it("resumes a PENDING uninstall without the header using the claimed timestamp, then ignores it after reinstall", async () => {
    const shop = { shopDomain: uniqueShop("resume-no-header") };
    const lifecycle = new ShopLifecycleService(prisma);
    const uninstall = new UninstallService(prisma);
    const webhooks = new ProcessedWebhookRepository(prisma);
    await lifecycle.ensureInstalled(shop);
    const sessionId = `offline_${shop.shopDomain}`;
    await insertOfflineSession(prisma, shop.shopDomain, sessionId, "original-token");
    const webhookId = `wh-${shop.shopDomain}-pending`;

    await expect(
      uninstall.handleAppUninstalled(
        shop,
        {
          topic: "APP_UNINSTALLED",
          webhookId,
          triggeredAt: webhookTriggeredAt(),
        },
        { failAt: "after_state_change" },
      ),
    ).rejects.toBeInstanceOf(InjectedUninstallFailure);

    await prisma.session.update({
      where: { id: sessionId },
      data: { accessToken: "reinstall-token" },
    });
    const reinstalled = await lifecycle.ensureInstalled(shop);
    expect(reinstalled.installationState).toBe("INSTALLED");
    expect(reinstalled.installGeneration).toBeGreaterThan(1);

    const retry = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId,
    });
    expect(retry.ignoredAsStale).toBe(true);
    expect(retry.processingStopped).toBe(false);
    expect(await webhooks.getStatus(shop, webhookId)).toBe("COMPLETED");
    expect((await lifecycle.load(shop))?.installationState).toBe("INSTALLED");
    const remaining = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(remaining.accessToken).toBe("reinstall-token");
  });

  it("does not delete a rotated session written after claim when resuming after the state change", async () => {
    const shop = { shopDomain: uniqueShop("resume-new-token") };
    const lifecycle = new ShopLifecycleService(prisma);
    const uninstall = new UninstallService(prisma);
    await lifecycle.ensureInstalled(shop);
    const sessionId = `offline_${shop.shopDomain}`;
    await insertOfflineSession(prisma, shop.shopDomain, sessionId, "old-token");
    const webhookId = `wh-${shop.shopDomain}-rotate`;

    await expect(
      uninstall.handleAppUninstalled(
        shop,
        {
          topic: "APP_UNINSTALLED",
          webhookId,
          triggeredAt: webhookTriggeredAt(),
        },
        { failAt: "after_state_change" },
      ),
    ).rejects.toBeInstanceOf(InjectedUninstallFailure);

    expect((await lifecycle.load(shop))?.installationState).toBe("UNINSTALLED");
    await prisma.session.update({
      where: { id: sessionId },
      data: { accessToken: "oauth-token-before-afterAuth" },
    });

    const retry = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId,
    });
    expect(retry.processingStopped).toBe(true);
    expect((await lifecycle.load(shop))?.installationState).toBe("UNINSTALLED");
    const remaining = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(remaining.accessToken).toBe("oauth-token-before-afterAuth");
  });

  it("does not let a delayed uninstall beat a verified reauth while still INSTALLED", async () => {
    const shop = { shopDomain: uniqueShop("reauth-still-installed") };
    const lifecycle = new ShopLifecycleService(prisma);
    const uninstall = new UninstallService(prisma);
    const first = await lifecycle.ensureInstalled(shop);
    const sessionId = `offline_${shop.shopDomain}`;
    await insertOfflineSession(prisma, shop.shopDomain, sessionId, "first-token");
    await new Promise((resolve) => setTimeout(resolve, 25));
    await prisma.session.update({
      where: { id: sessionId },
      data: { accessToken: "reauth-token" },
    });
    const reauth = await lifecycle.ensureInstalled(shop);
    expect(reauth.installGeneration).toBeGreaterThan(first.installGeneration);
    expect(reauth.installedAt.getTime()).toBeGreaterThan(first.installedAt.getTime());

    const late = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId: `wh-${shop.shopDomain}-delayed`,
      triggeredAt: new Date(first.installedAt.getTime() + 5).toISOString(),
    });
    expect(late.ignoredAsStale).toBe(true);
    expect(late.processingStopped).toBe(false);
    const current = await new ShopRepository(prisma).getByVerifiedShop(shop);
    expect(current.installationState).toBe("INSTALLED");
    const remaining = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(remaining.accessToken).toBe("reauth-token");
  });

  it("does not delete the live session when a PENDING uninstall resumes after same-token afterAuth", async () => {
    const shop = { shopDomain: uniqueShop("pending-same-token") };
    const lifecycle = new ShopLifecycleService(prisma);
    const uninstall = new UninstallService(prisma);
    await lifecycle.ensureInstalled(shop);
    const sessionId = `offline_${shop.shopDomain}`;
    await insertOfflineSession(prisma, shop.shopDomain, sessionId, "live-token");
    const webhookId = `wh-${shop.shopDomain}-same-token`;

    await expect(
      uninstall.handleAppUninstalled(
        shop,
        {
          topic: "APP_UNINSTALLED",
          webhookId,
          triggeredAt: webhookTriggeredAt(),
        },
        { failAt: "after_claim" },
      ),
    ).rejects.toBeInstanceOf(InjectedUninstallFailure);

    const reauth = await lifecycle.ensureInstalled(shop);
    expect(reauth.installationState).toBe("INSTALLED");
    expect(reauth.installGeneration).toBeGreaterThan(1);

    const retry = await uninstall.handleAppUninstalled(shop, {
      topic: "APP_UNINSTALLED",
      webhookId,
    });
    expect(retry.ignoredAsStale).toBe(true);
    expect((await lifecycle.load(shop))?.installationState).toBe("INSTALLED");
    const remaining = await prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(remaining.accessToken).toBe("live-token");
  });
});
