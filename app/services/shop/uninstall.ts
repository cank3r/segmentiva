import type { PrismaClient } from "@prisma/client";

import {
  fingerprintAccessToken,
  ProcessedWebhookRepository,
} from "../../repositories/processed-webhook-repository";
import {
  ShopRepository,
  type RepositoryHooks,
} from "../../repositories/shop-repository";
import type { VerifiedShopContext } from "../../tenancy/verified-shop";
import { ShopLifecycleService } from "./lifecycle";

export type UninstallResult = {
  alreadyProcessed: boolean;
  processingStopped: boolean;
  ignoredAsStale: boolean;
};

export type UninstallFailurePoint =
  | "after_claim"
  | "after_state_change"
  | "during_session_delete";

export type UninstallOptions = {
  failAt?: UninstallFailurePoint;
  hooks?: RepositoryHooks;
};

export class InjectedUninstallFailure extends Error {
  readonly code = "INJECTED_UNINSTALL_FAILURE";
  readonly point: UninstallFailurePoint;

  constructor(point: UninstallFailurePoint) {
    super(`Injected uninstall failure at ${point}.`);
    this.name = "InjectedUninstallFailure";
    this.point = point;
  }
}

export class UninstallService {
  private readonly lifecycle: ShopLifecycleService;
  private readonly webhooks: ProcessedWebhookRepository;
  private readonly shops: ShopRepository;

  constructor(
    private readonly db: PrismaClient,
    private readonly hooks: RepositoryHooks = {},
  ) {
    this.lifecycle = new ShopLifecycleService(db, hooks);
    this.webhooks = new ProcessedWebhookRepository(db);
    this.shops = new ShopRepository(db, hooks);
  }

  async handleAppUninstalled(
    shop: VerifiedShopContext,
    webhook: { topic: string; webhookId: string; triggeredAt?: string },
    options: UninstallOptions = {},
  ): Promise<UninstallResult> {
    const claimed = await this.webhooks.claim(shop, webhook);

    if (claimed.kind === "duplicate") {
      const existing = await this.lifecycle.load(shop);
      return {
        alreadyProcessed: true,
        processingStopped: !this.lifecycle.canProcess(existing),
        ignoredAsStale: false,
      };
    }

    if (claimed.kind === "process") {
      const current = await this.lifecycle.load(shop);
      const sessions = await this.shops.snapshotSessions(shop);
      await this.webhooks.attachClaimContext(shop, webhook.webhookId, {
        claimedInstallGeneration: current?.installGeneration ?? 0,
        claimedTriggeredAt: parseClaimTriggeredAt(webhook.triggeredAt),
        sessionFingerprints: sessions.map((session) => ({
          id: session.id,
          fingerprint: fingerprintAccessToken(session.accessToken),
        })),
      });
    }

    if (options.failAt === "after_claim") {
      throw new InjectedUninstallFailure("after_claim");
    }

    const claimContext = await this.webhooks.getClaimContext(
      shop,
      webhook.webhookId,
    );
    const transition = await this.shops.applyUninstallIfCurrent(shop, {
      triggeredAt:
        webhook.triggeredAt ?? claimContext.claimedTriggeredAt?.toISOString(),
      claimedInstallGeneration: claimContext.claimedInstallGeneration,
    });

    if (options.failAt === "after_state_change") {
      throw new InjectedUninstallFailure("after_state_change");
    }

    const latestAfterTransition = await this.lifecycle.load(shop);
    const shouldDeleteSessions =
      latestAfterTransition?.installationState === "UNINSTALLED" &&
      !transition.ignoredAsStale;

    if (shouldDeleteSessions) {
      const deleteHooks: RepositoryHooks = {
        ...this.hooks,
        failDuringSessionDelete:
          options.failAt === "during_session_delete"
            ? async () => {
                throw new InjectedUninstallFailure("during_session_delete");
              }
            : this.hooks.failDuringSessionDelete,
      };
      const deleting = new ShopRepository(this.db, deleteHooks);
      await deleting.deleteSessionsMatchingFingerprints(
        shop,
        claimContext.sessionFingerprints,
      );
    }

    await this.webhooks.complete(shop, webhook.webhookId);

    const latest = await this.lifecycle.load(shop);
    return {
      alreadyProcessed: false,
      processingStopped: !this.lifecycle.canProcess(latest),
      ignoredAsStale: transition.ignoredAsStale,
    };
  }
}

function parseClaimTriggeredAt(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}
