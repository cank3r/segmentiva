import type { PrismaClient } from "@prisma/client";

import { ShopLifecycleService } from "../shop/lifecycle";
import { buildOverviewSnapshot, type OverviewSnapshot } from "../shop/overview";
import {
  toPublicSettingsError,
  type PublicActionError,
} from "../shop/public-errors";
import { verifiedShopFromSession } from "../../tenancy/verified-shop";

export type OverviewLoaderData =
  | { error: null; overview: OverviewSnapshot }
  | { error: PublicActionError; overview: null };

export async function loadOverviewPageData(
  db: PrismaClient,
  session: { shop: string },
): Promise<OverviewLoaderData> {
  const shop = verifiedShopFromSession(session);
  try {
    const lifecycle = new ShopLifecycleService(db);
    const record = await lifecycle.loadOrCreateWithoutReinstall(shop);

    return {
      error: null,
      overview: buildOverviewSnapshot(
        shop.shopDomain,
        record,
        lifecycle.canProcess(record),
      ),
    };
  } catch (error) {
    return {
      error: toPublicSettingsError(error, "Overview loader failed"),
      overview: null,
    };
  }
}
