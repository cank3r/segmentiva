export type ScopeCapability = {
  scope: string;
  label: string;
  impact: string;
};

const KNOWN_SCOPES: Record<string, Omit<ScopeCapability, "scope">> = {
  read_customers: {
    label: "Read customers",
    impact:
      "Segmentiva cannot read the customer records needed to save preferences.",
  },
  write_customers: {
    label: "Write customers",
    impact:
      "Segmentiva cannot save customer preference tags until this permission is granted.",
  },
};

export type ScopeComparison = {
  requested: string[];
  granted: string[];
  missing: ScopeCapability[];
  extra: string[];
  reauthorizeAction: string;
};

export function parseGrantedScopes(scope: string | null | undefined): string[] {
  if (!scope) {
    return [];
  }
  return scope
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();
}

export function labelsForScopes(scopes: string[]): string[] {
  return scopes.map((scope) => KNOWN_SCOPES[scope]?.label ?? scope);
}

export function requestedScopesFromEnv(): string[] {
  return parseGrantedScopes(process.env.SCOPES);
}

export function compareRequestedAndGrantedScopes(
  requested: string[],
  granted: string[],
): ScopeComparison {
  const grantedSet = new Set(granted);
  const requestedSet = new Set(requested);
  const missing = requested
    .filter((scope) => !grantedSet.has(scope))
    .map((scope) => ({
      scope,
      label: KNOWN_SCOPES[scope]?.label ?? scope,
      impact:
        KNOWN_SCOPES[scope]?.impact ??
        "A required app permission is missing until the merchant updates authorization.",
    }));

  return {
    requested,
    granted,
    missing,
    extra: granted.filter((scope) => !requestedSet.has(scope)),
    reauthorizeAction:
      missing.length === 0
        ? "No action needed. Requested permissions match the current grant."
        : "Open Segmentiva from Shopify Admin so Shopify can request the missing permissions. Do not paste tokens or install URLs.",
  };
}
