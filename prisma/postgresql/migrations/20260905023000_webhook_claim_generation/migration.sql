-- AlterTable
ALTER TABLE "ProcessedWebhook" ADD COLUMN "claimedInstallGeneration" INTEGER;
ALTER TABLE "ProcessedWebhook" ADD COLUMN "claimedTriggeredAt" TIMESTAMP(3);
ALTER TABLE "ProcessedWebhook" ADD COLUMN "sessionFingerprints" JSONB;
