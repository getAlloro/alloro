import { describe, test, expect } from "vitest";
import { checkVoice } from "../../src/services/narrator/voiceConstraints";

describe("voiceConstraints — base banned constructs (regression)", () => {
  test("clean copy passes", () => {
    const result = checkVoice(
      "Saif's churn recovered after the per-location pricing reset on 2026-05-14."
    );
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test("em-dash flags", () => {
    const result = checkVoice("Saif's churn — recovery underway.");
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.includes("em-dash"))).toBe(true);
  });

  test("marketing-superlative flags", () => {
    const result = checkVoice("Our cutting-edge solution will leverage growth.");
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

describe("voiceConstraints — substrate-language parity (PR #107 / PR #109)", () => {
  test("Wright Brothers Rule flags", () => {
    const result = checkVoice("This follows the Wright Brothers Rule.");
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.includes("Wright Brothers Rule"))
    ).toBe(true);
  });

  test("Pistorius doctrine flags (case-insensitive)", () => {
    const result = checkVoice("Apply the pistorius doctrine here.");
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.toLowerCase().includes("pistorius"))
    ).toBe(true);
  });

  test("Harry Hogge flags", () => {
    const result = checkVoice("Harry Hogge holds the full picture.");
    expect(result.passed).toBe(false);
  });

  test("Cole Trickle flags", () => {
    const result = checkVoice("Cole Trickle works at race pace.");
    expect(result.passed).toBe(false);
  });

  test("Sophie Test flags", () => {
    const result = checkVoice("Did this output pass the Sophie Test?");
    expect(result.passed).toBe(false);
  });

  test("Calistoga Standard flags", () => {
    const result = checkVoice("Apply the Calistoga Standard.");
    expect(result.passed).toBe(false);
  });

  test("Rice Cooker flags", () => {
    const result = checkVoice("Rice Cooker score moved to 72%.");
    expect(result.passed).toBe(false);
  });

  test("Cesar Millan (two Ls) flags", () => {
    const result = checkVoice("Cesar Millan principle applies.");
    expect(result.passed).toBe(false);
  });

  test("Caesar Milan (one L, alt spelling) flags", () => {
    const result = checkVoice("Same as Caesar Milan above.");
    expect(result.passed).toBe(false);
  });

  test("SSL moment flags", () => {
    const result = checkVoice("That was an SSL moment for the team.");
    expect(result.passed).toBe(false);
  });

  test("Klein pre-mortem flags", () => {
    const result = checkVoice("Run a Klein pre-mortem before locking.");
    expect(result.passed).toBe(false);
  });

  test("Confidence Code (proper-noun) flags", () => {
    const result = checkVoice("Apply the Confidence Code to every output.");
    expect(result.passed).toBe(false);
  });

  test("lowercase 'confidence code' does NOT flag (false-positive guard)", () => {
    const result = checkVoice("their confidence code is yellow.");
    expect(
      result.violations.some((v) =>
        v.toLowerCase().includes("substrate-language named reference: \"confidence code\"")
      )
    ).toBe(false);
  });

  test("BLIMEY flags", () => {
    const result = checkVoice("BLIMEY-format handoff ready for Dave.");
    expect(result.passed).toBe(false);
  });

  test("FYM flags", () => {
    const result = checkVoice("FYM milestone on track.");
    expect(result.passed).toBe(false);
  });

  test("Freedom Delivered flags", () => {
    const result = checkVoice("Freedom Delivered is the outcome.");
    expect(result.passed).toBe(false);
  });

  test("The Standard (proper-noun) flags", () => {
    const result = checkVoice("Does this output pass The Standard?");
    expect(result.passed).toBe(false);
  });

  test("'the standard practice' does NOT flag (generic-phrase guard)", () => {
    const result = checkVoice("This is the standard practice for the team.");
    expect(
      result.violations.some((v) =>
        v.includes("substrate-language named reference: \"The Standard\"")
      )
    ).toBe(false);
  });
});

describe("voiceConstraints — business-hours embeddings parity (2026-05-23 Skill)", () => {
  test("weekday name flags", () => {
    const result = checkVoice("Reply by Monday for the contract update.");
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.includes("business-hours embedding"))
    ).toBe(true);
  });

  test("'this weekend' flags", () => {
    const result = checkVoice("We'll wrap this up this weekend.");
    expect(result.passed).toBe(false);
    expect(
      result.violations.some((v) => v.includes("this weekend"))
    ).toBe(true);
  });

  test("'tomorrow morning' flags", () => {
    const result = checkVoice("Send the brief tomorrow morning.");
    expect(result.passed).toBe(false);
  });

  test("'next week' flags", () => {
    const result = checkVoice("Plan the rollout for next week.");
    expect(result.passed).toBe(false);
  });

  test("'business hours' flags", () => {
    const result = checkVoice("Available during business hours only.");
    expect(result.passed).toBe(false);
  });

  test("'9 to 5' flags", () => {
    const result = checkVoice("This is a 9 to 5 mindset.");
    expect(result.passed).toBe(false);
  });

  test("clean copy without weekday or time-window passes for business-hours", () => {
    const result = checkVoice("Saif's churn recovered after the per-location pricing reset.");
    expect(
      result.violations.some((v) => v.includes("business-hours embedding"))
    ).toBe(false);
  });
});
