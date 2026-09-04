import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import { ShopRepository } from "../repositories/shop-repository";
import { KLIQUEA_PILOT_PACK_ID } from "../services/pilot-seed/kliquea-pilot";
import { PilotSeedService } from "../services/pilot-seed/import";
import {
  parseGrantedScopes,
  runShopDiagnostic,
  type PublicDiagnosticResult,
} from "../services/shop/diagnostics";
import { ShopLifecycleService } from "../services/shop/lifecycle";
import { parseShopSettings } from "../services/shop/settings";
import { apiVersion, authenticate } from "../shopify.server";
import { verifiedShopFromSession } from "../tenancy/verified-shop";

type SettingsLoaderData = {
  shopDomain: string;
  installationState: string;
  processingEnabled: boolean;
  apiVersion: string;
  grantedScopes: string[];
  requestedScopes: string[];
  accountCompatibility: string;
  privacyEndpoints: Array<{ topic: string; status: string }>;
  retentionSummary: string;
  pilotSeedPack: string | null;
  pilotSeedImportedAt: string | null;
};

type SettingsActionData = {
  diagnostic?: PublicDiagnosticResult;
  seed?: {
    ok: boolean;
    message: string;
    alreadyImported?: boolean;
  };
};

export const loader = async ({
  request,
}: LoaderFunctionArgs): Promise<SettingsLoaderData> => {
  const { session } = await authenticate.admin(request);
  const shop = verifiedShopFromSession(session);
  const lifecycle = new ShopLifecycleService(db);
  const record = await lifecycle.loadOrCreateWithoutReinstall(shop);
  const settings = parseShopSettings(record.settings);

  return {
    shopDomain: shop.shopDomain,
    installationState: record.installationState,
    processingEnabled: lifecycle.canProcess(record),
    apiVersion,
    grantedScopes: parseGrantedScopes(session.scope),
    requestedScopes: parseGrantedScopes(process.env.SCOPES),
    accountCompatibility: "New customer accounts (classic accounts unsupported)",
    privacyEndpoints: [
      { topic: "customers/data_request", status: "Not implemented (Phase 5)" },
      { topic: "customers/redact", status: "Not implemented (Phase 5)" },
      { topic: "shop/redact", status: "Not implemented (Phase 5)" },
      { topic: "app/uninstalled", status: "Active" },
    ],
    retentionSummary:
      "Uninstall stops processing and deletes Shopify sessions for this shop. Merchant configuration is retained until the later shop/redact compliance workflow.",
    pilotSeedPack: settings.pilotSeed?.packId ?? null,
    pilotSeedImportedAt: settings.pilotSeed?.importedAt ?? null,
  };
};

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<SettingsActionData> => {
  const { session, admin } = await authenticate.admin(request);
  const shop = verifiedShopFromSession(session);
  const lifecycle = new ShopLifecycleService(db);
  const record = await lifecycle.loadOrCreateWithoutReinstall(shop);
  const shops = new ShopRepository(db);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "run_diagnostic") {
    const diagnostic = await runShopDiagnostic({
      shop,
      admin,
      grantedScopes: parseGrantedScopes(session.scope),
      processable: lifecycle.canProcess(record),
    });
    const currentSettings = parseShopSettings(record.settings);
    await shops.replaceSettings(shop, {
      ...currentSettings,
      lastDiagnostic: {
        status: diagnostic.status,
        ranAt: new Date().toISOString(),
      },
    });
    return { diagnostic };
  }

  if (intent === "import_pilot") {
    const confirmed = String(formData.get("confirm") ?? "") === "yes";
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
      return {
        seed: {
          ok: false,
          message: error instanceof Error ? error.message : "Import failed.",
        },
      };
    }
  }

  return {
    seed: { ok: false, message: "Unknown settings action." },
  };
};

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";
  const submittingIntent =
    navigation.formData?.get("intent")?.toString() ?? "";

  return (
    <s-page heading="Settings">
      {!data.processingEnabled ? (
        <s-banner tone="critical" heading="Processing stopped">
          This shop is uninstalled. Diagnostics that need the Admin API are
          unavailable until Segmentiva is installed again.
        </s-banner>
      ) : null}

      {actionData?.diagnostic ? (
        <s-banner
          tone={actionData.diagnostic.status === "ok" ? "success" : "warning"}
          heading="Diagnostic result"
        >
          {actionData.diagnostic.message} Verified shop:{" "}
          {actionData.diagnostic.verifiedShopDomain}.
        </s-banner>
      ) : null}

      {actionData?.seed ? (
        <s-banner
          tone={actionData.seed.ok ? "success" : "warning"}
          heading="Pilot import"
        >
          {actionData.seed.message}
        </s-banner>
      ) : null}

      <s-section heading="Account compatibility">
        <s-paragraph>{data.accountCompatibility}</s-paragraph>
        <s-paragraph>
          Preference collection happens after authenticated customer account
          access. Segmentiva does not replace Shopify login or intercept OTP
          codes.
        </s-paragraph>
      </s-section>

      <s-section heading="Shopify connection">
        <s-paragraph>Verified shop: {data.shopDomain}</s-paragraph>
        <s-paragraph>API version: {data.apiVersion}</s-paragraph>
        <s-paragraph>
          Requested scopes: {data.requestedScopes.join(", ") || "none"}
        </s-paragraph>
        <s-paragraph>
          Granted scopes: {data.grantedScopes.join(", ") || "none recorded"}
        </s-paragraph>
        <s-paragraph>Installation: {data.installationState}</s-paragraph>
      </s-section>

      <s-section heading="Diagnostic">
        <s-paragraph>
          Runs a harmless Admin GraphQL read of the current shop identity. It
          does not display access tokens, secrets, or customer data.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="run_diagnostic" />
          <s-button
            type="submit"
            variant="primary"
            disabled={submitting || !data.processingEnabled}
            loading={submitting && submittingIntent === "run_diagnostic"}
          >
            Run connection diagnostic
          </s-button>
        </Form>
        {actionData?.diagnostic ? (
          <s-box padding="base">
            <s-paragraph>
              Shop name: {actionData.diagnostic.shopName ?? "Unavailable"}
            </s-paragraph>
            <s-paragraph>
              myshopify domain:{" "}
              {actionData.diagnostic.myshopifyDomain ?? "Unavailable"}
            </s-paragraph>
            <s-paragraph>
              Plan: {actionData.diagnostic.planDisplayName ?? "Unavailable"}
            </s-paragraph>
            <s-paragraph>
              Partner development store:{" "}
              {actionData.diagnostic.partnerDevelopment == null
                ? "Unavailable"
                : actionData.diagnostic.partnerDevelopment
                  ? "yes"
                  : "no"}
            </s-paragraph>
          </s-box>
        ) : null}
      </s-section>

      <s-section heading="Privacy and retention">
        <s-unordered-list>
          {data.privacyEndpoints.map((endpoint) => (
            <s-list-item key={endpoint.topic}>
              {endpoint.topic}: {endpoint.status}
            </s-list-item>
          ))}
        </s-unordered-list>
        <s-paragraph>{data.retentionSummary}</s-paragraph>
      </s-section>

      <s-section heading="Pilot questionnaire import">
        <s-paragraph>
          The Kliquea pilot pack is optional configuration. It is not tied to a
          store domain and never runs on install. Import it only for the
          current authenticated shop.
        </s-paragraph>
        <s-paragraph>
          Current import:{" "}
          {data.pilotSeedPack
            ? `${data.pilotSeedPack} at ${data.pilotSeedImportedAt}`
            : "not imported"}
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="import_pilot" />
          <s-stack direction="block" gap="base">
            <label htmlFor="confirm-pilot-import">
              <input
                id="confirm-pilot-import"
                type="checkbox"
                name="confirm"
                value="yes"
              />{" "}
              I want to import the pilot questionnaire for this shop only.
            </label>
            <s-button
              type="submit"
              disabled={submitting || !data.processingEnabled}
              loading={submitting && submittingIntent === "import_pilot"}
            >
              Import pilot questionnaire
            </s-button>
          </s-stack>
        </Form>
        <s-paragraph>
          Operators can also run{" "}
          <s-text>
            npm run seed:pilot -- --shop=&lt;shop&gt;.myshopify.com
            --pack=kliquea-pilot --confirm
          </s-text>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
