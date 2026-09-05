import type { PrismaClient } from "@prisma/client";

import { ShopLifecycleService } from "../shop/lifecycle";
import { buildOverviewSnapshot, type OverviewSnapshot } from "../shop/overview";
import { verifiedShopFromSession } from "../../tenancy/verified-shop";

export async function loadOverviewPageData(
  db: PrismaClient,
  session: { shop: string },
): Promise<{ overview: OverviewSnapshot }> {
  const shop = verifiedShopFromSession(session);
  const lifecycle = new ShopLifecycleService(db);
  const record = await lifecycle.loadOrCreateWithoutReinstall(shop);

  return {
    overview: buildOverviewSnapshot(
      shop.shopDomain,
      record,
      lifecycle.canProcess(record),
    ),
  };
}
