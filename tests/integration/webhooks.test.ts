import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { afterAll, describe, expect, it, vi } from "vitest";

import { processAppUninstalledRequest } from "../../app/webhooks/app-uninstalled";
import { processAppScopesUpdateRequest } from "../../app/webhooks/app-scopes-update";
import { ShopLifecycleService } from "../../app/services/shop/lifecycle";
import { authenticateShopifyWebhook } from "../../app/webhooks/authenticate-webhook";
import {
  createMigratedTestDatabase,
  insertOfflineSession,
  uniqueShop,
} from "../helpers/test-db";
import {
  createShopifyWebhookRequest,
  TEST_API_KEY,
  TEST_WEBHOOK_SECRET,
} from "../helpers/webhook-request";

describe("webhook routes", () => {
  const { prisma } = createMigratedTestDatabase();
  const shopify = shopifyApp({
    apiKey: TEST_API_KEY,
    apiSecretKey: TEST_WEBHOOK_SECRET,
    apiVersion: ApiVersion.July26,
    scopes: ["read_customers", "write_customers"],
    appUrl: "https://segmentiva.test",
    authPathPrefix: "/auth",
    sessionStorage: new PrismaSessionStorage(prisma),
    distribution: AppDistribution.AppStore,
    future: { expiringOfflineAccessTokens: true },
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects APP_UNINSTALLED with an invalid HMAC", async () => {
    const shopDomain = uniqueShop("hmac-invalid");
    const request = createShopifyWebhookRequest({
      shop: shopDomain,
      topic: "app/uninstalled",
      webhookId: "wh-invalid",
      hmac: "definitely-not-valid",
    });

    await expect(
      processAppUninstalledRequest(request, {
        authenticate: shopify.authenticate,
        db: prisma,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("completes APP_UNINSTALLED when the offline token is expired and refresh is revoked", async () => {
    const shopDomain = uniqueShop("expired-offline");
    const lifecycle = new ShopLifecycleService(prisma);
    await lifecycle.ensureInstalled({ shopDomain });
    const expired = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.session.create({
      data: {
        id: `offline_${shopDomain}`,
        shop: shopDomain,
        state: "offline",
        isOnline: false,
        accessToken: "expired-offline-token",
        refreshToken: "revoked-refresh-token",
        expires: expired,
        refreshTokenExpires: expired,
        scope: "read_customers,write_customers",
      },
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/admin/oauth/access_token")) {
        return new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch in webhook test: ${url}`);
    });

    try {
      const request = createShopifyWebhookRequest({
        shop: shopDomain,
        topic: "app/uninstalled",
        webhookId: `wh-${shopDomain}`,
        triggeredAt: new Date().toISOString(),
      });
      const response = await processAppUninstalledRequest(request, {
        authenticate: shopify.authenticate,
        db: prisma,
      });
      expect(response.status).toBe(200);
    } finally {
      fetchMock.mockRestore();
    }

    const shop = await prisma.shop.findUniqueOrThrow({
      where: { shopDomain },
    });
    expect(shop.installationState).toBe("UNINSTALLED");
    expect(await prisma.session.count({ where: { shop: shopDomain } })).toBe(0);
  });

  it("applies APP_SCOPES_UPDATE through the real webhook route after official auth", async () => {
    const shopDomain = uniqueShop("scopes-route");
    await new ShopLifecycleService(prisma).ensureInstalled({ shopDomain });
    const sessionId = `offline_${shopDomain}`;
    await insertOfflineSession(prisma, shopDomain, sessionId);
    await prisma.session.update({
      where: { id: sessionId },
      data: { scope: "read_customers" },
    });

    const request = createShopifyWebhookRequest({
      shop: shopDomain,
      topic: "app/scopes_update",
      webhookId: `wh-${shopDomain}-scopes`,
      body: JSON.stringify({ current: ["read_customers", "write_customers"] }),
    });

    const response = await processAppScopesUpdateRequest(request, {
      authenticate: shopify.authenticate,
      db: prisma,
    });
    expect(response.status).toBe(200);
    const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.scope).toBe("read_customers,write_customers");
  });

  it("does not recover non-uninstall topics from a 500 after official auth", async () => {
    const request = createShopifyWebhookRequest({
      shop: uniqueShop("no-recover"),
      topic: "app/scopes_update",
      webhookId: "wh-500",
    });
    await expect(
      authenticateShopifyWebhook(request, {
        webhook: async () => {
          throw new Response(undefined, { status: 500 });
        },
      }),
    ).rejects.toMatchObject({ status: 500 });
  });
});
