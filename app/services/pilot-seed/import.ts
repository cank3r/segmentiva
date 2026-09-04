import type { PrismaClient } from "@prisma/client";

import { ShopRepository } from "../../repositories/shop-repository";
import type { VerifiedShopContext } from "../../tenancy/verified-shop";
import { ShopNotProcessableError } from "../shop/lifecycle";
import type { PilotSeedRecord, ShopSettings } from "../shop/settings";
import { getPilotPack } from "./packs";

export class PilotSeedNotConfirmedError extends Error {
  readonly code = "PILOT_SEED_NOT_CONFIRMED";

  constructor() {
    super("Pilot seed requires an explicit confirmation.");
    this.name = "PilotSeedNotConfirmedError";
  }
}

export type ImportPilotSeedInput = {
  shop: VerifiedShopContext;
  packId: string;
  confirm: boolean;
  now?: Date;
};

export type ImportPilotSeedResult = {
  alreadyImported: boolean;
  packId: string;
  importedAt: string;
};

export class PilotSeedService {
  private readonly shops: ShopRepository;

  constructor(db: PrismaClient) {
    this.shops = new ShopRepository(db);
  }

  async importPack(input: ImportPilotSeedInput): Promise<ImportPilotSeedResult> {
    if (!input.confirm) {
      throw new PilotSeedNotConfirmedError();
    }

    const definition = getPilotPack(input.packId);
    const record = await this.shops.getByVerifiedShop(input.shop);

    if (!this.shops.isProcessable(record)) {
      throw new ShopNotProcessableError(input.shop.shopDomain);
    }

    const current = this.shops.settingsOf(record);
    if (current.pilotSeed?.packId === definition.packId) {
      return {
        alreadyImported: true,
        packId: current.pilotSeed.packId,
        importedAt: current.pilotSeed.importedAt,
      };
    }

    const importedAt = (input.now ?? new Date()).toISOString();
    const seed: PilotSeedRecord = {
      packId: definition.packId,
      importedAt,
      definition,
    };
    const nextSettings: ShopSettings = {
      ...current,
      defaultLocale: current.defaultLocale ?? "en",
      accountCompatibility: "new_customer_accounts",
      pilotSeed: seed,
    };

    await this.shops.replaceSettings(input.shop, nextSettings);

    return {
      alreadyImported: false,
      packId: definition.packId,
      importedAt,
    };
  }
}
