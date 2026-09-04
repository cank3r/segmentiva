import { describe, expect, it } from "vitest";

import {
  containsSensitiveKeys,
  parseGrantedScopes,
  runShopDiagnostic,
} from "../../app/services/shop/diagnostics";

describe("shop diagnostic redaction", () => {
  it("flags objects that include token or secret keys", () => {
    expect(containsSensitiveKeys({ verifiedShopDomain: "shop-a.myshopify.com" })).toBe(
      false,
    );
    expect(containsSensitiveKeys({ accessToken: "redacted" })).toBe(true);
    expect(containsSensitiveKeys({ nested: { apiSecret: "nope" } })).toBe(true);
  });

  it("parses granted scopes without keeping empty entries", () => {
    expect(parseGrantedScopes("write_customers, read_customers")).toEqual([
      "read_customers",
      "write_customers",
    ]);
  });

  it("returns a public identity payload and never includes a token", async () => {
    const result = await runShopDiagnostic({
      shop: { shopDomain: "shop-a.myshopify.com" },
      grantedScopes: ["read_customers", "write_customers"],
      processable: true,
      admin: {
        graphql: async () =>
          new Response(
            JSON.stringify({
              data: {
                shop: {
                  name: "Synthetic Shop A",
                  myshopifyDomain: "shop-a.myshopify.com",
                  plan: {
                    displayName: "Development",
                    partnerDevelopment: true,
                  },
                },
              },
            }),
            { status: 200 },
          ),
      },
    });

    expect(result.status).toBe("ok");
    expect(result.verifiedShopDomain).toBe("shop-a.myshopify.com");
    expect(result.myshopifyDomain).toBe("shop-a.myshopify.com");
    expect(JSON.stringify(result)).not.toMatch(/shpat_|shpss_|accessToken|apiSecret/i);
    expect(containsSensitiveKeys(result)).toBe(false);
  });

  it("does not call Admin GraphQL when processing is stopped", async () => {
    let called = false;
    const result = await runShopDiagnostic({
      shop: { shopDomain: "shop-a.myshopify.com" },
      grantedScopes: [],
      processable: false,
      admin: {
        graphql: async () => {
          called = true;
          return new Response("{}", { status: 200 });
        },
      },
    });

    expect(called).toBe(false);
    expect(result.status).toBe("stopped");
    expect(containsSensitiveKeys(result)).toBe(false);
  });
});
