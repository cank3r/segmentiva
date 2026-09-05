import type { PrismaClient } from "@prisma/client";

import { safeLog } from "../observability/safe-log";
import { UninstallService } from "../services/shop/uninstall";
import { verifiedShopFromWebhookShop } from "../tenancy/verified-shop";
import {
  authenticateShopifyWebhook,
  type AuthenticatedWebhookContext,
} from "./authenticate-webhook";

export async function processAppUninstalledRequest(
  request: Request,
  deps: {
    authenticate: { webhook: (request: Request) => Promise<AuthenticatedWebhookContext> };
    db: PrismaClient;
  },
): Promise<Response> {
  const { shop, topic, webhookId, triggeredAt } =
    await authenticateShopifyWebhook(request, deps.authenticate);
  const verifiedShop = verifiedShopFromWebhookShop(shop);

  await new UninstallService(deps.db).handleAppUninstalled(verifiedShop, {
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
}
