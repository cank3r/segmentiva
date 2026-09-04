import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ShopRepository } from "../../app/repositories/shop-repository";
import { PilotSeedNotConfirmedError, PilotSeedService } from "../../app/services/pilot-seed/import";
import { ShopLifecycleService, ShopNotProcessableError } from "../../app/services/shop/lifecycle";
import { UninstallService } from "../../app/services/shop/uninstall";
import {
  createMigratedTestDatabase,
  SHOP_A,
  SHOP_B,
} from "../helpers/test-db";

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

  it("stops processing after uninstall and keeps merchant settings for reinstall", async () => {
    const first = await uninstall.handleAppUninstalled(
      { shopDomain: SHOP_A },
      { topic: "APP_UNINSTALLED", webhookId: "wh-uninstall-a-1" },
    );
    expect(first.processingStopped).toBe(true);

    const uninstalled = await shops.getByVerifiedShop({ shopDomain: SHOP_A });
    expect(uninstalled.installationState).toBe("UNINSTALLED");
    expect(shops.isProcessable(uninstalled)).toBe(false);
    expect(shops.settingsOf(uninstalled).pilotSeed?.packId).toBe("kliquea-pilot");

    await expect(
      seed.importPack({
        shop: { shopDomain: SHOP_A },
        packId: "kliquea-pilot",
        confirm: true,
      }),
    ).rejects.toBeInstanceOf(ShopNotProcessableError);

    const replay = await uninstall.handleAppUninstalled(
      { shopDomain: SHOP_A },
      { topic: "APP_UNINSTALLED", webhookId: "wh-uninstall-a-1" },
    );
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.processingStopped).toBe(true);

    const reinstalled = await lifecycle.ensureInstalled({ shopDomain: SHOP_A });
    expect(reinstalled.installationState).toBe("INSTALLED");
    expect(shops.isProcessable(reinstalled)).toBe(true);
    expect(shops.settingsOf(reinstalled).pilotSeed?.packId).toBe("kliquea-pilot");

    const shopB = await shops.getByVerifiedShop({ shopDomain: SHOP_B });
    expect(shopB.installationState).toBe("INSTALLED");
    expect(shops.settingsOf(shopB).pilotSeed).toBeUndefined();
  });

  it("ignores a stale uninstall webhook after a newer reinstall", async () => {
    const installed = await shops.getByVerifiedShop({ shopDomain: SHOP_A });
    const staleTimestamp = new Date(installed.installedAt.getTime() - 60_000).toISOString();

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
  });
});
