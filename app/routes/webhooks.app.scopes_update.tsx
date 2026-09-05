import type { ActionFunctionArgs } from "react-router";
import type { PrismaClient } from "@prisma/client";

import db from "../db.server";
import { safeLog } from "../observability/safe-log";
import { ScopesUpdateService } from "../services/shop/scopes-update";
import { authenticate } from "../shopify.server";
import { verifiedShopFromWebhookShop } from "../tenancy/verified-shop";
import { authenticateShopifyWebhook } from "../webhooks/authenticate-webhook";
import type { AuthenticatedWebhookContext } from "../webhooks/authenticate-webhook";

export async function processAppScopesUpdateRequest(
  request: Request,
  deps: {
    authenticate?: { webhook: (request: Request) => Promise<AuthenticatedWebhookContext> };
    db?: PrismaClient;
  } = {},
): Promise<Response> {
  const { payload, session, topic, shop, webhookId } =
    await authenticateShopifyWebhook(
      request,
      deps.authenticate ?? authenticate,
    );
  const verifiedShop = verifiedShopFromWebhookShop(shop);
  const current = payload?.current;
  const scope = Array.isArray(current) ? current.join(",") : undefined;

  await new ScopesUpdateService(deps.db ?? db).handleAppScopesUpdate(
    verifiedShop,
    {
      topic,
      webhookId,
      sessionId: session?.id,
      scope,
    },
  );

  safeLog("Processed app scopes update webhook", {
    shop: verifiedShop.shopDomain,
    topic,
    webhookId,
  });

  return new Response();
}

export const action = async ({ request }: ActionFunctionArgs) => {
  return processAppScopesUpdateRequest(request);
};
