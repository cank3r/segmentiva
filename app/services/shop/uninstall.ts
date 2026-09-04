import type { PrismaClient } from "@prisma/client";

import { ProcessedWebhookRepository } from "../../repositories/processed-webhook-repository";
import type { VerifiedShopContext } from "../../tenancy/verified-shop";
import { ShopLifecycleService } from "./lifecycle";

export type UninstallResult = {
  alreadyProcessed: boolean;
  processingStopped: boolean;
  ignoredAsStale: boolean;
};

function isStaleUninstall(triggeredAt: string, installedAt: Date): boolean {
  const triggeredMs = Date.parse(triggeredAt);
  return !Number.isNaN(triggeredMs) && triggeredMs < installedAt.getTime();
}

export class UninstallService {
  private readonly lifecycle: ShopLifecycleService;
  private readonly webhooks: ProcessedWebhookRepository;

  constructor(private readonly db: PrismaClient) {
    this.lifecycle = new ShopLifecycleService(db);
    this.webhooks = new ProcessedWebhookRepository(db);
  }

  async handleAppUninstalled(
    shop: VerifiedShopContext,
    webhook: { topic: string; webhookId: string; triggeredAt?: string },
  ): Promise<UninstallResult> {
    const claimed = await this.webhooks.claim(shop, webhook);
    const existing = await this.lifecycle.load(shop);

    if (
      existing?.installationState === "INSTALLED" &&
      webhook.triggeredAt &&
      isStaleUninstall(webhook.triggeredAt, existing.installedAt)
    ) {
      return {
        alreadyProcessed: !claimed,
        processingStopped: false,
        ignoredAsStale: true,
      };
    }

    await this.lifecycle.markUninstalled(shop);
    await this.db.session.deleteMany({ where: { shop: shop.shopDomain } });

    return {
      alreadyProcessed: !claimed,
      processingStopped: true,
      ignoredAsStale: false,
    };
  }
}
