import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ShopRepository } from "../../app/repositories/shop-repository";
import { PilotSeedNotConfirmedError, PilotSeedService } from "../../app/services/pilot-seed/import";
import { buildOverviewSnapshot } from "../../app/services/shop/overview";
import { ShopLifecycleService, ShopNotProcessableError } from "../../app/services/shop/lifecycle";
import { UninstallService } from "../../app/services/shop/uninstall";
import {
  createMigratedTestDatabase,
  SHOP_A,
  SHOP_B,
} from "../helpers/test-db";

async function insertOfflineSession(
  prisma: PrismaClient,
  shopDomain: string,
  id: string,
) {
  await prisma.session.create({
    data: {
      id,
      shop: shopDomain,
      state: "offline",
      isOnline: false,
      accessToken: "test-placeholder",
    },
  });
}

describe("tenant isolation and installation lifecycle", () => {
  let prisma: PrismaClient;
  let shops: ShopRepository;
  let lifecycle: ShopLifecycleService;
  let uninstall: UninstallService;
  let seed: PilotSeedService;

  beforeAll(async () => {
    ({ prisma } = createMigratedTestDatabase());
    shops = new ShopRepository(prisma);
    lifecycle = new ShopLifecycleService(prisma);
    uninstall = new UninstallService(prisma);
    seed = new PilotSeedService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps Shop A and Shop B records isolated", async () => {
    await lifecycle.ensureInstalled({ shopDomain: SHOP_A });
    await lifecycle.ensureInstalled({ shopDomain: SHOP_B });

    await seed.importPack({
      shop: { shopDomain: SHOP_A },
      packId: "kliquea-pilot",
      confirm: true,
    });

    const shopA = await shops.getByVerifiedShop({ shopDomain: SHOP_A });
    const shopB = await shops.getByVerifiedShop({ shopDomain: SHOP_B });

    expect(shops.settingsOf(shopA).pilotSeed?.packId).toBe("kliquea-pilot");
    expect(shops.settingsOf(shopB).pilotSeed).toBeUndefined();
    expect(shopA.shopDomain).not.toBe(shopB.shopDomain);
  });

  it("refuses to import a pilot pack without explicit confirmation", async () => {
    await expect(
      seed.importPack({
        shop: { shopDomain: SHOP_B },
        packId: "kliquea-pilot",
        confirm: false,
      }),
    ).rejects.toBeInstanceOf(PilotSeedNotConfirmedError);
  });

  it("stops processing after uninstall, deletes only that shop's sessions, and keeps settings", async () => {
    await insertOfflineSession(prisma, SHOP_A, "offline_shop-a");
    await insertOfflineSession(prisma, SHOP_B, "offline_shop-b");

    const first = await uninstall.handleAppUninstalled(
      { shopDomain: SHOP_A },
      { topic: "APP_UNINSTALLED", webhookId: "wh-uninstall-a-1" },
    );
    expect(first.alreadyProcessed).toBe(false);
    expect(first.processingStopped).toBe(true);

    const uninstalled = await shops.getByVerifiedShop({ shopDomain: SHOP_A });
    expect(uninstalled.installationState).toBe("UNINSTALLED");
    expect(shops.isProcessable(uninstalled)).toBe(false);
    expect(shops.settingsOf(uninstalled).pilotSeed?.packId).toBe("kliquea-pilot");

    expect(await prisma.session.count({ where: { shop: SHOP_A } })).toBe(0);
    expect(await prisma.session.count({ where: { shop: SHOP_B } })).toBe(1);

    await expect(
      seed.importPack({
        shop: { shopDomain: SHOP_A },
        packId: "kliquea-pilot",
        confirm: true,
      }),
    ).rejects.toBeInstanceOf(ShopNotProcessableError);

    const replayWhileUninstalled = await uninstall.handleAppUninstalled(
      { shopDomain: SHOP_A },
      { topic: "APP_UNINSTALLED", webhookId: "wh-uninstall-a-1" },
    );
    expect(replayWhileUninstalled.alreadyProcessed).toBe(true);
    expect(replayWhileUninstalled.processingStopped).toBe(true);
  });

  it("does not revive an uninstalled shop from an authenticated Admin load", async () => {
    const loaded = await lifecycle.loadOrCreateWithoutReinstall({
      shopDomain: SHOP_A,
    });
    expect(loaded.installationState).toBe("UNINSTALLED");
    expect(lifecycle.canProcess(loaded)).toBe(false);
  });

  it("reinstalls through afterAuth and ignores the previous uninstall webhook id", async () => {
    await insertOfflineSession(prisma, SHOP_A, "offline_shop-a-reinstall");

    const reinstalled = await lifecycle.ensureInstalled({ shopDomain: SHOP_A });
    expect(reinstalled.installationState).toBe("INSTALLED");
    expect(shops.isProcessable(reinstalled)).toBe(true);
    expect(shops.settingsOf(reinstalled).pilotSeed?.packId).toBe("kliquea-pilot");

    const replayAfterReinstall = await uninstall.handleAppUninstalled(
      { shopDomain: SHOP_A },
      { topic: "APP_UNINSTALLED", webhookId: "wh-uninstall-a-1" },
    );
    expect(replayAfterReinstall.alreadyProcessed).toBe(true);
    expect(replayAfterReinstall.processingStopped).toBe(false);

    const current = await shops.getByVerifiedShop({ shopDomain: SHOP_A });
    expect(current.installationState).toBe("INSTALLED");
    expect(await prisma.session.count({ where: { shop: SHOP_A } })).toBe(1);

    const shopB = await shops.getByVerifiedShop({ shopDomain: SHOP_B });
    expect(shopB.installationState).toBe("INSTALLED");
    expect(shops.settingsOf(shopB).pilotSeed).toBeUndefined();
    expect(await prisma.session.count({ where: { shop: SHOP_B } })).toBe(1);
  });

  it("ignores a stale uninstall webhook with a new id after a newer reinstall", async () => {
    const installed = await shops.getByVerifiedShop({ shopDomain: SHOP_A });
    const staleTimestamp = new Date(
      installed.installedAt.getTime() - 60_000,
    ).toISOString();

    const result = await uninstall.handleAppUninstalled(
      { shopDomain: SHOP_A },
      {
        topic: "APP_UNINSTALLED",
        webhookId: "wh-uninstall-stale",
        triggeredAt: staleTimestamp,
      },
    );

    expect(result.ignoredAsStale).toBe(true);
    expect(result.processingStopped).toBe(false);
    const current = await shops.getByVerifiedShop({ shopDomain: SHOP_A });
    expect(current.installationState).toBe("INSTALLED");
    expect(await prisma.session.count({ where: { shop: SHOP_A } })).toBe(1);
  });

  it("handles concurrent first installs for the same shop", async () => {
    const shop = { shopDomain: "shop-concurrent.myshopify.com" };
    const [first, second] = await Promise.all([
      lifecycle.ensureInstalled(shop),
      lifecycle.ensureInstalled(shop),
    ]);

    expect(first.shopDomain).toBe(shop.shopDomain);
    expect(second.shopDomain).toBe(shop.shopDomain);
    expect(await prisma.shop.count({ where: { shopDomain: shop.shopDomain } })).toBe(
      1,
    );
  });

  it("marks the overview diagnostic checklist complete after a stored ok result", async () => {
    await shops.replaceSettings(
      { shopDomain: SHOP_A },
      {
        ...shops.settingsOf(await shops.getByVerifiedShop({ shopDomain: SHOP_A })),
        lastDiagnostic: {
          status: "ok",
          ranAt: "2026-09-04T00:00:00.000Z",
        },
      },
    );
    const record = await shops.getByVerifiedShop({ shopDomain: SHOP_A });
    const overview = buildOverviewSnapshot(SHOP_A, record, true);
    const diagnostic = overview.checklist.find((item) => item.id === "diagnostic");
    expect(diagnostic?.status).toBe("complete");
  });
});
