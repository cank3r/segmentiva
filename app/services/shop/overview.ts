import type { ShopRecord } from "../../repositories/shop-repository";
import { parseShopSettings, settingsFromShopRecord } from "./settings";

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
  installationLabel: string;
  processingEnabled: boolean;
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
  const settings = record
    ? settingsFromShopRecord(record)
    : parseShopSettings({});
  const installationState = record?.installationState ?? "UNKNOWN";
  const questionnaireStatus = record?.publishedQuestionnaireId
    ? "published"
    : settings.pilotSeed?.status === "applied"
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
        !processingEnabled
          ? "blocked"
          : settings.lastDiagnostic?.status === "ok"
            ? "complete"
            : "pending",
      detail:
        settings.lastDiagnostic?.status === "ok"
          ? "Connection diagnostic succeeded for the verified shop."
          : processingEnabled
            ? "Run the connection diagnostic from Settings."
            : "Processing is stopped until the app is installed.",
    },
    {
      id: "pilot-seed",
      label: "Import the optional pilot questionnaire",
      status:
        settings.pilotSeed?.status === "applied"
          ? "complete"
          : processingEnabled
            ? "pending"
            : "blocked",
      detail:
        settings.pilotSeed?.status === "applied"
          ? "Pilot questionnaire imported for this shop."
          : "Import is never automatic. Use Settings and confirm before importing for this shop only.",
    },
    {
      id: "publish",
      label: "Publish a questionnaire version",
      status: "later",
      detail: "Coming later — the versioned questionnaire builder.",
    },
    {
      id: "customer-extensions",
      label: "Place customer account extensions",
      status: "later",
      detail:
        "Coming later. Preferences are collected after authenticated account access, not inside Shopify login.",
    },
    {
      id: "segments",
      label: "Activate tags and native segments",
      status: "later",
      detail: "Coming later.",
    },
  ];

  return {
    shopDomain,
    installationState,
    installationLabel:
      installationState === "INSTALLED"
        ? "Installed"
        : installationState === "UNINSTALLED"
          ? "Uninstalled"
          : "Unknown",
    processingEnabled,
    questionnaireStatus,
    completedProfiles: 0,
    lastSyncErrorCount: 0,
    customerAccountExtensions: "not_started",
    checklist,
  };
}
