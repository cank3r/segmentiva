import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { ShopLifecycleService } from "../../app/services/shop/lifecycle";
import { loadOverviewPageData } from "../../app/services/shop/overview-loader";
import {
  handleSettingsAction,
  loadSettingsPageData,
} from "../../app/services/shop/settings-page";
import { toPublicSettingsError } from "../../app/services/shop/public-errors";
import {
  createMigratedTestDatabase,
  uniqueShop,
} from "../helpers/test-db";

describe("Overview and Settings page handlers", () => {
  const { prisma } = createMigratedTestDatabase();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("loads overview for an authenticated session shop only", async () => {
    const shopDomain = uniqueShop("overview-load");
    await new ShopLifecycleService(prisma).ensureInstalled({ shopDomain });
    const data = await loadOverviewPageData(prisma, { shop: shopDomain });
    expect(data.overview.shopDomain).toBe(shopDomain);
    expect(data.overview.processingEnabled).toBe(true);
    expect(data.overview.installationLabel).toBe("Installed");
  });

  it("loads settings with missing-scope comparison for the authenticated shop", async () => {
    const shopDomain = uniqueShop("settings-load");
    await new ShopLifecycleService(prisma).ensureInstalled({ shopDomain });
    const previous = process.env.SCOPES;
    process.env.SCOPES = "read_customers,write_customers";
    const data = await loadSettingsPageData(prisma, {
      shop: shopDomain,
      scope: "read_customers",
    });
    process.env.SCOPES = previous;
    expect(data.shopDomain).toBe(shopDomain);
    expect(data.missingScopes.map((scope) => scope.scope)).toEqual([
      "write_customers",
    ]);
    expect(data.reauthorizeAction).toMatch(/Open Segmentiva from Shopify Admin/i);
    expect(data.pilotImported).toBe(false);
  });

  it("imports the pilot pack only when confirm=yes", async () => {
    const shopDomain = uniqueShop("settings-seed");
    await new ShopLifecycleService(prisma).ensureInstalled({ shopDomain });
    const denied = await handleSettingsAction(prisma, {
      session: { shop: shopDomain },
      admin: { graphql: async () => new Response("{}", { status: 200 }) },
      formData: form({ intent: "import_pilot" }),
    });
    expect(denied.seed?.ok).toBe(false);
    expect(denied.seed?.message).toBe("Pilot seed requires an explicit confirmation.");

    const imported = await handleSettingsAction(prisma, {
      session: { shop: shopDomain },
      admin: { graphql: async () => new Response("{}", { status: 200 }) },
      formData: form({ intent: "import_pilot", confirm: "yes" }),
    });
    expect(imported.seed?.ok).toBe(true);
    expect(imported.seed?.alreadyImported).toBe(false);
  });

  it("returns a generic message when the database fails after authentication", async () => {
    const { prisma: isolated } = createMigratedTestDatabase();
    await isolated.$disconnect();
    const result = await handleSettingsAction(isolated, {
      session: { shop: uniqueShop("after-auth-fail") },
      admin: { graphql: async () => new Response("{}", { status: 200 }) },
      formData: form({ intent: "import_pilot", confirm: "yes" }),
    });
    expect(result.seed?.ok).toBe(false);
    expect(result.seed?.message).toBe("Something went wrong. Try again.");
    expect(result.seed?.message).not.toMatch(/Prisma|P20\d{2}|sqlite/i);
  });

  it("runs a diagnostic without persisting unexpected shop identity on mismatch", async () => {
    const shopDomain = uniqueShop("settings-diag");
    await new ShopLifecycleService(prisma).ensureInstalled({ shopDomain });
    const result = await handleSettingsAction(prisma, {
      session: { shop: shopDomain, scope: "read_customers,write_customers" },
      admin: {
        graphql: async () =>
          new Response(
            JSON.stringify({
              data: {
                shop: {
                  name: "Other Shop",
                  myshopifyDomain: "other.myshopify.com",
                  plan: {
                    publicDisplayName: "Shopify Plus",
                    partnerDevelopment: false,
                  },
                },
              },
            }),
            { status: 200 },
          ),
      },
      formData: form({ intent: "run_diagnostic" }),
    });

    expect(result.diagnostic?.identityMatchesSession).toBe(false);
    expect(result.diagnostic?.shopName).toBeNull();
    expect(result.diagnostic?.myshopifyDomain).toBeNull();
    expect(result.diagnostic?.planDisplayName).toBeNull();
    expect(JSON.stringify(result)).not.toContain("Other Shop");
    expect(JSON.stringify(result)).not.toContain("Shopify Plus");
  });

  it("sanitizes unexpected Prisma errors instead of returning error.message", () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      "Timed out fetching a new connection from the connection pool",
      { code: "P2024", clientVersion: "6.16.3" },
    );
    const publicError = toPublicSettingsError(prismaError);
    expect(publicError.message).toBe("Something went wrong. Try again.");
    expect(publicError.message).not.toContain("connection pool");
    expect(publicError.code).toBe("UNEXPECTED_ERROR");
  });
});

function form(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}
