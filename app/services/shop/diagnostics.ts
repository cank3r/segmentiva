import { ApiVersion } from "@shopify/shopify-app-react-router/server";

import type { VerifiedShopContext } from "../../tenancy/verified-shop";
import {
  queryAdminGraphql,
  type AdminGraphqlClient,
  ShopifyGraphqlError,
} from "../shopify/admin-graphql";
import {
  compareRequestedAndGrantedScopes,
  parseGrantedScopes,
  requestedScopesFromEnv,
  type ScopeComparison,
} from "./scopes";

const PINNED_API_VERSION = ApiVersion.July26;

const SHOP_DIAGNOSTIC_QUERY = `#graphql
  query ShopDiagnostic {
    shop {
      name
      myshopifyDomain
      plan {
        publicDisplayName
        partnerDevelopment
      }
    }
  }
`;

type ShopDiagnosticGraphql = {
  shop: {
    name: string;
    myshopifyDomain: string;
    plan: {
      publicDisplayName: string;
      partnerDevelopment: boolean;
    };
  };
};

export type DiagnosticStatus = "ok" | "error" | "stopped";

export type PublicDiagnosticResult = {
  status: DiagnosticStatus;
  apiVersion: string;
  verifiedShopDomain: string;
  shopName: string | null;
  myshopifyDomain: string | null;
  planDisplayName: string | null;
  partnerDevelopment: boolean | null;
  grantedScopes: string[];
  requestedScopes: string[];
  scopeComparison: ScopeComparison;
  identityMatchesSession: boolean | null;
  throttled: boolean;
  graphqlErrorCodes: string[];
  message: string;
};

const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|cookie|email|phone|address|payload)/i;

export function containsSensitiveKeys(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSensitiveKeys);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return true;
      }
      return containsSensitiveKeys(nested);
    });
  }
  return false;
}

export { parseGrantedScopes, requestedScopesFromEnv };

function assertPublicDiagnostic(result: PublicDiagnosticResult): void {
  if (containsSensitiveKeys(result)) {
    throw new Error("Diagnostic result contained a sensitive key.");
  }
}

function emptyIdentityFields(): Pick<
  PublicDiagnosticResult,
  "shopName" | "myshopifyDomain" | "planDisplayName" | "partnerDevelopment"
> {
  return {
    shopName: null,
    myshopifyDomain: null,
    planDisplayName: null,
    partnerDevelopment: null,
  };
}

export async function runShopDiagnostic(input: {
  shop: VerifiedShopContext;
  admin: AdminGraphqlClient;
  grantedScopes: string[];
  processable: boolean;
}): Promise<PublicDiagnosticResult> {
  const requestedScopes = requestedScopesFromEnv();
  const scopeComparison = compareRequestedAndGrantedScopes(
    requestedScopes,
    input.grantedScopes,
  );

  if (!input.processable) {
    const stopped: PublicDiagnosticResult = {
      status: "stopped",
      apiVersion: PINNED_API_VERSION,
      verifiedShopDomain: input.shop.shopDomain,
      ...emptyIdentityFields(),
      grantedScopes: input.grantedScopes,
      requestedScopes,
      scopeComparison,
      identityMatchesSession: null,
      throttled: false,
      graphqlErrorCodes: [],
      message:
        "Segmentiva is uninstalled for this shop. Application processing is stopped.",
    };
    assertPublicDiagnostic(stopped);
    return stopped;
  }

  try {
    const { data, throttled } = await queryAdminGraphql<ShopDiagnosticGraphql>(
      input.admin,
      SHOP_DIAGNOSTIC_QUERY,
    );

    const myshopifyDomain = data.shop.myshopifyDomain.toLowerCase();
    const identityMatchesSession = myshopifyDomain === input.shop.shopDomain;

    if (!identityMatchesSession) {
      const mismatch: PublicDiagnosticResult = {
        status: "error",
        apiVersion: PINNED_API_VERSION,
        verifiedShopDomain: input.shop.shopDomain,
        ...emptyIdentityFields(),
        grantedScopes: input.grantedScopes,
        requestedScopes,
        scopeComparison,
        identityMatchesSession: false,
        throttled,
        graphqlErrorCodes: [],
        message:
          "Authenticated shop identity did not match the current session.",
      };
      assertPublicDiagnostic(mismatch);
      return mismatch;
    }

    const result: PublicDiagnosticResult = {
      status: "ok",
      apiVersion: PINNED_API_VERSION,
      verifiedShopDomain: input.shop.shopDomain,
      shopName: data.shop.name,
      myshopifyDomain,
      planDisplayName: data.shop.plan.publicDisplayName,
      partnerDevelopment: data.shop.plan.partnerDevelopment,
      grantedScopes: input.grantedScopes,
      requestedScopes,
      scopeComparison,
      identityMatchesSession: true,
      throttled,
      graphqlErrorCodes: [],
      message: "Shop connection check succeeded for the verified shop.",
    };
    assertPublicDiagnostic(result);
    return result;
  } catch (error) {
    const codes =
      error instanceof ShopifyGraphqlError ? error.codes : [];
    const failed: PublicDiagnosticResult = {
      status: "error",
      apiVersion: PINNED_API_VERSION,
      verifiedShopDomain: input.shop.shopDomain,
      ...emptyIdentityFields(),
      grantedScopes: input.grantedScopes,
      requestedScopes,
      scopeComparison,
      identityMatchesSession: null,
      throttled:
        error instanceof ShopifyGraphqlError ? error.retryable && codes.includes("THROTTLED") : false,
      graphqlErrorCodes: codes,
      message:
        error instanceof ShopifyGraphqlError
          ? error.publicMessage
          : "Diagnostic read could not be completed.",
    };
    assertPublicDiagnostic(failed);
    return failed;
  }
}
