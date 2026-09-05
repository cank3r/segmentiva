import type { Shop } from "@prisma/client";

export type LocalizedText = {
  en: string;
  es: string;
};

export type PilotQuestionType = "single_select" | "multi_select" | "boolean";

export type PilotOptionDefinition = {
  key: string;
  label: LocalizedText;
};

export type PilotQuestionDefinition = {
  key: string;
  type: PilotQuestionType;
  required: boolean;
  position: number;
  label: LocalizedText;
  helpText?: LocalizedText;
  options: PilotOptionDefinition[];
};

export type PilotPackId = "kliquea-pilot";

export type PilotQuestionnaireDefinition = {
  packId: PilotPackId;
  version: string;
  defaultLocale: "en";
  title: LocalizedText;
  introduction: LocalizedText;
  completionMessage: LocalizedText;
  privacyExplanation: LocalizedText;
  questions: PilotQuestionDefinition[];
};

export type PilotSeedStatus = "applied" | "failed" | "reset";

export type PilotSeedRecord = {
  packId: PilotPackId;
  version: string;
  importedAt: string;
  status: PilotSeedStatus;
  definition: PilotQuestionnaireDefinition;
};

export type LastDiagnosticRecord = {
  status: "ok" | "error" | "stopped";
  ranAt: string;
};

export type ShopSettings = {
  defaultLocale?: "en" | "es";
  accountCompatibility?: "new_customer_accounts";
  pilotSeed?: PilotSeedRecord;
  lastDiagnostic?: LastDiagnosticRecord;
};

function isLocalizedText(value: unknown): value is LocalizedText {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as LocalizedText).en === "string" &&
    typeof (value as LocalizedText).es === "string" &&
    (value as LocalizedText).en.length > 0 &&
    (value as LocalizedText).es.length > 0
  );
}

export function parseShopSettings(value: unknown): ShopSettings {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const settings: ShopSettings = {};

  if (record.defaultLocale === "en" || record.defaultLocale === "es") {
    settings.defaultLocale = record.defaultLocale;
  }

  if (record.accountCompatibility === "new_customer_accounts") {
    settings.accountCompatibility = record.accountCompatibility;
  }

  if (record.pilotSeed && typeof record.pilotSeed === "object") {
    const seed = record.pilotSeed as PilotSeedRecord;
    if (seed.packId === "kliquea-pilot" && typeof seed.importedAt === "string") {
      settings.pilotSeed = seed;
    }
  }

  if (record.lastDiagnostic && typeof record.lastDiagnostic === "object") {
    const diagnostic = record.lastDiagnostic as LastDiagnosticRecord;
    if (
      (diagnostic.status === "ok" ||
        diagnostic.status === "error" ||
        diagnostic.status === "stopped") &&
      typeof diagnostic.ranAt === "string"
    ) {
      settings.lastDiagnostic = {
        status: diagnostic.status,
        ranAt: diagnostic.ranAt,
      };
    }
  }

  return settings;
}

export function settingsFromShopRecord(record: Shop): ShopSettings {
  const settings: ShopSettings = {};

  if (record.defaultLocale === "en" || record.defaultLocale === "es") {
    settings.defaultLocale = record.defaultLocale;
  }

  if (record.accountCompatibility === "new_customer_accounts") {
    settings.accountCompatibility = "new_customer_accounts";
  }

  if (
    record.pilotSeedPackId === "kliquea-pilot" &&
    record.pilotSeedImportedAt &&
    record.pilotSeedVersion &&
    (record.pilotSeedStatus === "applied" ||
      record.pilotSeedStatus === "failed" ||
      record.pilotSeedStatus === "reset") &&
    record.pilotSeedDefinition &&
    typeof record.pilotSeedDefinition === "object"
  ) {
    settings.pilotSeed = {
      packId: "kliquea-pilot",
      version: record.pilotSeedVersion,
      importedAt: record.pilotSeedImportedAt.toISOString(),
      status: record.pilotSeedStatus,
      definition: record.pilotSeedDefinition as PilotQuestionnaireDefinition,
    };
  }

  if (
    record.lastDiagnosticStatus &&
    record.lastDiagnosticAt &&
    (record.lastDiagnosticStatus === "ok" ||
      record.lastDiagnosticStatus === "error" ||
      record.lastDiagnosticStatus === "stopped")
  ) {
    settings.lastDiagnostic = {
      status: record.lastDiagnosticStatus,
      ranAt: record.lastDiagnosticAt.toISOString(),
    };
  }

  return settings;
}

export function isPilotDefinitionShape(
  value: unknown,
): value is PilotQuestionnaireDefinition {
  return isLocalizedText(
    value && typeof value === "object"
      ? (value as PilotQuestionnaireDefinition).title
      : null,
  );
}
