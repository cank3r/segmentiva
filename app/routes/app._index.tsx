import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  return (
    <s-page heading="Segmentiva">
      <s-section heading="Turn customer data into personalized shopping">
        <s-paragraph>
          This is the Phase 0 baseline of Segmentiva, a Shopify-native customer
          preference and segmentation app. The official app scaffold,
          authentication, session storage, and embedded Admin shell are in
          place. Merchant onboarding, the questionnaire builder, customer
          account extensions, and segment activation arrive in later phases.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Baseline">
        <s-paragraph>
          <s-text>Framework: </s-text>
          <s-link href="https://reactrouter.com/" target="_blank">
            React Router
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Shopify Admin API: </s-text>
          <s-link
            href="https://shopify.dev/docs/api/admin-graphql"
            target="_blank"
          >
            GraphQL 2026-07
          </s-link>
        </s-paragraph>
        <s-paragraph>
          <s-text>Database: </s-text>
          <s-link href="https://www.prisma.io/" target="_blank">
            Prisma
          </s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
