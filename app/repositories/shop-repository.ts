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
import { fingerprintAccessToken } from "./processed-webhook-repository";
import { isPrismaUniqueConstraintError } from "./prisma-errors";

export type ShopRecord = Shop;

export type RepositoryHooks = {
  beforeCreate?: () => Promise<void>;
  afterCreate?: () => Promise<void>;
  failAfterStateChange?: () => Promise<void>;
  failDuringSessionDelete?: (deletedSoFar: number) => Promise<void>;
};

export class ShopNotFoundError extends Error {
  readonly code = "SHOP_NOT_FOUND";

  constructor(shopDomain: string) {
    super("Shop installation was not found.");
    this.name = "ShopNotFoundError";
    void shopDomain;
  }
}

function parseTriggeredAt(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/**
 * Fail closed: Shopify webhook deliveries include `X-Shopify-Triggered-At`.
 * A missing or unparsable timestamp must not uninstall a live INSTALLED shop.
 * https://shopify.dev/docs/apps/build/webhooks/delivery-structure
 */
function isStaleUninstall(triggeredAt: Date | null, installedAt: Date): boolean {
  if (!triggeredAt) {
    return true;
  }
  return triggeredAt.getTime() < installedAt.getTime();
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
   * Always applies the INSTALLED transition and increments installGeneration,
   * including when the shop is already INSTALLED, so a delayed uninstall cannot
   * beat a newer verified authorization.
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

    if (!existing) {
      await this.getByVerifiedShop(shop);
    }

    const previousState = existing?.installationState;
    return this.db.shop.update({
      where: { shopDomain: shop.shopDomain },
      data: {
        installationState: "INSTALLED",
        installedAt: now,
        uninstalledAt: null,
        installGeneration: { increment: 1 },
        ...(previousState === "UNINSTALLED"
          ? {
              lastDiagnosticStatus: null,
              lastDiagnosticAt: null,
              lastDiagnosticSummary: Prisma.DbNull,
            }
          : {}),
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
    input: {
      triggeredAt?: string;
      claimedInstallGeneration?: number | null;
    } = {},
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
            installedAt: parseTriggeredAt(input.triggeredAt) ?? now,
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
      return {
        record: current,
        applied: false,
        ignoredAsStale:
          input.claimedInstallGeneration != null &&
          current.installGeneration !== input.claimedInstallGeneration,
      };
    }

    if (
      input.claimedInstallGeneration != null &&
      current.installGeneration !== input.claimedInstallGeneration
    ) {
      return { record: current, applied: false, ignoredAsStale: true };
    }

    const triggeredAt = parseTriggeredAt(input.triggeredAt);
    if (isStaleUninstall(triggeredAt, current.installedAt)) {
      return { record: current, applied: false, ignoredAsStale: true };
    }

    const updated = await this.db.shop.updateMany({
      where: {
        shopDomain: shop.shopDomain,
        installationState: "INSTALLED",
        ...(input.claimedInstallGeneration != null
          ? { installGeneration: input.claimedInstallGeneration }
          : {}),
        ...(triggeredAt ? { installedAt: { lte: triggeredAt } } : {}),
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
   * Delete sessions whose id+token hash match the claim-time fingerprints.
   * A reinstall that rotated the access token will not match.
   */
  async deleteSessionsMatchingFingerprints(
    shop: VerifiedShopContext,
    fingerprints: Array<{ id: string; fingerprint: string }>,
  ): Promise<number> {
    if (fingerprints.length === 0) {
      return 0;
    }
    const sessions = await this.db.session.findMany({
      where: { shop: shop.shopDomain },
      select: { id: true, accessToken: true },
    });
    const allowed = new Map(
      fingerprints.map((entry) => [entry.id, entry.fingerprint]),
    );
    let deleted = 0;
    for (const session of sessions) {
      const expected = allowed.get(session.id);
      if (
        !expected ||
        fingerprintAccessToken(session.accessToken) !== expected
      ) {
        continue;
      }
      const result = await this.db.session.deleteMany({
        where: {
          id: session.id,
          shop: shop.shopDomain,
          accessToken: session.accessToken,
        },
      });
      deleted += result.count;
      await this.hooks.failDuringSessionDelete?.(deleted);
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
