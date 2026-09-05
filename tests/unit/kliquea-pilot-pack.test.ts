import { describe, expect, it } from "vitest";

import { kliqueaPilotQuestionnaire } from "../../app/services/pilot-seed/kliquea-pilot";
import {
  assertValidPilotPack,
  getPilotPack,
  InvalidPilotPackError,
  UnknownPilotPackError,
} from "../../app/services/pilot-seed/packs";

describe("Kliquea pilot pack", () => {
  it("matches the section 6 logical questions and stable keys", () => {
    const questions = kliqueaPilotQuestionnaire.questions;
    expect(questions.map((question) => question.key)).toEqual([
      "interests",
      "shopping_for",
      "shopping_style",
    ]);
    expect(questions[0]).toMatchObject({
      type: "multi_select",
      required: true,
    });
    expect(questions[0].options.map((option) => option.key)).toEqual([
      "beauty",
      "womens_fashion",
      "mens_fashion",
      "kids",
      "home",
      "technology",
      "health_and_wellness",
      "sports",
    ]);
    expect(questions[1]).toMatchObject({
      type: "multi_select",
      required: false,
    });
    expect(questions[1].options.map((option) => option.key)).toEqual([
      "myself",
      "partner",
      "children_or_family",
      "gifts",
      "business",
    ]);
    expect(questions[2]).toMatchObject({
      type: "single_select",
      required: false,
    });
    expect(questions[2].options.map((option) => option.key)).toEqual([
      "deals",
      "price_quality_balance",
      "premium",
      "depends",
    ]);
  });

  it("keeps English and Spanish labels without using labels as keys", () => {
    for (const question of kliqueaPilotQuestionnaire.questions) {
      expect(question.label.en.length).toBeGreaterThan(0);
      expect(question.label.es.length).toBeGreaterThan(0);
      expect(question.key).toMatch(/^[a-z_]+$/);
      for (const option of question.options) {
        expect(option.key).toMatch(/^[a-z_]+$/);
        expect(option.key).not.toBe(option.label.en);
      }
    }
  });

  it("does not expose a pack for an arbitrary shop-specific identifier", () => {
    expect(() => getPilotPack("kliquea-production-store")).toThrow(
      UnknownPilotPackError,
    );
  });

  it("validates pack structure and version before import", () => {
    expect(kliqueaPilotQuestionnaire.version).toBe("1.0.0");
    expect(() => getPilotPack("kliquea-pilot")).not.toThrow();
    expect(() =>
      assertValidPilotPack({
        ...kliqueaPilotQuestionnaire,
        version: "0.0.0-invalid",
      }),
    ).toThrow(InvalidPilotPackError);
    expect(() =>
      assertValidPilotPack({
        ...kliqueaPilotQuestionnaire,
        questions: [],
      }),
    ).toThrow(InvalidPilotPackError);
  });
});
