-- CreateEnum
CREATE TYPE "ShopInstallationState" AS ENUM ('INSTALLED', 'UNINSTALLED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "installationState" "ShopInstallationState" NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL,
    "uninstalledAt" TIMESTAMP(3),
    "installGeneration" INTEGER NOT NULL DEFAULT 0,
    "defaultLocale" TEXT,
    "accountCompatibility" TEXT,
    "lastDiagnosticStatus" TEXT,
    "lastDiagnosticAt" TIMESTAMP(3),
    "lastDiagnosticSummary" JSONB,
    "pilotSeedPackId" TEXT,
    "pilotSeedImportedAt" TIMESTAMP(3),
    "pilotSeedVersion" TEXT,
    "pilotSeedStatus" TEXT,
    "pilotSeedDefinition" JSONB,
    "publishedQuestionnaireId" TEXT,
    "publishedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "ProcessedWebhook_shopDomain_idx" ON "ProcessedWebhook"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedWebhook_shopDomain_webhookId_key" ON "ProcessedWebhook"("shopDomain", "webhookId");
