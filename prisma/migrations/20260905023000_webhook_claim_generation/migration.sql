-- AlterTable
ALTER TABLE "ProcessedWebhook" ADD COLUMN "claimedInstallGeneration" INTEGER;
ALTER TABLE "ProcessedWebhook" ADD COLUMN "claimedTriggeredAt" DATETIME;
ALTER TABLE "ProcessedWebhook" ADD COLUMN "sessionFingerprints" TEXT;
