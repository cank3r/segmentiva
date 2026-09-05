import type { PrismaClient } from "@prisma/client";

import { ShopRepository } from "../../repositories/shop-repository";
import { KLIQUEA_PILOT_PACK_ID } from "../pilot-seed/kliquea-pilot";
import { PilotSeedService } from "../pilot-seed/import";
import {
  parseGrantedScopes,
  runShopDiagnostic,
  type PublicDiagnosticResult,
} from "./diagnostics";
import { ShopLifecycleService } from "./lifecycle";
import { toPublicSettingsError } from "./public-errors";
import { compareRequestedAndGrantedScopes } from "./scopes";
import { settingsFromShopRecord } from "./settings";
import type { AdminGraphqlClient } from "../shopify/admin-graphql";
import { verifiedShopFromSession } from "../../tenancy/verified-shop";
import { ApiVersion } from "@shopify/shopify-app-react-router/server";

export type SettingsLoaderData = {
  shopDomain: string;
  installationLabel: string;
  processingEnabled: boolean;
  apiVersion: string;
  grantedScopes: string[];
  requestedScopes: string[];
  missingScopes: Array<{ scope: string; label: string; impact: string }>;
  reauthorizeAction: string;
  accountCompatibility: string;
  privacyEndpoints: Array<{ topic: string; status: string }>;
  retentionSummary: string;
  pilotImported: boolean;
};

export type SettingsActionData = {
  diagnostic?: PublicDiagnosticResult;
  seed?: {
    ok: boolean;
    message: string;
    alreadyImported?: boolean;
    reset?: boolean;
  };
};

export async function loadSettingsPageData(
  db: PrismaClient,
  session: { shop: string; scope?: string | null },
): Promise<SettingsLoaderData> {
  const shop = verifiedShopFromSession(session);
  const lifecycle = new ShopLifecycleService(db);
  const record = await lifecycle.loadOrCreateWithoutReinstall(shop);
  const settings = settingsFromShopRecord(record);
  const grantedScopes = parseGrantedScopes(session.scope);
  const requestedScopes = parseGrantedScopes(process.env.SCOPES);
  const comparison = compareRequestedAndGrantedScopes(
    requestedScopes,
    grantedScopes,
  );

  return {
    shopDomain: shop.shopDomain,
    installationLabel:
      record.installationState === "INSTALLED" ? "Installed" : "Uninstalled",
    processingEnabled: lifecycle.canProcess(record),
    apiVersion: ApiVersion.July26,
    grantedScopes,
    requestedScopes,
    missingScopes: comparison.missing,
    reauthorizeAction: comparison.reauthorizeAction,
    accountCompatibility: "New customer accounts (classic accounts unsupported)",
    privacyEndpoints: [
      { topic: "Customer data request", status: "Coming later" },
      { topic: "Customer data deletion", status: "Coming later" },
      { topic: "Shop data deletion", status: "Coming later" },
      { topic: "App uninstall", status: "Active" },
    ],
    retentionSummary:
      "Uninstall stops processing and deletes Shopify sessions for this shop. Merchant configuration is retained until the later shop/redact compliance workflow.",
    pilotImported: settings.pilotSeed?.status === "applied",
  };
}

export async function handleSettingsAction(
  db: PrismaClient,
  input: {
    session: { shop: string; scope?: string | null };
    admin: AdminGraphqlClient;
    formData: FormData;
  },
): Promise<SettingsActionData> {
  const intent = String(input.formData.get("intent") ?? "");
  try {
    return await handleSettingsActionInner(db, input);
  } catch (error) {
    const publicError = toPublicSettingsError(error);
    if (intent === "run_diagnostic") {
      return {
        diagnostic: {
          status: "error",
          apiVersion: ApiVersion.July26,
          verifiedShopDomain: verifiedShopFromSession(input.session).shopDomain,
          shopName: null,
          myshopifyDomain: null,
          planDisplayName: null,
          partnerDevelopment: null,
          grantedScopes: parseGrantedScopes(input.session.scope),
          requestedScopes: parseGrantedScopes(process.env.SCOPES),
          scopeComparison: compareRequestedAndGrantedScopes(
            parseGrantedScopes(process.env.SCOPES),
            parseGrantedScopes(input.session.scope),
          ),
          identityMatchesSession: null,
          throttled: false,
          graphqlErrorCodes: [],
          message: publicError.message,
        },
      };
    }
    return {
      seed: {
        ok: false,
        message: publicError.message,
      },
    };
  }
}

async function handleSettingsActionInner(
  db: PrismaClient,
  input: {
    session: { shop: string; scope?: string | null };
    admin: AdminGraphqlClient;
    formData: FormData;
  },
): Promise<SettingsActionData> {
  const shop = verifiedShopFromSession(input.session);
  const lifecycle = new ShopLifecycleService(db);
  const record = await lifecycle.loadOrCreateWithoutReinstall(shop);
  const shops = new ShopRepository(db);
  const intent = String(input.formData.get("intent") ?? "");

  if (intent === "run_diagnostic") {
    const diagnostic = await runShopDiagnostic({
      shop,
      admin: input.admin,
      grantedScopes: parseGrantedScopes(input.session.scope),
      processable: lifecycle.canProcess(record),
    });
    await shops.updateDiagnostic(shop, {
      status: diagnostic.status,
      ranAt: new Date(),
      summary: {
        status: diagnostic.status,
        identityMatchesSession: diagnostic.identityMatchesSession,
      },
    });
    return { diagnostic };
  }

  if (intent === "import_pilot") {
    const confirmed = String(input.formData.get("confirm") ?? "") === "yes";
    try {
      const result = await new PilotSeedService(db).importPack({
        shop,
        packId: KLIQUEA_PILOT_PACK_ID,
        confirm: confirmed,
      });
      return {
        seed: {
          ok: true,
          alreadyImported: result.alreadyImported,
          message: result.alreadyImported
            ? "Pilot questionnaire was already imported for this shop."
            : "Pilot questionnaire imported for the current shop only.",
        },
      };
    } catch (error) {
      const publicError = toPublicSettingsError(error);
      return {
        seed: {
          ok: false,
          message: publicError.message,
        },
      };
    }
  }

  if (intent === "reset_pilot") {
    const confirmed = String(input.formData.get("confirm") ?? "") === "yes";
    try {
      await new PilotSeedService(db).resetPack({
        shop,
        packId: KLIQUEA_PILOT_PACK_ID,
        confirm: confirmed,
      });
      return {
        seed: {
          ok: true,
          reset: true,
          message: "Pilot questionnaire import was cleared for this shop. You can import it again.",
        },
      };
    } catch (error) {
      const publicError = toPublicSettingsError(error);
      return {
        seed: {
          ok: false,
          message: publicError.message,
        },
      };
    }
  }

  return {
    seed: { ok: false, message: "Unknown settings action." },
  };
}
