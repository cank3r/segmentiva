import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { ShopLifecycleService } from "../../app/services/shop/lifecycle";

const SHOP_DOMAIN = "shop-authenticated-routes.myshopify.com";

const db = vi.hoisted(() => ({
  prisma: null as PrismaClient | null,
}));

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: async () => ({
      session: {
        shop: SHOP_DOMAIN,
        scope: "read_customers,write_customers",
      },
      admin: { graphql: async () => new Response("{}", { status: 200 }) },
    }),
  },
  apiVersion: "2026-07",
}));

vi.mock("../../app/db.server", () => ({
  get default() {
    if (!db.prisma) {
      throw new Error("Test Prisma client was not initialized.");
    }
    return db.prisma;
  },
}));

describe("authenticated Admin route modules", () => {
  beforeAll(async () => {
    const { createMigratedTestDatabase } = await import("../helpers/test-db");
    db.prisma = createMigratedTestDatabase().prisma;
    await new ShopLifecycleService(db.prisma).ensureInstalled({
      shopDomain: SHOP_DOMAIN,
    });
  });

  afterAll(async () => {
    await db.prisma?.$disconnect();
  });

  it("loads Overview through the route loader after authentication", async () => {
    const { loader } = await import("../../app/routes/app._index");
    const data = await loader({
      request: new Request("https://segmentiva.test/app"),
    } as never);
    expect(data.error).toBeNull();
    expect(data.overview?.shopDomain).toBe(SHOP_DOMAIN);
    expect(data.overview?.processingEnabled).toBe(true);
  });

  it("loads Settings and rejects an unconfirmed seed through the route modules", async () => {
    const { loader, action } = await import("../../app/routes/app.settings");
    const loaded = await loader({
      request: new Request("https://segmentiva.test/app/settings"),
    } as never);
    expect(loaded.error).toBeNull();
    expect(loaded.shopDomain).toBe(SHOP_DOMAIN);

    const denied = await action({
      request: new Request("https://segmentiva.test/app/settings", {
        method: "POST",
        body: form({ intent: "import_pilot" }),
      }),
    } as never);
    expect(denied.seed?.ok).toBe(false);
    expect(denied.seed?.message).toBe("Confirm the import for this shop.");

    const imported = await action({
      request: new Request("https://segmentiva.test/app/settings", {
        method: "POST",
        body: form({ intent: "import_pilot", confirm: "yes" }),
      }),
    } as never);
    expect(imported.seed?.ok).toBe(true);
  });
});

function form(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}
