import { kliqueaPilotQuestionnaire, KLIQUEA_PILOT_PACK_ID } from "./kliquea-pilot";
import type { PilotPackId, PilotQuestionnaireDefinition } from "../shop/settings";

const PACKS: Record<PilotPackId, PilotQuestionnaireDefinition> = {
  [KLIQUEA_PILOT_PACK_ID]: kliqueaPilotQuestionnaire,
};

export class UnknownPilotPackError extends Error {
  readonly code = "UNKNOWN_PILOT_PACK";

  constructor(packId: string) {
    super("Unknown pilot questionnaire pack.");
    this.name = "UnknownPilotPackError";
    void packId;
  }
}

export function getPilotPack(packId: string): PilotQuestionnaireDefinition {
  if (packId !== KLIQUEA_PILOT_PACK_ID) {
    throw new UnknownPilotPackError(packId);
  }
  return PACKS[packId];
}

export function listPilotPackIds(): PilotPackId[] {
  return [KLIQUEA_PILOT_PACK_ID];
}
