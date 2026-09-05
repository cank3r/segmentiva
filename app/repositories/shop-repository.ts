import {
  Prisma,
  type PrismaClient,
  type Shop,
  type ShopInstallationState,
} from "@prisma/client";

import type { VerifiedShopContext } from "../tenancy/verified-shop";
import {
  settingsFromShopRecord,
  type ShopSettings,
} from "../services/shop/settings";
import { isPrismaUniqueConstraintError } from "./prisma-errors";

export type ShopRecord = Shop;

export type RepositoryHooks = {
  beforeCreate?: () => Promise<void>;
  afterCreate?: () => Promise<void>;
  failAfterStateChange?: () => Promise<void>;
  failDuringSessionDelete?: () => Promise<void>;
};

export class ShopNotFoundError extends Error {
  readonly code = "SHOP_NOT_FOUND";

  constructor(shopDomain: string) {
    super("Shop installation was not found.");
    this.name = "ShopNotFoundError";
    void shopDomain;
  }
}

function isStaleUninstall(triggeredAt: string | undefined, installedAt: Date): boolean {
  if (!triggeredAt) {
    return false;
  }
  const triggeredMs = Date.parse(triggeredAt);
  return !Number.isNaN(triggeredMs) && triggeredMs < installedAt.getTime();
}

/**
 * Tenant-scoped Shop access. Every query is bound to the verified shop domain
 * passed by the caller. There is no list/all-shops API here.
 */
export class ShopRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly hooks: RepositoryHooks = {},
  ) {}

  async findByVerifiedShop(
    shop: VerifiedShopContext,
  ): Promise<ShopRecord | null> {
    return this.db.shop.findUnique({
      where: { shopDomain: shop.shopDomain },
    });
  }

  async getByVerifiedShop(shop: VerifiedShopContext): Promise<ShopRecord> {
    const record = await this.findByVerifiedShop(shop);
    if (!record) {
      throw new ShopNotFoundError(shop.shopDomain);
    }
    return record;
  }

  /**
   * Records a verified OAuth install or reinstall from afterAuth.
   * Revives UNINSTALLED shops. Does not treat a concurrent uninstall winner as
   * the final state — afterAuth always applies the INSTALLED transition.
   */
  async recordVerifiedInstall(shop: VerifiedShopContext): Promise<ShopRecord> {
    const now = new Date();
    const existing = await this.findByVerifiedShop(shop);

    if (!existing) {
      await this.hooks.beforeCreate?.();
      try {
        return await this.db.shop.create({
          data: {
            shopDomain: shop.shopDomain,
            installationState: "INSTALLED",
            installedAt: now,
            uninstalledAt: null,
            installGeneration: 1,
          },
        }).then(async (created) => {
          await this.hooks.afterCreate?.();
          return created;
        });
      } catch (error) {
        if (!isPrismaUniqueConstraintError(error)) {
          throw error;
        }
      }
    }

    const current = existing ?? (await this.getByVerifiedShop(shop));
    if (
      current.installationState === "INSTALLED" &&
      current.uninstalledAt == null
    ) {
      return current;
    }

    return this.db.shop.update({
      where: { shopDomain: shop.shopDomain },
      data: {
        installationState: "INSTALLED",
        installedAt: now,
        uninstalledAt: null,
        installGeneration: { increment: 1 },
      },
    });
  }

  /**
   * Compare-and-set uninstall. Returns whether this call transitioned the shop
   * to UNINSTALLED (or created an UNINSTALLED row) versus ignoring a stale
   * webhook after a newer verified install.
   */
  async applyUninstallIfCurrent(
    shop: VerifiedShopContext,
    triggeredAt?: string,
  ): Promise<{ record: ShopRecord; applied: boolean; ignoredAsStale: boolean }> {
    const existing = await this.findByVerifiedShop(shop);

    if (!existing) {
      await this.hooks.beforeCreate?.();
      const now = new Date();
      try {
        const created = await this.db.shop.create({
          data: {
            shopDomain: shop.shopDomain,
            installationState: "UNINSTALLED",
            installedAt: triggeredAt ? new Date(triggeredAt) : now,
            uninstalledAt: now,
            installGeneration: 0,
          },
        });
        await this.hooks.afterCreate?.();
        return { record: created, applied: true, ignoredAsStale: false };
      } catch (error) {
        if (!isPrismaUniqueConstraintError(error)) {
          throw error;
        }
      }
    }

    const current = existing ?? (await this.getByVerifiedShop(shop));

    if (current.installationState === "UNINSTALLED") {
      return { record: current, applied: false, ignoredAsStale: false };
    }

    if (isStaleUninstall(triggeredAt, current.installedAt)) {
      return { record: current, applied: false, ignoredAsStale: true };
    }

    const updated = await this.db.shop.updateMany({
      where: {
        shopDomain: shop.shopDomain,
        installationState: "INSTALLED",
        installedAt: triggeredAt
          ? { lte: new Date(triggeredAt) }
          : { lte: new Date() },
      },
      data: {
        installationState: "UNINSTALLED",
        uninstalledAt: new Date(),
      },
    });

    const record = await this.getByVerifiedShop(shop);
    if (updated.count === 0) {
      return {
        record,
        applied: false,
        ignoredAsStale: record.installationState === "INSTALLED",
      };
    }

    return { record, applied: true, ignoredAsStale: false };
  }

  /**
   * Create an INSTALLED row only when none exists. Never revives UNINSTALLED.
   * Used by authenticated Admin loaders so leftover sessions cannot undo uninstall.
   */
  async createInstalledIfAbsent(shop: VerifiedShopContext): Promise<ShopRecord> {
    const existing = await this.findByVerifiedShop(shop);
    if (existing) {
      return existing;
    }

    const now = new Date();
    await this.hooks.beforeCreate?.();
    try {
      return await this.db.shop.create({
        data: {
          shopDomain: shop.shopDomain,
          installationState: "INSTALLED",
          installedAt: now,
          uninstalledAt: null,
          installGeneration: 1,
        },
      }).then(async (created) => {
        await this.hooks.afterCreate?.();
        return created;
      });
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return this.getByVerifiedShop(shop);
      }
      throw error;
    }
  }

  /**
   * Delete sessions that still match the snapshot taken before uninstall.
   * A reinstall that rotated the access token will not match, so its session stays.
   */
  async deleteSessionsMatchingSnapshot(
    shop: VerifiedShopContext,
    snapshot: Array<{ id: string; accessToken: string }>,
  ): Promise<number> {
    await this.hooks.failDuringSessionDelete?.();
    let deleted = 0;
    for (const session of snapshot) {
      const result = await this.db.session.deleteMany({
        where: {
          id: session.id,
          shop: shop.shopDomain,
          accessToken: session.accessToken,
        },
      });
      deleted += result.count;
    }
    return deleted;
  }

  async snapshotSessions(
    shop: VerifiedShopContext,
  ): Promise<Array<{ id: string; accessToken: string }>> {
    return this.db.session.findMany({
      where: { shop: shop.shopDomain },
      select: { id: true, accessToken: true },
    });
  }

  async updateDiagnostic(
    shop: VerifiedShopContext,
    diagnostic: {
      status: string;
      ranAt: Date;
      summary: Prisma.InputJsonValue;
    },
  ): Promise<ShopRecord> {
    await this.getByVerifiedShop(shop);
    return this.db.shop.update({
      where: { shopDomain: shop.shopDomain },
      data: {
        lastDiagnosticStatus: diagnostic.status,
        lastDiagnosticAt: diagnostic.ranAt,
        lastDiagnosticSummary: diagnostic.summary,
      },
    });
  }

  async updatePilotSeed(
    shop: VerifiedShopContext,
    seed: {
      packId: string | null;
      importedAt: Date | null;
      version: string | null;
      status: string | null;
      definition: Prisma.InputJsonValue | null;
    },
  ): Promise<ShopRecord> {
    await this.getByVerifiedShop(shop);
    return this.db.shop.update({
      where: { shopDomain: shop.shopDomain },
      data: {
        pilotSeedPackId: seed.packId,
        pilotSeedImportedAt: seed.importedAt,
        pilotSeedVersion: seed.version,
        pilotSeedStatus: seed.status,
        pilotSeedDefinition:
          seed.definition === null ? Prisma.DbNull : seed.definition,
      },
    });
  }

  settingsOf(record: ShopRecord): ShopSettings {
    return settingsFromShopRecord(record);
  }

  isProcessable(record: ShopRecord): boolean {
    return (
      record.installationState === ("INSTALLED" satisfies ShopInstallationState) &&
      record.uninstalledAt == null
    );
  }
}
