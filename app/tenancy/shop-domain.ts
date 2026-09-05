const MYSHOPIFY_DOMAIN_PATTERN =
  /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export class InvalidShopDomainError extends Error {
  readonly code = "INVALID_SHOP_DOMAIN";

  constructor(value: string) {
    super("Shop domain is not a valid *.myshopify.com host.");
    this.name = "InvalidShopDomainError";
    void value;
  }
}

/**
 * Normalize the verified Shopify shop host used as the tenant key.
 * Rejects URLs, custom domains, and any value that is not *.myshopify.com.
 */
export function normalizeShopDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0]?.split(":")[0] ?? "";

  if (!MYSHOPIFY_DOMAIN_PATTERN.test(host)) {
    throw new InvalidShopDomainError(value);
  }

  return host;
}
