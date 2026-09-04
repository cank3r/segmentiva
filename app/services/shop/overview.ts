import type { ShopRecord } from "../../repositories/shop-repository";
import { parseShopSettings } from "./settings";

export type ChecklistItemStatus = "complete" | "pending" | "blocked" | "later";

export type ChecklistItem = {
  id: string;
  label: string;
  status: ChecklistItemStatus;
  detail: string;
};

export type OverviewSnapshot = {
  shopDomain: string;
  installationState: "INSTALLED" | "UNINSTALLED" | "UNKNOWN";
  processingEnabled: boolean;
  installedAt: string | null;
  uninstalledAt: string | null;
  questionnaireStatus: "not_started" | "pilot_imported" | "published";
  completedProfiles: number;
  lastSyncErrorCount: number;
  customerAccountExtensions: "not_started";
  checklist: ChecklistItem[];
};

export function buildOverviewSnapshot(
  shopDomain: string,
  record: ShopRecord | null,
  processingEnabled: boolean,
): OverviewSnapshot {
  const settings = record ? parseShopSettings(record.settings) : {};
  const installationState = record?.installationState ?? "UNKNOWN";
  const questionnaireStatus = record?.publishedQuestionnaireId
    ? "published"
    : settings.pilotSeed
      ? "pilot_imported"
      : "not_started";

  const checklist: ChecklistItem[] = [
    {
      id: "install",
      label: "Install Segmentiva",
      status: record?.installationState === "INSTALLED" ? "complete" : "blocked",
      detail:
        record?.installationState === "INSTALLED"
          ? "App is installed and processing is enabled."
          : "Install the app to start merchant onboarding.",
    },
    {
      id: "diagnostic",
      label: "Confirm shop connection",
      status:
        settings.lastDiagnostic?.status === "ok"
          ? "complete"
          : processingEnabled
            ? "pending"
            : "blocked",
      detail:
        settings.lastDiagnostic?.status === "ok"
          ? "Harmless Admin API diagnostic succeeded for the verified shop."
          : processingEnabled
            ? "Run the harmless Admin API diagnostic from Settings."
            : "Processing is stopped until the app is installed.",
    },
    {
      id: "pilot-seed",
      label: "Import the optional pilot questionnaire",
      status: settings.pilotSeed ? "complete" : processingEnabled ? "pending" : "blocked",
      detail: settings.pilotSeed
        ? "Pilot pack imported. Publishing is available in the questionnaire builder."
        : "Import is never automatic. Use Settings or `npm run seed:pilot` with an explicit shop.",
    },
    {
      id: "publish",
      label: "Publish a questionnaire version",
      status: "later",
      detail: "Available in Phase 2 — the versioned questionnaire builder.",
    },
    {
      id: "customer-extensions",
      label: "Place customer account extensions",
      status: "later",
      detail:
        "Available in Phase 3. Preferences are collected after authenticated account access, not inside Shopify login.",
    },
    {
      id: "segments",
      label: "Activate tags and native segments",
      status: "later",
      detail: "Available in Phase 4.",
    },
  ];

  return {
    shopDomain,
    installationState,
    processingEnabled,
    installedAt: record?.installedAt.toISOString() ?? null,
    uninstalledAt: record?.uninstalledAt?.toISOString() ?? null,
    questionnaireStatus,
    completedProfiles: 0,
    lastSyncErrorCount: 0,
    customerAccountExtensions: "not_started",
    checklist,
  };
}
