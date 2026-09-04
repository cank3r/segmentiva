import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import db from "../db.server";
import {
  buildOverviewSnapshot,
  type ChecklistItemStatus,
} from "../services/shop/overview";
import { ShopLifecycleService } from "../services/shop/lifecycle";
import { authenticate } from "../shopify.server";
import { verifiedShopFromSession } from "../tenancy/verified-shop";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = verifiedShopFromSession(session);
  const lifecycle = new ShopLifecycleService(db);
  const record = await lifecycle.ensureInstalled(shop);

  return {
    overview: buildOverviewSnapshot(
      shop.shopDomain,
      record,
      lifecycle.canProcess(record),
    ),
  };
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
      return "Later phase";
    default:
      return "Pending";
  }
}

export default function Overview() {
  const { overview } = useLoaderData<typeof loader>();

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
          Installation state: {overview.installationState}
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
          Questionnaire: {overview.questionnaireStatus.replaceAll("_", " ")}
        </s-paragraph>
        <s-paragraph>
          Customer account extensions: not started. Preferences are collected
          after the customer&apos;s first authenticated account access, not
          inside Shopify&apos;s native sign-in form.
        </s-paragraph>
        <s-paragraph>
          Completed profiles: {overview.completedProfiles}
        </s-paragraph>
        <s-paragraph>
          Last synchronization errors: {overview.lastSyncErrorCount}
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Next step">
        <s-paragraph>
          Confirm the authenticated shop from Settings, then import the
          optional pilot questionnaire only if you intend to seed this shop.
        </s-paragraph>
        <s-link href="/app/settings">Open settings</s-link>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
