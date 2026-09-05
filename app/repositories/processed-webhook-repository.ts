import { createHash } from "node:crypto";

import type { Prisma, PrismaClient, WebhookDeliveryStatus } from "@prisma/client";

import type { VerifiedShopContext } from "../tenancy/verified-shop";
import { isPrismaUniqueConstraintError } from "./prisma-errors";

export type WebhookClaimResult =
  | { kind: "process" }
  | { kind: "resume" }
  | { kind: "duplicate" };

export type SessionFingerprint = {
  id: string;
  fingerprint: string;
};

export function fingerprintAccessToken(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex");
}

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

  async attachClaimContext(
    shop: VerifiedShopContext,
    webhookId: string,
    input: {
      claimedInstallGeneration: number | null;
      claimedTriggeredAt: Date | null;
      sessionFingerprints: SessionFingerprint[];
    },
  ): Promise<void> {
    await this.db.processedWebhook.updateMany({
      where: {
        shopDomain: shop.shopDomain,
        webhookId,
        claimedInstallGeneration: null,
      },
      data: {
        claimedInstallGeneration: input.claimedInstallGeneration,
        claimedTriggeredAt: input.claimedTriggeredAt,
        sessionFingerprints: input.sessionFingerprints as Prisma.InputJsonValue,
      },
    });
  }

  async getClaimContext(
    shop: VerifiedShopContext,
    webhookId: string,
  ): Promise<{
    claimedInstallGeneration: number | null;
    claimedTriggeredAt: Date | null;
    sessionFingerprints: SessionFingerprint[];
  }> {
    const row = await this.db.processedWebhook.findUnique({
      where: {
        shopDomain_webhookId: {
          shopDomain: shop.shopDomain,
          webhookId,
        },
      },
      select: {
        claimedInstallGeneration: true,
        claimedTriggeredAt: true,
        sessionFingerprints: true,
      },
    });
    return {
      claimedInstallGeneration: row?.claimedInstallGeneration ?? null,
      claimedTriggeredAt: row?.claimedTriggeredAt ?? null,
      sessionFingerprints: parseFingerprints(row?.sessionFingerprints),
    };
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

function parseFingerprints(value: unknown): SessionFingerprint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as SessionFingerprint).id === "string" &&
      typeof (entry as SessionFingerprint).fingerprint === "string"
    ) {
      return [
        {
          id: (entry as SessionFingerprint).id,
          fingerprint: (entry as SessionFingerprint).fingerprint,
        },
      ];
    }
    return [];
  });
}
