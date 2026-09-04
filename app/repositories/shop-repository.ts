import type { Prisma, PrismaClient, Shop, ShopInstallationState } from "@prisma/client";

import type { VerifiedShopContext } from "../tenancy/verified-shop";
import { parseShopSettings, type ShopSettings } from "../services/shop/settings";

export type ShopRecord = Shop;

export class ShopNotFoundError extends Error {
  readonly code = "SHOP_NOT_FOUND";

  constructor(shopDomain: string) {
    super("Shop installation was not found.");
    this.name = "ShopNotFoundError";
    void shopDomain;
  }
}

/**
 * Tenant-scoped Shop access. Every query is bound to the verified shop domain
 * passed by the caller. There is no list/all-shops API here.
 */
export class ShopRepository {
  constructor(private readonly db: PrismaClient) {}

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

  async upsertInstalled(shop: VerifiedShopContext): Promise<ShopRecord> {
    const now = new Date();
    const existing = await this.findByVerifiedShop(shop);

    if (!existing) {
      return this.db.shop.create({
        data: {
          shopDomain: shop.shopDomain,
          installationState: "INSTALLED",
          installedAt: now,
          uninstalledAt: null,
          settings: {},
        },
      });
    }

    if (existing.installationState === "INSTALLED") {
      return existing;
    }

    return this.db.shop.update({
      where: { shopDomain: shop.shopDomain },
      data: {
        installationState: "INSTALLED",
        installedAt: now,
        uninstalledAt: null,
      },
    });
  }

  async markUninstalled(shop: VerifiedShopContext): Promise<ShopRecord> {
    const now = new Date();
    const existing = await this.findByVerifiedShop(shop);

    if (!existing) {
      return this.db.shop.create({
        data: {
          shopDomain: shop.shopDomain,
          installationState: "UNINSTALLED",
          installedAt: now,
          uninstalledAt: now,
          settings: {},
        },
      });
    }

    if (existing.installationState === "UNINSTALLED") {
      return existing;
    }

    return this.db.shop.update({
      where: { shopDomain: shop.shopDomain },
      data: {
        installationState: "UNINSTALLED",
        uninstalledAt: now,
      },
    });
  }

  async replaceSettings(
    shop: VerifiedShopContext,
    settings: ShopSettings,
  ): Promise<ShopRecord> {
    await this.getByVerifiedShop(shop);
    return this.db.shop.update({
      where: { shopDomain: shop.shopDomain },
      data: { settings: settings as Prisma.InputJsonValue },
    });
  }

  settingsOf(record: ShopRecord): ShopSettings {
    return parseShopSettings(record.settings);
  }

  isProcessable(record: ShopRecord): boolean {
    return (
      record.installationState === ("INSTALLED" satisfies ShopInstallationState) &&
      record.uninstalledAt == null
    );
  }
}
