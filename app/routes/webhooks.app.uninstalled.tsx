import type { ActionFunctionArgs } from "react-router";
import type { PrismaClient } from "@prisma/client";

import { safeLog } from "../observability/safe-log";
import { UninstallService } from "../services/shop/uninstall";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { verifiedShopFromWebhookShop } from "../tenancy/verified-shop";
import { authenticateShopifyWebhook } from "../webhooks/authenticate-webhook";
import type { AuthenticatedWebhookContext } from "../webhooks/authenticate-webhook";

export async function processAppUninstalledRequest(
  request: Request,
  deps: {
    authenticate?: { webhook: (request: Request) => Promise<AuthenticatedWebhookContext> };
    db?: PrismaClient;
  } = {},
): Promise<Response> {
  const { shop, topic, webhookId, triggeredAt } =
    await authenticateShopifyWebhook(
      request,
      deps.authenticate ?? authenticate,
    );
  const verifiedShop = verifiedShopFromWebhookShop(shop);

  await new UninstallService(deps.db ?? db).handleAppUninstalled(verifiedShop, {
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

export const action = async ({ request }: ActionFunctionArgs) => {
  return processAppUninstalledRequest(request);
};
