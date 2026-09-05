import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useState } from "react";

import db from "../db.server";
import {
  handleSettingsAction,
  loadSettingsPageData,
} from "../services/shop/settings-page";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return loadSettingsPageData(db, session);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  return handleSettingsAction(db, { session, admin, formData });
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
          This shop is uninstalled. Connection checks are unavailable until
          Segmentiva is installed again.
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
          Requested permissions: {data.requestedScopes.join(", ") || "none"}
        </s-paragraph>
        <s-paragraph>
          Granted permissions: {data.grantedScopes.join(", ") || "none recorded"}
        </s-paragraph>
        {data.missingScopes.length > 0 ? (
          <s-box padding="base">
            <s-paragraph>Missing permissions:</s-paragraph>
            <s-unordered-list>
              {data.missingScopes.map((scope) => (
                <s-list-item key={scope.scope}>
                  {scope.label}: {scope.impact}
                </s-list-item>
              ))}
            </s-unordered-list>
            <s-paragraph>{data.reauthorizeAction}</s-paragraph>
          </s-box>
        ) : (
          <s-paragraph>{data.reauthorizeAction}</s-paragraph>
        )}
        <s-paragraph>Installation: {data.installationLabel}</s-paragraph>
      </s-section>

      <s-section heading="Diagnostic">
        <s-paragraph>
          Runs a harmless connection check of the current shop identity. It
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
        {actionData?.diagnostic?.identityMatchesSession ? (
          <s-box padding="base">
            <s-paragraph>
              Shop name: {actionData.diagnostic.shopName ?? "Unavailable"}
            </s-paragraph>
            <s-paragraph>
              Shopify domain:{" "}
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
          The optional pilot questionnaire is merchant configuration. It is not
          tied to a store domain and never runs on install. Import it only for
          the current authenticated shop.
        </s-paragraph>
        <s-paragraph>
          Current import: {data.pilotImported ? "Imported for this shop" : "Not imported"}
        </s-paragraph>
        <PilotConfirmForm
          key={data.pilotImported ? "import-applied" : "import-empty"}
          intent="import_pilot"
          checkboxLabel="I want to import the pilot questionnaire for this shop only."
          buttonLabel="Import pilot questionnaire"
          disabled={submitting || !data.processingEnabled}
          loading={submitting && submittingIntent === "import_pilot"}
        />
        {data.pilotImported ? (
          <PilotConfirmForm
            key="reset-applied"
            intent="reset_pilot"
            checkboxLabel="I want to clear the pilot questionnaire import for this shop."
            buttonLabel="Clear pilot import"
            tone="critical"
            disabled={submitting || !data.processingEnabled}
            loading={submitting && submittingIntent === "reset_pilot"}
          />
        ) : null}
      </s-section>
    </s-page>
  );
}

function PilotConfirmForm(props: {
  intent: "import_pilot" | "reset_pilot";
  checkboxLabel: string;
  buttonLabel: string;
  disabled: boolean;
  loading: boolean;
  tone?: "critical";
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Form method="post">
      <input type="hidden" name="intent" value={props.intent} />
      <s-stack direction="block" gap="base">
        <s-checkbox
          name="confirm"
          value="yes"
          checked={confirmed}
          onChange={(event) => {
            const target = event.currentTarget as unknown as {
              checked?: boolean;
            };
            setConfirmed(Boolean(target.checked));
          }}
          label={props.checkboxLabel}
        />
        <s-button
          type="submit"
          tone={props.tone}
          disabled={props.disabled || !confirmed}
          loading={props.loading}
        >
          {props.buttonLabel}
        </s-button>
      </s-stack>
    </Form>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
