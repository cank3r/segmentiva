import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const SHOP_DOMAIN = "shop-loader-failure.myshopify.com";

const db = vi.hoisted(() => ({
  prisma: null as PrismaClient | null,
}));

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: async () => ({
      session: { shop: SHOP_DOMAIN, scope: "read_customers" },
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

describe("authenticated Admin loaders after a database failure", () => {
  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    db.prisma = new PrismaClient({
      datasources: {
        db: {
          url: "file:/tmp/segmentiva-missing-db/route-loader-does-not-exist.sqlite",
        },
      },
    });
  });

  afterAll(async () => {
    await db.prisma?.$disconnect();
  });

  it("returns a generic Overview error without Prisma details", async () => {
    const { loader } = await import("../../app/routes/app._index");
    const data = await loader({
      request: new Request("https://segmentiva.test/app"),
    } as never);
    expect(data.error?.message).toBe("Something went wrong. Try again.");
    expect(data.overview).toBeNull();
    expect(JSON.stringify(data)).not.toMatch(/Prisma|P20\d{2}|sqlite|Timed out/i);
  });

  it("returns a generic Settings error without Prisma details", async () => {
    const { loader } = await import("../../app/routes/app.settings");
    const data = await loader({
      request: new Request("https://segmentiva.test/app/settings"),
    } as never);
    expect(data.error?.message).toBe("Something went wrong. Try again.");
    expect(data.shopDomain).toBe(SHOP_DOMAIN);
    expect(JSON.stringify(data)).not.toMatch(/Prisma|P20\d{2}|sqlite|Timed out/i);
  });
});
