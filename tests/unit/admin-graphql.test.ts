import { describe, expect, it } from "vitest";

import {
  queryAdminGraphql,
  ShopifyGraphqlError,
} from "../../app/services/shopify/admin-graphql";

describe("Admin GraphQL adapter", () => {
  it("treats HTTP 200 with errors as failure without exposing the payload", async () => {
    await expect(
      queryAdminGraphql(
        {
          graphql: async () =>
            new Response(
              JSON.stringify({
                errors: [{ message: "throttled with token shpat_example" }],
              }),
              { status: 200 },
            ),
        },
        "query { shop { name } }",
      ),
    ).rejects.toBeInstanceOf(ShopifyGraphqlError);
  });

  it("returns data when the query succeeds", async () => {
    const result = await queryAdminGraphql<{ shop: { name: string } }>(
      {
        graphql: async () =>
          new Response(
            JSON.stringify({
              data: { shop: { name: "Synthetic Shop A" } },
              extensions: {
                cost: {
                  throttleStatus: { currentlyAvailable: 1000 },
                },
              },
            }),
            { status: 200 },
          ),
      },
      "query { shop { name } }",
    );

    expect(result.data.shop.name).toBe("Synthetic Shop A");
    expect(result.throttled).toBe(false);
  });
});
