import { describe, expect, it } from "vitest";
import { GeneratedCopySafetyService } from "../services/content-safety/GeneratedCopySafetyService";

describe("GeneratedCopySafetyService — a negator must govern the matched claim", () => {
  const separatePromises = [
    "This is not complicated and guarantees top placement.",
    "This is not expensive yet promises first page placement.",
    "The process isn’t difficult and gets you to page one.",
    "This cannot be complicated and guarantees top placement.",
    "We avoid jargon and guarantee a higher ranking.",
    "This is not complicated and absolutely guarantees top placement.",
    "This is not expensive yet reliably promises first page placement.",
    "We avoid jargon and confidently guarantee a higher ranking.",
    "The process isn’t difficult and consistently gets you to page one.",
    "This is not complicated and will definitely guarantee top placement.",
    "This is not complicated and will almost certainly guarantee top placement.",
  ];

  it.each(separatePromises)("BLOCKS a separate promise after unrelated negation: %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(false);
    expect(result.status).toBe("blocked");
  });

  const sharedNegation = [
    "We do not guarantee rankings or promise page-one placement.",
    "We will not rank you #1 or get you to page one.",
    "Good dentistry is not only about your google rankings.",
    "This is not complicated and definitely does not guarantee top placement.",
    "This is not complicated and will definitely not guarantee top placement.",
    "This is not complicated and will almost certainly not guarantee top placement.",
  ];

  it.each(sharedNegation)("PASSES a claim that the negator actually governs: %s", (copy) => {
    expect(GeneratedCopySafetyService.validateGeneratedCopy(copy).isSafe).toBe(true);
  });
});

describe("GeneratedCopySafetyService — bidi controls fail closed before matching", () => {
  const bidiCopy = [
    "We g\u202Eeetnarau\u202C results.",
    "We g\u2066uarantee\u2069 results.",
    "We g&#x202E;eetnarau&#x202C; results.",
  ];

  it.each(bidiCopy)("BLOCKS copy containing a bidi override or isolate: %j", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.reasonCodes).toEqual(["bidirectional_control"]);
  });

  it("keeps reason codes and reasons aligned for stacked safety-gate consumers", () => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy("We g\u202Eeetnarau\u202C results.");
    expect(result.reasonCodes).toHaveLength(result.reasons.length);
    expect(result.reasons[0]).toMatch(/bidirectional formatting controls/i);
  });
});
