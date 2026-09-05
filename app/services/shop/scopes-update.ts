import type { PrismaClient } from "@prisma/client";

import { ProcessedWebhookRepository } from "../../repositories/processed-webhook-repository";
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

    if (options.failAt === "after_claim") {
      throw new InjectedScopesUpdateFailure("after_claim");
    }

    const record = await this.lifecycle.load(shop);
    let applied = false;
    if (this.lifecycle.canProcess(record) && input.sessionId && input.scope) {
      await this.db.session.update({
        where: { id: input.sessionId },
        data: { scope: input.scope },
      });
      applied = true;
    }

    if (options.failAt === "after_scope_write") {
      throw new InjectedScopesUpdateFailure("after_scope_write");
    }

    await this.webhooks.complete(shop, input.webhookId);
    return { alreadyProcessed: false, applied };
  }
}
