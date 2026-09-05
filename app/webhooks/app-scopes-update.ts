import type { PrismaClient } from "@prisma/client";

import { safeLog } from "../observability/safe-log";
import { ScopesUpdateService } from "../services/shop/scopes-update";
import { verifiedShopFromWebhookShop } from "../tenancy/verified-shop";
import {
  authenticateShopifyWebhook,
  type AuthenticatedWebhookContext,
} from "./authenticate-webhook";

export async function processAppScopesUpdateRequest(
  request: Request,
  deps: {
    authenticate: { webhook: (request: Request) => Promise<AuthenticatedWebhookContext> };
    db: PrismaClient;
  },
): Promise<Response> {
  const { payload, session, topic, shop, webhookId } =
    await authenticateShopifyWebhook(request, deps.authenticate);
  const verifiedShop = verifiedShopFromWebhookShop(shop);
  const current = payload?.current;
  const scope = Array.isArray(current) ? current.join(",") : undefined;

  await new ScopesUpdateService(deps.db).handleAppScopesUpdate(verifiedShop, {
    topic,
    webhookId,
    sessionId: session?.id,
    scope,
  });

  safeLog("Processed app scopes update webhook", {
    shop: verifiedShop.shopDomain,
    topic,
    webhookId,
  });

  return new Response();
}
