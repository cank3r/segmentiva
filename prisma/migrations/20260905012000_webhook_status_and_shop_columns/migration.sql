-- Recreate Shop without the settings JSON blob, adding dedicated columns
-- and installGeneration so diagnostic/seed writes cannot clobber each other
-- and uninstall/reinstall can use compare-and-set.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "installationState" TEXT NOT NULL,
    "installedAt" DATETIME NOT NULL,
    "uninstalledAt" DATETIME,
    "installGeneration" INTEGER NOT NULL DEFAULT 0,
    "defaultLocale" TEXT,
    "accountCompatibility" TEXT,
    "lastDiagnosticStatus" TEXT,
    "lastDiagnosticAt" DATETIME,
    "lastDiagnosticSummary" TEXT,
    "pilotSeedPackId" TEXT,
    "pilotSeedImportedAt" DATETIME,
    "pilotSeedVersion" TEXT,
    "pilotSeedStatus" TEXT,
    "pilotSeedDefinition" TEXT,
    "publishedQuestionnaireId" TEXT,
    "publishedVersion" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Shop" (
    "id",
    "shopDomain",
    "installationState",
    "installedAt",
    "uninstalledAt",
    "installGeneration",
    "defaultLocale",
    "accountCompatibility",
    "lastDiagnosticStatus",
    "lastDiagnosticAt",
    "lastDiagnosticSummary",
    "pilotSeedPackId",
    "pilotSeedImportedAt",
    "pilotSeedVersion",
    "pilotSeedStatus",
    "pilotSeedDefinition",
    "publishedQuestionnaireId",
    "publishedVersion",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "shopDomain",
    "installationState",
    "installedAt",
    "uninstalledAt",
    0,
    json_extract("settings", '$.defaultLocale'),
    json_extract("settings", '$.accountCompatibility'),
    json_extract("settings", '$.lastDiagnostic.status'),
    json_extract("settings", '$.lastDiagnostic.ranAt'),
    NULL,
    json_extract("settings", '$.pilotSeed.packId'),
    json_extract("settings", '$.pilotSeed.importedAt'),
    CASE
        WHEN json_extract("settings", '$.pilotSeed.packId') IS NOT NULL THEN '1.0.0'
        ELSE NULL
    END,
    CASE
        WHEN json_extract("settings", '$.pilotSeed.packId') IS NOT NULL THEN 'applied'
        ELSE NULL
    END,
    json_extract("settings", '$.pilotSeed.definition'),
    "publishedQuestionnaireId",
    "publishedVersion",
    "createdAt",
    "updatedAt"
FROM "Shop";

DROP TABLE "Shop";
ALTER TABLE "new_Shop" RENAME TO "Shop";
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- Existing webhook rows were recorded as finished deliveries under the old
-- claim-before-effects model. Mark them COMPLETED so retries stay no-ops.
CREATE TABLE "new_ProcessedWebhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_ProcessedWebhook" (
    "id",
    "shopDomain",
    "topic",
    "webhookId",
    "status",
    "claimedAt",
    "completedAt",
    "createdAt"
)
SELECT
    "id",
    "shopDomain",
    "topic",
    "webhookId",
    'COMPLETED',
    "processedAt",
    "processedAt",
    "processedAt"
FROM "ProcessedWebhook";

DROP TABLE "ProcessedWebhook";
ALTER TABLE "new_ProcessedWebhook" RENAME TO "ProcessedWebhook";
CREATE INDEX "ProcessedWebhook_shopDomain_idx" ON "ProcessedWebhook"("shopDomain");
CREATE UNIQUE INDEX "ProcessedWebhook_shopDomain_webhookId_key" ON "ProcessedWebhook"("shopDomain", "webhookId");

PRAGMA foreign_keys=ON;
