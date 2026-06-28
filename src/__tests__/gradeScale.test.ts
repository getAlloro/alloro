import { describe, it, expect } from "vitest";
import {
  scoreToGrade,
  deriveGrade,
} from "../controllers/audit/audit-utils/gradeScale";

/**
 * Locks the approved 12-band scale (Jo's reference sheet) into code so the
 * audit cards can never silently re-inflate. Every band edge is asserted, plus
 * the two Definition-of-Done invariants and the rounding / non-finite paths.
 */
describe("scoreToGrade — approved 12-band scale", () => {
  const cases: ReadonlyArray<[number, string]> = [
    [100, "A"],
    [93, "A"],
    [92, "A-"],
    [90, "A-"],
    [89, "B+"],
    [87, "B+"],
    [86, "B"],
    [83, "B"],
    [82, "B-"],
    [80, "B-"],
    [79, "C+"],
    [77, "C+"],
    [76, "C"],
    [73, "C"],
    [72, "C-"],
    [70, "C-"],
    [69, "D+"],
    [67, "D+"],
    [66, "D"],
    [63, "D"],
    [62, "D-"],
    [60, "D-"],
    [59, "F"],
    [0, "F"],
  ];

  it.each(cases)("maps %i → %s", (score, letter) => {
    expect(scoreToGrade(score)).toBe(letter);
  });

  it("never returns anything but F for 0–59 (DoD invariant)", () => {
    for (let s = 0; s <= 59; s++) {
      expect(scoreToGrade(s)).toBe("F");
    }
  });

  it("never returns anything but C- for 70–72 (DoD invariant)", () => {
    for (let s = 70; s <= 72; s++) {
      expect(scoreToGrade(s)).toBe("C-");
    }
  });

  it("rounds to the nearest integer so the letter matches the displayed %", () => {
    expect(scoreToGrade(72.4)).toBe("C-"); // rounds to 72
    expect(scoreToGrade(72.6)).toBe("C"); // rounds to 73
    expect(scoreToGrade(59.4)).toBe("F"); // rounds to 59
    expect(scoreToGrade(59.5)).toBe("D-"); // rounds to 60
  });

  it("clamps out-of-range scores", () => {
    expect(scoreToGrade(105)).toBe("A");
    expect(scoreToGrade(-5)).toBe("F");
  });
});

describe("deriveGrade — guarded mapping for stringy/missing scores", () => {
  it("derives from numeric and numeric-string scores", () => {
    expect(deriveGrade(72)).toBe("C-");
    expect(deriveGrade("72")).toBe("C-");
    expect(deriveGrade("58")).toBe("F");
  });

  it("falls back when the score is missing or non-numeric", () => {
    expect(deriveGrade(null, "B")).toBe("B");
    expect(deriveGrade(undefined, "B-")).toBe("B-");
    expect(deriveGrade("not-a-number", "C")).toBe("C");
    expect(deriveGrade(NaN, "D")).toBe("D");
  });

  it("defaults the fallback to an empty string", () => {
    expect(deriveGrade(undefined)).toBe("");
  });
});
