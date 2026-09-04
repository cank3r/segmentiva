import type { PrismaClient } from "@prisma/client";

import { ShopRepository, type ShopRecord } from "../../repositories/shop-repository";
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

  constructor(db: PrismaClient) {
    this.shops = new ShopRepository(db);
  }

  async ensureInstalled(shop: VerifiedShopContext): Promise<ShopRecord> {
    return this.shops.upsertInstalled(shop);
  }

  async loadOrCreateWithoutReinstall(
    shop: VerifiedShopContext,
  ): Promise<ShopRecord> {
    return this.shops.createInstalledIfAbsent(shop);
  }

  async markUninstalled(shop: VerifiedShopContext): Promise<ShopRecord> {
    return this.shops.markUninstalled(shop);
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
