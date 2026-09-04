import { describe, expect, it } from "vitest";

import { InvalidShopDomainError, normalizeShopDomain } from "../../app/tenancy/shop-domain";

describe("shop domain tenant key", () => {
  it("normalizes a verified myshopify host", () => {
    expect(normalizeShopDomain("Shop-A.myshopify.com")).toBe(
      "shop-a.myshopify.com",
    );
  });

  it("rejects custom domains, URLs with paths, and non-shop hosts", () => {
    expect(() => normalizeShopDomain("kliquea.com")).toThrow(
      InvalidShopDomainError,
    );
    expect(() =>
      normalizeShopDomain("https://shop-a.myshopify.com/admin"),
    ).not.toThrow();
    expect(normalizeShopDomain("https://shop-a.myshopify.com/admin")).toBe(
      "shop-a.myshopify.com",
    );
    expect(() => normalizeShopDomain("not-a-shop")).toThrow(
      InvalidShopDomainError,
    );
    expect(() => normalizeShopDomain("shop-a.myshopify.com.evil.example")).toThrow(
      InvalidShopDomainError,
    );
  });
});
