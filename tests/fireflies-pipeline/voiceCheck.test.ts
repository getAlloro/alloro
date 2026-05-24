import { describe, test, expect } from "vitest";
import {
  checkVoice,
  findFirstVoiceFailure,
} from "../../src/services/fireflies-pipeline/voiceCheck";

describe("voiceCheck integration", () => {
  test("passes a clean bullet", () => {
    const result = checkVoice(
      "One Endodontics (Saif): endodontics, Fredericksburg VA. Contract resolution confirmed. June demo scheduled.",
    );
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test("blocks em-dash", () => {
    const result = checkVoice(
      "Saif call — GBP resolved during call.",
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("em-dash"))).toBe(true);
  });

  test("blocks marketing-superlative cluster", () => {
    const result = checkVoice(
      "Our world-class dashboard helped Saif unlock his growth potential.",
    );
    expect(result.passed).toBe(false);
  });

  test("blocks Alloro-as-hero framing", () => {
    const result = checkVoice("We saved you another quarter of churn.");
    expect(result.passed).toBe(false);
  });

  test("blocks shame language", () => {
    const result = checkVoice("You haven't yet uploaded your data.");
    expect(result.passed).toBe(false);
  });
});

describe("findFirstVoiceFailure", () => {
  test("returns null when all bullets pass", () => {
    const result = findFirstVoiceFailure([
      { customer: "Saif", rendered_text: "Saif call resolved." },
      { customer: "Caroline", rendered_text: "Caroline call scheduled." },
    ]);
    expect(result).toBeNull();
  });

  test("returns first failing bullet with violations", () => {
    const result = findFirstVoiceFailure([
      { customer: "Saif", rendered_text: "Saif call resolved." },
      { customer: "Caroline", rendered_text: "Caroline call — reschedule." },
      { customer: "Erin", rendered_text: "Erin call also — broken." },
    ]);
    expect(result).not.toBeNull();
    expect(result!.customer).toBe("Caroline");
    expect(result!.result.violations.some((v) => v.includes("em-dash"))).toBe(true);
  });
});
