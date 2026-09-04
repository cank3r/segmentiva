import { parseArgs } from "node:util";

import db from "../app/db.server";
import { PilotSeedService } from "../app/services/pilot-seed/import";
import { normalizeShopDomain } from "../app/tenancy/shop-domain";

function printUsage(): void {
  console.error(
    [
      "Import a pilot questionnaire pack for one shop.",
      "Never runs on install. Disabled unless you pass --shop, --pack, and --confirm.",
      "",
      "Usage:",
      "  npm run seed:pilot -- --shop=<shop>.myshopify.com --pack=kliquea-pilot --confirm",
    ].join("\n"),
  );
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      shop: { type: "string" },
      pack: { type: "string" },
      confirm: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help || !values.shop || !values.pack) {
    printUsage();
    return values.help ? 0 : 1;
  }

  const shopDomain = normalizeShopDomain(values.shop);
  const service = new PilotSeedService(db);
  const result = await service.importPack({
    shop: { shopDomain },
    packId: values.pack,
    confirm: Boolean(values.confirm),
  });

  console.log(
    JSON.stringify({
      ok: true,
      shop: shopDomain,
      packId: result.packId,
      alreadyImported: result.alreadyImported,
      importedAt: result.importedAt,
    }),
  );
  return 0;
}

main()
  .then((code) => db.$disconnect().finally(() => process.exit(code)))
  .catch((error: unknown) => {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "SEED_FAILED";
    const message = error instanceof Error ? error.message : "Seed failed.";
    console.error(JSON.stringify({ ok: false, code, message }));
    return db.$disconnect().finally(() => process.exit(1));
  });
