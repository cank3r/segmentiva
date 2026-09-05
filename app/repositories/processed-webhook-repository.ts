import type { PrismaClient, WebhookDeliveryStatus } from "@prisma/client";

import type { VerifiedShopContext } from "../tenancy/verified-shop";
import { isPrismaUniqueConstraintError } from "./prisma-errors";

export type WebhookClaimResult =
  | { kind: "process" }
  | { kind: "resume" }
  | { kind: "duplicate" };

export class ProcessedWebhookRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Claims a webhook delivery id for this shop.
   * Only COMPLETED deliveries are duplicates. PENDING rows are resumed.
   */
  async claim(
    shop: VerifiedShopContext,
    input: { topic: string; webhookId: string },
  ): Promise<WebhookClaimResult> {
    try {
      await this.db.processedWebhook.create({
        data: {
          shopDomain: shop.shopDomain,
          topic: input.topic,
          webhookId: input.webhookId,
          status: "PENDING",
        },
      });
      return { kind: "process" };
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await this.db.processedWebhook.findUnique({
        where: {
          shopDomain_webhookId: {
            shopDomain: shop.shopDomain,
            webhookId: input.webhookId,
          },
        },
      });

      if (existing?.status === ("COMPLETED" satisfies WebhookDeliveryStatus)) {
        return { kind: "duplicate" };
      }
      return { kind: "resume" };
    }
  }

  async complete(
    shop: VerifiedShopContext,
    webhookId: string,
  ): Promise<void> {
    await this.db.processedWebhook.update({
      where: {
        shopDomain_webhookId: {
          shopDomain: shop.shopDomain,
          webhookId,
        },
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
  }

  async getStatus(
    shop: VerifiedShopContext,
    webhookId: string,
  ): Promise<WebhookDeliveryStatus | null> {
    const row = await this.db.processedWebhook.findUnique({
      where: {
        shopDomain_webhookId: {
          shopDomain: shop.shopDomain,
          webhookId,
        },
      },
      select: { status: true },
    });
    return row?.status ?? null;
  }
}
