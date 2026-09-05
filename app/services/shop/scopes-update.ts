import type { PrismaClient } from "@prisma/client";

import {
  fingerprintAccessToken,
  ProcessedWebhookRepository,
} from "../../repositories/processed-webhook-repository";
import { ShopLifecycleService } from "./lifecycle";
import type { VerifiedShopContext } from "../../tenancy/verified-shop";

export type ScopesUpdateFailurePoint = "after_claim" | "after_scope_write";

export type ScopesUpdateOptions = {
  failAt?: ScopesUpdateFailurePoint;
};

export class InjectedScopesUpdateFailure extends Error {
  readonly code = "INJECTED_SCOPES_UPDATE_FAILURE";
  readonly point: ScopesUpdateFailurePoint;

  constructor(point: ScopesUpdateFailurePoint) {
    super(`Injected scopes update failure at ${point}.`);
    this.name = "InjectedScopesUpdateFailure";
    this.point = point;
  }
}

export type ScopesUpdateResult = {
  alreadyProcessed: boolean;
  applied: boolean;
};

export class ScopesUpdateService {
  private readonly webhooks: ProcessedWebhookRepository;
  private readonly lifecycle: ShopLifecycleService;

  constructor(private readonly db: PrismaClient) {
    this.webhooks = new ProcessedWebhookRepository(db);
    this.lifecycle = new ShopLifecycleService(db);
  }

  async handleAppScopesUpdate(
    shop: VerifiedShopContext,
    input: {
      topic: string;
      webhookId: string;
      sessionId?: string;
      scope?: string;
    },
    options: ScopesUpdateOptions = {},
  ): Promise<ScopesUpdateResult> {
    const claimed = await this.webhooks.claim(shop, {
      topic: input.topic,
      webhookId: input.webhookId,
    });

    if (claimed.kind === "duplicate") {
      return { alreadyProcessed: true, applied: false };
    }

    if (claimed.kind === "process") {
      const current = await this.lifecycle.load(shop);
      const session = input.sessionId
        ? await this.db.session.findFirst({
            where: { id: input.sessionId, shop: shop.shopDomain },
            select: { id: true, accessToken: true },
          })
        : null;
      await this.webhooks.attachClaimContext(shop, input.webhookId, {
        claimedInstallGeneration: current?.installGeneration ?? 0,
        claimedTriggeredAt: null,
        sessionFingerprints: session
          ? [
              {
                id: session.id,
                fingerprint: fingerprintAccessToken(session.accessToken),
              },
            ]
          : [],
      });
    }

    if (options.failAt === "after_claim") {
      throw new InjectedScopesUpdateFailure("after_claim");
    }

    const claimContext = await this.webhooks.getClaimContext(
      shop,
      input.webhookId,
    );
    const record = await this.lifecycle.load(shop);
    const generationMatches =
      claimContext.claimedInstallGeneration == null ||
      record?.installGeneration === claimContext.claimedInstallGeneration;
    let applied = false;
    if (
      this.lifecycle.canProcess(record) &&
      generationMatches &&
      input.sessionId &&
      input.scope
    ) {
      const session = await this.db.session.findFirst({
        where: { id: input.sessionId, shop: shop.shopDomain },
        select: { id: true, accessToken: true },
      });
      const expected = claimContext.sessionFingerprints.find(
        (entry) => entry.id === input.sessionId,
      );
      const tokenMatches =
        session != null &&
        expected != null &&
        fingerprintAccessToken(session.accessToken) === expected.fingerprint;
      if (tokenMatches) {
        const updated = await this.db.session.updateMany({
          where: {
            id: input.sessionId,
            shop: shop.shopDomain,
            accessToken: session.accessToken,
          },
          data: { scope: input.scope },
        });
        applied = updated.count > 0;
      }
    }

    if (options.failAt === "after_scope_write") {
      throw new InjectedScopesUpdateFailure("after_scope_write");
    }

    await this.webhooks.complete(shop, input.webhookId);
    return { alreadyProcessed: false, applied };
  }
}
