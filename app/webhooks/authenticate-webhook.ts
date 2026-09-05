import { safeLog } from "../observability/safe-log";
import { normalizeShopDomain } from "../tenancy/shop-domain";

export type AuthenticatedWebhookContext = {
  shop: string;
  topic: string;
  webhookId: string;
  triggeredAt?: string;
  session?: { id: string } | null;
  payload?: { current?: unknown };
};

const UNINSTALL_TOPICS = new Set(["APP_UNINSTALLED", "app/uninstalled"]);

/**
 * Official `authenticate.webhook()` validates HMAC first, then tries to refresh
 * an offline session when `expiringOfflineAccessTokens` is enabled.
 * `@shopify/shopify-app-react-router` 1.2.1 and published 2.1.0 both call
 * `ensureValidOfflineSession` after HMAC. When refresh fails because the token
 * was revoked on uninstall, the library throws Response 500 and the handler
 * never runs. There is no patched 1.x release, and 2.1.0 is a major template
 * jump that still performs the same refresh. Shopify's docs still tell apps to
 * use `authenticate.webhook()` rather than a custom HMAC.
 *
 * This wrapper does not implement HMAC. Invalid HMAC still returns 401 from the
 * official library. Recovery is limited to APP_UNINSTALLED after a 500.
 *
 * Evidence:
 * - node_modules/@shopify/shopify-app-react-router/dist/esm/server/authenticate/webhooks/authenticate.mjs
 *   (validate HMAC, then ensureValidOfflineSession)
 * - node_modules/@shopify/shopify-app-react-router/dist/esm/server/helpers/ensure-offline-token-is-not-expired.mjs
 * - unpacked @shopify/shopify-app-react-router@2.1.0 authenticate.mjs (same order)
 * - https://shopify.dev/docs/apps/build/webhooks/verify-deliveries
 * - https://community.shopify.dev/t/app-uninstalled-and-compliance-webhooks-return-500-after-enabling-expiring-offline-access-tokens/36449
 */
export function recoverUninstallContextAfterOfficialAuthFailure(
  request: Request,
): AuthenticatedWebhookContext | null {
  const topic = request.headers.get("X-Shopify-Topic") ?? "";
  if (!UNINSTALL_TOPICS.has(topic)) {
    return null;
  }

  const shopHeader = request.headers.get("X-Shopify-Shop-Domain");
  const webhookId = request.headers.get("X-Shopify-Webhook-Id");
  if (!shopHeader || !webhookId) {
    return null;
  }

  try {
    return {
      shop: normalizeShopDomain(shopHeader),
      topic: "APP_UNINSTALLED",
      webhookId,
      triggeredAt: request.headers.get("X-Shopify-Triggered-At") ?? undefined,
      session: undefined,
      payload: {},
    };
  } catch {
    return null;
  }
}

export async function authenticateShopifyWebhook(
  request: Request,
  auth: { webhook: (request: Request) => Promise<AuthenticatedWebhookContext> },
): Promise<AuthenticatedWebhookContext> {
  try {
    return await auth.webhook(request);
  } catch (error) {
    if (!(error instanceof Response) || error.status !== 500) {
      throw error;
    }

    const recovered = recoverUninstallContextAfterOfficialAuthFailure(request);
    if (!recovered) {
      throw error;
    }

    safeLog("Recovered APP_UNINSTALLED after official webhook auth 500", {
      shop: recovered.shop,
      topic: recovered.topic,
      webhookId: recovered.webhookId,
      status: "recovered_after_refresh_failure",
    });
    return recovered;
  }
}
