import { Prisma, type PrismaClient } from "@prisma/client";

import { ShopRepository } from "../../repositories/shop-repository";
import type { VerifiedShopContext } from "../../tenancy/verified-shop";
import { ShopNotProcessableError } from "../shop/lifecycle";
import type { ShopSettings } from "../shop/settings";
import { getPilotPack, KLIQUEA_PILOT_PACK_VERSION } from "./packs";

export class PilotSeedNotConfirmedError extends Error {
  readonly code = "PILOT_SEED_NOT_CONFIRMED";

  constructor(message = "Confirm the import for this shop.") {
    super(message);
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
  version: string;
  importedAt: string;
  status: "applied";
};

export type ResetPilotSeedInput = {
  shop: VerifiedShopContext;
  packId: string;
  confirm: boolean;
};

export type ResetPilotSeedResult = {
  reset: boolean;
  packId: string;
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
    if (
      current.pilotSeed?.packId === definition.packId &&
      current.pilotSeed.status === "applied" &&
      current.pilotSeed.version === definition.version
    ) {
      return {
        alreadyImported: true,
        packId: current.pilotSeed.packId,
        version: current.pilotSeed.version,
        importedAt: current.pilotSeed.importedAt,
        status: "applied",
      };
    }

    const importedAt = input.now ?? new Date();
    await this.shops.updatePilotSeed(input.shop, {
      packId: definition.packId,
      importedAt,
      version: definition.version,
      status: "applied",
      definition: definition as unknown as Prisma.InputJsonValue,
    });

    return {
      alreadyImported: false,
      packId: definition.packId,
      version: definition.version,
      importedAt: importedAt.toISOString(),
      status: "applied",
    };
  }

  async resetPack(input: ResetPilotSeedInput): Promise<ResetPilotSeedResult> {
    if (!input.confirm) {
      throw new PilotSeedNotConfirmedError(
        "Confirm clearing the import for this shop.",
      );
    }

    const definition = getPilotPack(input.packId);
    const record = await this.shops.getByVerifiedShop(input.shop);
    if (!this.shops.isProcessable(record)) {
      throw new ShopNotProcessableError(input.shop.shopDomain);
    }

    await this.shops.updatePilotSeed(input.shop, {
      packId: null,
      importedAt: null,
      version: null,
      status: "reset",
      definition: null,
    });

    return { reset: true, packId: definition.packId };
  }

  currentSeed(settings: ShopSettings): ShopSettings["pilotSeed"] {
    return settings.pilotSeed;
  }

  supportedVersion(): string {
    return KLIQUEA_PILOT_PACK_VERSION;
  }
}
