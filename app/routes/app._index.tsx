import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import {
  type ChecklistItemStatus,
} from "../services/shop/overview";
import { loadOverviewPageData } from "../services/shop/overview-loader";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return loadOverviewPageData(db, session);
};

function statusTone(
  status: ChecklistItemStatus,
): "success" | "warning" | "info" {
  switch (status) {
    case "complete":
      return "success";
    case "blocked":
      return "warning";
    default:
      return "info";
  }
}

function statusLabel(status: ChecklistItemStatus): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "blocked":
      return "Blocked";
    case "later":
      return "Coming later";
    default:
      return "Pending";
  }
}

function questionnaireLabel(
  status: "not_started" | "pilot_imported" | "published",
): string {
  switch (status) {
    case "pilot_imported":
      return "Pilot imported";
    case "published":
      return "Published";
    default:
      return "Not started";
  }
}

export default function Overview() {
  const data = useLoaderData<typeof loader>();

  if (data.error || !data.overview) {
    return (
      <s-page heading="Overview">
        <s-banner tone="critical" heading="Couldn't load this page">
          {data.error?.message ?? "Something went wrong. Try again."}
        </s-banner>
      </s-page>
    );
  }

  const { overview } = data;

  return (
    <s-page heading="Overview">
      {!overview.processingEnabled ? (
        <s-banner tone="critical" heading="Processing stopped">
          Segmentiva is uninstalled for this shop. Application processing is
          stopped until the app is installed again. Merchant configuration is
          kept so a reinstall can reuse it.
        </s-banner>
      ) : null}

      <s-section heading="Installation">
        <s-paragraph>
          Current shop: {overview.shopDomain}
        </s-paragraph>
        <s-paragraph>
          Installation: {overview.installationLabel}
        </s-paragraph>
        <s-paragraph>
          Processing: {overview.processingEnabled ? "enabled" : "stopped"}
        </s-paragraph>
      </s-section>

      <s-section heading="Setup checklist">
        <s-unordered-list>
          {overview.checklist.map((item) => (
            <s-list-item key={item.id}>
              <s-stack direction="inline" gap="base">
                <s-badge tone={statusTone(item.status)}>
                  {statusLabel(item.status)}
                </s-badge>
                <s-text>
                  {item.label}. {item.detail}
                </s-text>
              </s-stack>
            </s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      <s-section heading="Status">
        <s-paragraph>
          Questionnaire: {questionnaireLabel(overview.questionnaireStatus)}
        </s-paragraph>
        <s-paragraph>
          Customer account extensions: not started. Preferences are collected
          after the customer&apos;s first authenticated account access, not
          inside Shopify&apos;s native sign-in form.
        </s-paragraph>
        <s-paragraph>
          Completed profiles: coming later
        </s-paragraph>
        <s-paragraph>
          Last synchronization errors: coming later
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Next step">
        <s-paragraph>
          Confirm the authenticated shop from Settings, then import the
          optional pilot questionnaire only if you intend to use it for this
          shop.
        </s-paragraph>
        <s-link href="/app/settings">Open settings</s-link>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
