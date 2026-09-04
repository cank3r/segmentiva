import type { ActionFunctionArgs } from "react-router";

import db from "../db.server";
import { safeLog } from "../observability/safe-log";
import { ProcessedWebhookRepository } from "../repositories/processed-webhook-repository";
import { ShopLifecycleService } from "../services/shop/lifecycle";
import { authenticate } from "../shopify.server";
import { verifiedShopFromWebhookShop } from "../tenancy/verified-shop";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop, webhookId } =
    await authenticate.webhook(request);
  const verifiedShop = verifiedShopFromWebhookShop(shop);
  const claimed = await new ProcessedWebhookRepository(db).claim(verifiedShop, {
    topic,
    webhookId,
  });

  if (!claimed) {
    return new Response();
  }

  const lifecycle = new ShopLifecycleService(db);
  const record = await lifecycle.load(verifiedShop);
  if (!lifecycle.canProcess(record) || !session) {
    return new Response();
  }

  const current = payload.current;
  const scope = Array.isArray(current) ? current.join(",") : undefined;
  if (scope) {
    await db.session.update({
      where: { id: session.id },
      data: { scope },
    });
  }

  safeLog("Processed app scopes update webhook", {
    shop: verifiedShop.shopDomain,
    topic,
    webhookId,
  });

  return new Response();
};
