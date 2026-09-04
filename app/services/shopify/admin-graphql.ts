export class ShopifyGraphqlError extends Error {
  readonly code = "SHOPIFY_GRAPHQL_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "ShopifyGraphqlError";
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
  errors?: Array<{ message?: string }>;
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

function isThrottled(body: GraphqlBody): boolean {
  const available = body.extensions?.cost?.throttleStatus?.currentlyAvailable;
  return typeof available === "number" && available <= 0;
}

/**
 * Run an Admin GraphQL operation and treat HTTP 200 + `errors` as failure.
 * Does not return or log the raw payload, tokens, or user-identifying fields.
 */
export async function queryAdminGraphql<T>(
  admin: AdminGraphqlClient,
  query: string,
): Promise<{ data: T; throttled: boolean }> {
  const response = await admin.graphql(query);
  const body = (await response.json()) as GraphqlBody;

  if (!response.ok) {
    throw new ShopifyGraphqlError("Shopify Admin GraphQL request failed.");
  }

  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw new ShopifyGraphqlError("Shopify Admin GraphQL returned errors.");
  }

  if (body.data == null) {
    throw new ShopifyGraphqlError("Shopify Admin GraphQL returned no data.");
  }

  return {
    data: body.data as T,
    throttled: isThrottled(body),
  };
}
