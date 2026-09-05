import { afterAll, describe, expect, it } from "vitest";

import { ShopLifecycleService } from "../../app/services/shop/lifecycle";
import { createMigratedTestDatabase } from "../helpers/test-db";

describe("clean database migrations", () => {
  it("applies Prisma migrations to an empty SQLite database and can insert a Shop", async () => {
    const { prisma, databaseUrl } = createMigratedTestDatabase();
    expect(databaseUrl.startsWith("file:")).toBe(true);

    const lifecycle = new ShopLifecycleService(prisma);
    const shop = await lifecycle.ensureInstalled({
      shopDomain: "fresh-shop.myshopify.com",
    });

    expect(shop.installationState).toBe("INSTALLED");
    expect(shop.shopDomain).toBe("fresh-shop.myshopify.com");
    expect(shop).not.toHaveProperty("accessToken");

    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    );
    const names = tables.map((table) => table.name);
    expect(names).toContain("Shop");
    expect(names).toContain("Session");
    expect(names).toContain("ProcessedWebhook");

    const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA table_info("Shop")`,
    );
    const columnNames = columns.map((column) => column.name);
    expect(columnNames).toContain("installGeneration");
    expect(columnNames).toContain("pilotSeedPackId");
    const webhookColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `PRAGMA table_info("ProcessedWebhook")`,
    );
    const webhookColumnNames = webhookColumns.map((column) => column.name);
    expect(webhookColumnNames).toContain("status");
    expect(webhookColumnNames).toContain("claimedInstallGeneration");
    expect(webhookColumnNames).toContain("claimedTriggeredAt");
    expect(webhookColumnNames).toContain("sessionFingerprints");

    await prisma.$disconnect();
  });

  afterAll(() => {
    // Temporary sqlite files live in os.tmpdir() and are not committed.
  });
});
