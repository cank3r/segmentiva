import type { ActionFunctionArgs } from "react-router";

import { safeLog } from "../observability/safe-log";
import { UninstallService } from "../services/shop/uninstall";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { verifiedShopFromWebhookShop } from "../tenancy/verified-shop";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, webhookId, triggeredAt } =
    await authenticate.webhook(request);
  const verifiedShop = verifiedShopFromWebhookShop(shop);

  await new UninstallService(db).handleAppUninstalled(verifiedShop, {
    topic,
    webhookId,
    triggeredAt,
  });

  safeLog("Processed app uninstall webhook", {
    shop: verifiedShop.shopDomain,
    topic,
    webhookId,
  });

  return new Response();
};
