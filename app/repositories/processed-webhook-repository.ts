import type { PrismaClient } from "@prisma/client";

import type { VerifiedShopContext } from "../tenancy/verified-shop";
import { isPrismaUniqueConstraintError } from "./prisma-errors";

export class ProcessedWebhookRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Records a webhook delivery id for this shop. Returns false when this
   * delivery was already processed (idempotent replay).
   */
  async claim(
    shop: VerifiedShopContext,
    input: { topic: string; webhookId: string },
  ): Promise<boolean> {
    try {
      await this.db.processedWebhook.create({
        data: {
          shopDomain: shop.shopDomain,
          topic: input.topic,
          webhookId: input.webhookId,
        },
      });
      return true;
    } catch (error) {
      if (isPrismaUniqueConstraintError(error)) {
        return false;
      }
      throw error;
    }
  }
}
