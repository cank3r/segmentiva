import { normalizeShopDomain } from "./shop-domain";

/**
 * Shop identity taken only from Shopify-verified context
 * (`authenticate.admin` session or `authenticate.webhook` shop).
 * Never construct this from a request body, query string, or UI field.
 */
export type VerifiedShopContext = {
  readonly shopDomain: string;
};

export function verifiedShopFromSession(session: {
  shop: string;
}): VerifiedShopContext {
  return { shopDomain: normalizeShopDomain(session.shop) };
}

export function verifiedShopFromWebhookShop(
  shop: string,
): VerifiedShopContext {
  return { shopDomain: normalizeShopDomain(shop) };
}
