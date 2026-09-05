import { getHmac } from "@shopify/shopify-api/test-helpers";
import { ApiVersion } from "@shopify/shopify-app-react-router/server";

export const TEST_WEBHOOK_SECRET = "test_webhook_secret";
export const TEST_API_KEY = "test_api_key";

export function createShopifyWebhookRequest(input: {
  shop: string;
  topic: string;
  webhookId: string;
  body?: string;
  triggeredAt?: string;
  secret?: string;
  hmac?: string;
}): Request {
  const body = input.body ?? "{}";
  const secret = input.secret ?? TEST_WEBHOOK_SECRET;
  const hmac = input.hmac ?? getHmac(body, secret);
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Shopify-Hmac-Sha256": hmac,
    "X-Shopify-Topic": input.topic,
    "X-Shopify-Shop-Domain": input.shop,
    "X-Shopify-API-Version": ApiVersion.July26,
    "X-Shopify-Webhook-Id": input.webhookId,
  });
  if (input.triggeredAt) {
    headers.set("X-Shopify-Triggered-At", input.triggeredAt);
  }

  return new Request("https://segmentiva.test/webhooks/app/uninstalled", {
    method: "POST",
    headers,
    body,
  });
}
