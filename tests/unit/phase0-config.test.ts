import { readFileSync } from "node:fs";
import { join } from "node:path";

// Import ApiVersion from the same package the app compiles against
// (app/shopify.server.ts and .graphqlrc.ts), not the transitive @shopify/shopify-api.
import { ApiVersion } from "@shopify/shopify-app-react-router/server";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function tomlString(source: string, key: string): string {
  const match = source.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`));
  if (!match) {
    throw new Error(`Could not find \`${key}\` in shopify.app.toml`);
  }
  return match[1];
}

function parseScopeList(raw: string): string[] {
  return raw
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
    .sort();
}

const EXPECTED_API_VERSION = "2026-07";
const EXPECTED_SCOPES = ["read_customers", "write_customers"];

describe("Phase 0 Shopify configuration", () => {
  const appToml = read("shopify.app.toml");
  const envExample = read(".env.example");

  it("pins the stable Shopify Admin API version to 2026-07 in shopify.app.toml", () => {
    expect(tomlString(appToml, "api_version")).toBe(EXPECTED_API_VERSION);
  });

  it("uses the ApiVersion enum member that maps to 2026-07 in server and codegen config", () => {
    // Guards against the enum name drifting away from the pinned version string.
    expect(ApiVersion.July26).toBe(EXPECTED_API_VERSION);

    const shopifyServer = read("app/shopify.server.ts");
    const graphqlrc = read(".graphqlrc.ts");

    expect(shopifyServer).toContain("ApiVersion.July26");
    expect(graphqlrc).toContain("ApiVersion.July26");
    // The template default must not linger anywhere in the pinned surfaces.
    expect(shopifyServer).not.toContain("October25");
    expect(graphqlrc).not.toContain("October25");
  });

  it("requests exactly the Segmentiva MVP minimum customer scopes", () => {
    expect(parseScopeList(tomlString(appToml, "scopes"))).toEqual(
      EXPECTED_SCOPES,
    );
  });

  it("does not request any product scopes", () => {
    const scopes = parseScopeList(tomlString(appToml, "scopes"));
    expect(scopes.some((scope) => scope.includes("products"))).toBe(false);
  });

  it("keeps .env.example SCOPES in sync with shopify.app.toml", () => {
    const envMatch = envExample.match(/^SCOPES=(.*)$/m);
    expect(envMatch, "SCOPES entry missing from .env.example").not.toBeNull();

    const envScopes = parseScopeList(envMatch![1]);
    const tomlScopes = parseScopeList(tomlString(appToml, "scopes"));
    expect(envScopes).toEqual(tomlScopes);
  });

  it("records the Prisma migration lock provider matching the schema datasource", () => {
    const schema = read("prisma/schema.prisma");
    const lock = read("prisma/migrations/migration_lock.toml");

    const schemaProvider = schema.match(/datasource\s+db\s*{[^}]*?provider\s*=\s*"([^"]+)"/s);
    const lockProvider = lock.match(/provider\s*=\s*"([^"]+)"/);

    expect(schemaProvider, "datasource provider missing from schema").not.toBeNull();
    expect(lockProvider, "provider missing from migration_lock.toml").not.toBeNull();
    expect(lockProvider![1]).toBe(schemaProvider![1]);
  });

  it("ships no leftover template placeholder copy on the public landing page", () => {
    const landing = read("app/routes/_index/route.tsx");
    expect(landing).not.toContain("[your app]");
    expect(landing).not.toContain("Product feature");
  });
});
