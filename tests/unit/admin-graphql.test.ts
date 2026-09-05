import { describe, expect, it, vi } from "vitest";

import {
  queryAdminGraphql,
  ShopifyGraphqlError,
  backoffWithJitterMs,
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

  it("preserves extensions.code and retries only THROTTLED with backoff", async () => {
    let calls = 0;
    const sleep = vi.fn(async () => undefined);
    const result = await queryAdminGraphql<{ shop: { name: string } }>(
      {
        graphql: async () => {
          calls += 1;
          if (calls < 3) {
            return new Response(
              JSON.stringify({
                errors: [
                  {
                    message: "Throttled",
                    extensions: { code: "THROTTLED" },
                  },
                ],
              }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({ data: { shop: { name: "Synthetic Shop A" } } }),
            { status: 200 },
          );
        },
      },
      "query { shop { name } }",
      { sleep, random: () => 0 },
    );

    expect(result.data.shop.name).toBe("Synthetic Shop A");
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, backoffWithJitterMs(0, () => 0));
  });

  it("does not retry ACCESS_DENIED", async () => {
    let calls = 0;
    const sleep = vi.fn(async () => undefined);
    await expect(
      queryAdminGraphql(
        {
          graphql: async () => {
            calls += 1;
            return new Response(
              JSON.stringify({
                errors: [
                  {
                    message: "Denied",
                    extensions: { code: "ACCESS_DENIED" },
                  },
                ],
              }),
              { status: 200 },
            );
          },
        },
        "query { shop { name } }",
        { sleep },
      ),
    ).rejects.toMatchObject({
      codes: ["ACCESS_DENIED"],
      retryable: false,
    });
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
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
