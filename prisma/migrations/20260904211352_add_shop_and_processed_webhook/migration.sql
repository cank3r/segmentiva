-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "installationState" TEXT NOT NULL,
    "installedAt" DATETIME NOT NULL,
    "uninstalledAt" DATETIME,
    -- Json is stored as TEXT on SQLite; PostgreSQL uses JSONB for the same Prisma field.
    "settings" TEXT NOT NULL DEFAULT '{}',
    "publishedQuestionnaireId" TEXT,
    "publishedVersion" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopDomain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "ProcessedWebhook_shopDomain_idx" ON "ProcessedWebhook"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedWebhook_shopDomain_webhookId_key" ON "ProcessedWebhook"("shopDomain", "webhookId");
