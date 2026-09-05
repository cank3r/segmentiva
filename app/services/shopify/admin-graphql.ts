import { safeLog } from "../../observability/safe-log";

const RETRYABLE_GRAPHQL_CODES = new Set(["THROTTLED"]);
const NON_RETRYABLE_GRAPHQL_CODES = new Set([
  "ACCESS_DENIED",
  "FORBIDDEN",
  "UNAUTHENTICATED",
]);

const MAX_RETRY_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 200;

export class ShopifyGraphqlError extends Error {
  readonly code = "SHOPIFY_GRAPHQL_ERROR";
  readonly codes: string[];
  readonly retryable: boolean;
  readonly publicMessage: string;

  constructor(input: {
    message: string;
    publicMessage: string;
    codes: string[];
    retryable: boolean;
  }) {
    super(input.message);
    this.name = "ShopifyGraphqlError";
    this.codes = input.codes;
    this.retryable = input.retryable;
    this.publicMessage = input.publicMessage;
  }
}

export type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type GraphqlBody = {
  data?: unknown;
  errors?: Array<{
    message?: string;
    extensions?: { code?: string };
  }>;
  extensions?: {
    cost?: {
      throttleStatus?: {
        currentlyAvailable?: number;
        restoreRate?: number;
        maximumAvailable?: number;
      };
    };
  };
};

export type GraphqlSleep = (ms: number) => Promise<void>;
export type GraphqlRandom = () => number;

const defaultSleep: GraphqlSleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function extractCodes(body: GraphqlBody): string[] {
  if (!Array.isArray(body.errors)) {
    return [];
  }
  return body.errors
    .map((error) => error.extensions?.code)
    .filter((code): code is string => typeof code === "string" && code.length > 0);
}

function isThrottled(body: GraphqlBody, codes: string[]): boolean {
  if (codes.includes("THROTTLED")) {
    return true;
  }
  const available = body.extensions?.cost?.throttleStatus?.currentlyAvailable;
  return typeof available === "number" && available <= 0;
}

function classifyCodes(codes: string[]): { retryable: boolean } {
  if (codes.some((code) => NON_RETRYABLE_GRAPHQL_CODES.has(code))) {
    return { retryable: false };
  }
  if (codes.some((code) => RETRYABLE_GRAPHQL_CODES.has(code))) {
    return { retryable: true };
  }
  return { retryable: false };
}

export function backoffWithJitterMs(
  attempt: number,
  random: GraphqlRandom = Math.random,
): number {
  const exp = BASE_BACKOFF_MS * 2 ** attempt;
  const jitter = random() * exp * 0.3;
  return Math.round(exp + jitter);
}

function publicMessageFor(codes: string[]): string {
  if (codes.includes("THROTTLED")) {
    return "Shopify is temporarily rate-limiting Admin API reads. Try the diagnostic again shortly.";
  }
  if (codes.includes("ACCESS_DENIED")) {
    return "Shopify denied this Admin API read. Check that the app still has the required permissions.";
  }
  return "Shopify Admin GraphQL returned errors.";
}

export type QueryAdminGraphqlOptions = {
  sleep?: GraphqlSleep;
  random?: GraphqlRandom;
};

/**
 * Run an Admin GraphQL operation and treat HTTP 200 + `errors` as failure.
 * Preserves `errors[].extensions.code`. Retries only THROTTLED responses
 * with bounded exponential backoff and jitter.
 * Does not return or log the raw payload, tokens, or user-identifying fields.
 */
export async function queryAdminGraphql<T>(
  admin: AdminGraphqlClient,
  query: string,
  options: QueryAdminGraphqlOptions = {},
): Promise<{ data: T; throttled: boolean; codes: string[] }> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  let lastCodes: string[] = [];

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    const response = await admin.graphql(query);
    const body = (await response.json()) as GraphqlBody;
    const codes = extractCodes(body);
    lastCodes = codes;

    if (!response.ok) {
      throw new ShopifyGraphqlError({
        message: "Shopify Admin GraphQL request failed.",
        publicMessage: "Shopify Admin GraphQL request failed.",
        codes,
        retryable: false,
      });
    }

    const throttled = isThrottled(body, codes);
    const { retryable } = classifyCodes(codes);

    if (Array.isArray(body.errors) && body.errors.length > 0) {
      if (retryable && throttled && attempt < MAX_RETRY_ATTEMPTS - 1) {
        safeLog("Retrying throttled Admin GraphQL read", {
          status: "THROTTLED",
        });
        await sleep(backoffWithJitterMs(attempt, random));
        continue;
      }

      throw new ShopifyGraphqlError({
        message: "Shopify Admin GraphQL returned errors.",
        publicMessage: publicMessageFor(codes),
        codes,
        retryable: retryable && throttled,
      });
    }

    if (body.data == null) {
      throw new ShopifyGraphqlError({
        message: "Shopify Admin GraphQL returned no data.",
        publicMessage: "Shopify Admin GraphQL returned no data.",
        codes,
        retryable: false,
      });
    }

    return {
      data: body.data as T,
      throttled,
      codes,
    };
  }

  throw new ShopifyGraphqlError({
    message: "Shopify Admin GraphQL returned errors.",
    publicMessage: publicMessageFor(lastCodes),
    codes: lastCodes,
    retryable: false,
  });
}
