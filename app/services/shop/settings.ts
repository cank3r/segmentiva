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
  defaultLocale: "en";
  title: LocalizedText;
  introduction: LocalizedText;
  completionMessage: LocalizedText;
  privacyExplanation: LocalizedText;
  questions: PilotQuestionDefinition[];
};

export type PilotSeedRecord = {
  packId: PilotPackId;
  importedAt: string;
  definition: PilotQuestionnaireDefinition;
};

export type ShopSettings = {
  defaultLocale?: "en" | "es";
  accountCompatibility?: "new_customer_accounts";
  pilotSeed?: PilotSeedRecord;
};

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

  return settings;
}
