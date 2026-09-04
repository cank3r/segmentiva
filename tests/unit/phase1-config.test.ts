import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Phase 1 configuration guards", () => {
  it("documents DATABASE_URL for local SQLite and PostgreSQL-ready shared environments", () => {
    const envExample = read(".env.example");
    expect(envExample).toMatch(/^DATABASE_URL=file:dev\.sqlite$/m);
    expect(envExample).toContain("postgresql://");

    const schema = read("prisma/schema.prisma");
    expect(schema).toContain('url      = env("DATABASE_URL")');
    expect(schema).toContain("model Shop");
    expect(schema).toContain("model Session");
    expect(schema).toContain("model ProcessedWebhook");
  });

  it("does not auto-import the pilot questionnaire during afterAuth", () => {
    const shopifyServer = read("app/shopify.server.ts");
    expect(shopifyServer).toContain("afterAuth");
    expect(shopifyServer).toContain("ensureInstalled");
    expect(shopifyServer).not.toContain("PilotSeedService");
    expect(shopifyServer).not.toContain("kliquea-pilot");
  });

  it("keeps Admin loaders from reinstalling an uninstalled shop", () => {
    const overview = read("app/routes/app._index.tsx");
    const settings = read("app/routes/app.settings.tsx");
    expect(overview).toContain("loadOrCreateWithoutReinstall");
    expect(settings).toContain("loadOrCreateWithoutReinstall");
    expect(overview).not.toContain("ensureInstalled");
    expect(settings).not.toContain("ensureInstalled");
  });

  it("uses the current ShopPlan publicDisplayName field in the diagnostic query", () => {
    const diagnostics = read("app/services/shop/diagnostics.ts");
    expect(diagnostics).toContain("publicDisplayName");
    expect(diagnostics).not.toContain("plan.displayName");
    expect(diagnostics).not.toMatch(/plan \{\s*displayName/);
  });

  it("does not hard-code a Kliquea shop domain or production host", () => {
    const pack = read("app/services/pilot-seed/kliquea-pilot.ts");
    const importer = read("app/services/pilot-seed/import.ts");
    const cli = read("scripts/seed-pilot.ts");

    for (const source of [pack, importer, cli]) {
      expect(source).not.toMatch(/kliquea\.myshopify\.com/i);
      expect(source).not.toMatch(/kliquea\.com/i);
    }
  });
});
