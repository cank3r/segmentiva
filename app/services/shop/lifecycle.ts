import type { PrismaClient } from "@prisma/client";

import {
  ShopRepository,
  type RepositoryHooks,
  type ShopRecord,
} from "../../repositories/shop-repository";
import type { VerifiedShopContext } from "../../tenancy/verified-shop";

export class ShopNotProcessableError extends Error {
  readonly code = "SHOP_NOT_PROCESSABLE";

  constructor(shopDomain: string) {
    super("Shop is uninstalled. Application processing is stopped.");
    this.name = "ShopNotProcessableError";
    void shopDomain;
  }
}

export class ShopLifecycleService {
  private readonly shops: ShopRepository;

  constructor(db: PrismaClient, hooks: RepositoryHooks = {}) {
    this.shops = new ShopRepository(db, hooks);
  }

  async ensureInstalled(shop: VerifiedShopContext): Promise<ShopRecord> {
    return this.shops.recordVerifiedInstall(shop);
  }

  async loadOrCreateWithoutReinstall(
    shop: VerifiedShopContext,
  ): Promise<ShopRecord> {
    return this.shops.createInstalledIfAbsent(shop);
  }

  async load(shop: VerifiedShopContext): Promise<ShopRecord | null> {
    return this.shops.findByVerifiedShop(shop);
  }

  async requireProcessable(shop: VerifiedShopContext): Promise<ShopRecord> {
    const record = await this.shops.findByVerifiedShop(shop);
    if (!record || !this.shops.isProcessable(record)) {
      throw new ShopNotProcessableError(shop.shopDomain);
    }
    return record;
  }

  canProcess(record: ShopRecord | null): boolean {
    return record != null && this.shops.isProcessable(record);
  }
}
