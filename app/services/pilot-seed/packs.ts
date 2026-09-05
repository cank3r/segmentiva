import { kliqueaPilotQuestionnaire, KLIQUEA_PILOT_PACK_ID } from "./kliquea-pilot";
import type {
  LocalizedText,
  PilotPackId,
  PilotQuestionDefinition,
  PilotQuestionnaireDefinition,
} from "../shop/settings";

const PACKS: Record<PilotPackId, PilotQuestionnaireDefinition> = {
  [KLIQUEA_PILOT_PACK_ID]: kliqueaPilotQuestionnaire,
};

export const KLIQUEA_PILOT_PACK_VERSION = kliqueaPilotQuestionnaire.version;

export class UnknownPilotPackError extends Error {
  readonly code = "UNKNOWN_PILOT_PACK";

  constructor(packId: string) {
    super("Unknown pilot questionnaire pack.");
    this.name = "UnknownPilotPackError";
    void packId;
  }
}

export class InvalidPilotPackError extends Error {
  readonly code = "INVALID_PILOT_PACK";

  constructor(message = "Pilot questionnaire pack is invalid.") {
    super(message);
    this.name = "InvalidPilotPackError";
  }
}

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

const QUESTION_TYPES = new Set(["single_select", "multi_select", "boolean"]);
const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

function assertQuestion(question: PilotQuestionDefinition, index: number): void {
  if (!KEY_PATTERN.test(question.key)) {
    throw new InvalidPilotPackError(`Question ${index + 1} has an invalid key.`);
  }
  if (!QUESTION_TYPES.has(question.type)) {
    throw new InvalidPilotPackError(`Question ${question.key} has an invalid type.`);
  }
  if (typeof question.required !== "boolean") {
    throw new InvalidPilotPackError(`Question ${question.key} is missing required.`);
  }
  if (question.position !== index + 1) {
    throw new InvalidPilotPackError(`Question ${question.key} has a non-sequential position.`);
  }
  if (!isLocalizedText(question.label)) {
    throw new InvalidPilotPackError(`Question ${question.key} is missing bilingual labels.`);
  }
  if (question.helpText && !isLocalizedText(question.helpText)) {
    throw new InvalidPilotPackError(`Question ${question.key} has invalid help text.`);
  }
  if (!Array.isArray(question.options) || question.options.length === 0) {
    throw new InvalidPilotPackError(`Question ${question.key} needs at least one option.`);
  }
  const optionKeys = new Set<string>();
  for (const option of question.options) {
    if (!KEY_PATTERN.test(option.key) || optionKeys.has(option.key)) {
      throw new InvalidPilotPackError(`Question ${question.key} has an invalid option key.`);
    }
    optionKeys.add(option.key);
    if (!isLocalizedText(option.label)) {
      throw new InvalidPilotPackError(`Option ${option.key} is missing bilingual labels.`);
    }
  }
}

export function assertValidPilotPack(
  definition: PilotQuestionnaireDefinition,
  expectedVersion = KLIQUEA_PILOT_PACK_VERSION,
): void {
  if (definition.packId !== KLIQUEA_PILOT_PACK_ID) {
    throw new InvalidPilotPackError("Pilot pack id is not recognized.");
  }
  if (definition.version !== expectedVersion) {
    throw new InvalidPilotPackError("Pilot pack version does not match the supported seed.");
  }
  if (definition.defaultLocale !== "en") {
    throw new InvalidPilotPackError("Pilot pack default locale is invalid.");
  }
  for (const field of [
    "title",
    "introduction",
    "completionMessage",
    "privacyExplanation",
  ] as const) {
    if (!isLocalizedText(definition[field])) {
      throw new InvalidPilotPackError(`Pilot pack is missing bilingual ${field}.`);
    }
  }
  if (!Array.isArray(definition.questions) || definition.questions.length === 0) {
    throw new InvalidPilotPackError("Pilot pack has no questions.");
  }
  const questionKeys = new Set<string>();
  definition.questions.forEach((question, index) => {
    if (questionKeys.has(question.key)) {
      throw new InvalidPilotPackError("Pilot pack has duplicate question keys.");
    }
    questionKeys.add(question.key);
    assertQuestion(question, index);
  });
}

export function getPilotPack(packId: string): PilotQuestionnaireDefinition {
  if (packId !== KLIQUEA_PILOT_PACK_ID) {
    throw new UnknownPilotPackError(packId);
  }
  const definition = PACKS[packId];
  assertValidPilotPack(definition);
  return definition;
}

export function listPilotPackIds(): PilotPackId[] {
  return [KLIQUEA_PILOT_PACK_ID];
}
