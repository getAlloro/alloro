import { describe, expect, it } from "vitest";

import {
  formSubsTone,
  rankTone,
  referralStatus,
  reviewTone,
  TONE_COLOR,
  type StatusTone,
} from "./statusRules";

/**
 * The honesty invariant these tests defend (PR #155 review, finding 1):
 *
 *   UNKNOWN and MEASURED-WEAK are different states and must stay different.
 *
 * Before this suite, every tone helper collapsed both into "neutral", and
 * buildHealthVerdict() treats neutral as "not measured" — so a practice ranked
 * #10 was excluded from the verdict and told it was healthy. A missing
 * measurement must never read as good news, and a bad measurement must never
 * read as a missing one.
 */

describe("rankTone — unknown vs measured-weak", () => {
  // Dave's exact cases: null / 1 / 3 / 4 / 10.
  it("returns unknown for a null position (no measurement, not good news)", () => {
    expect(rankTone(null)).toBe("unknown");
  });

  it("returns positive at position 1", () => {
    expect(rankTone(1)).toBe("positive");
  });

  it("returns positive at position 3 (edge of the strong band)", () => {
    expect(rankTone(3)).toBe("positive");
  });

  it("returns warn at position 4 (first measured-weak rank)", () => {
    expect(rankTone(4)).toBe("warn");
  });

  it("returns warn at position 10 — the exact case that read as healthy", () => {
    expect(rankTone(10)).toBe("warn");
  });

  it("never returns neutral for a known position — that would hide it from the verdict", () => {
    for (const position of [1, 2, 3, 4, 5, 10, 20, 100]) {
      expect(rankTone(position)).not.toBe("neutral");
      expect(rankTone(position)).not.toBe("unknown");
    }
  });

  it("treats a nonsense position (0, negative, NaN) as unknown, never as strong", () => {
    expect(rankTone(0)).toBe("unknown");
    expect(rankTone(-1)).toBe("unknown");
    expect(rankTone(Number.NaN)).toBe("unknown");
  });
});

describe("reviewTone — unknown vs measured-weak", () => {
  it("returns unknown when the rating is null", () => {
    expect(reviewTone(null)).toBe("unknown");
  });

  it("returns positive at 4.5+", () => {
    expect(reviewTone(4.5)).toBe("positive");
    expect(reviewTone(5)).toBe("positive");
  });

  it("returns warn between 3.0 and 4.5", () => {
    expect(reviewTone(3.0)).toBe("warn");
    expect(reviewTone(4.4)).toBe("warn");
  });

  it("returns critical below 3.0", () => {
    expect(reviewTone(2.9)).toBe("critical");
    expect(reviewTone(1)).toBe("critical");
  });
});

describe("formSubsTone — a measured zero is a gap, not a blank", () => {
  it("returns unknown when the count is null (nothing connected)", () => {
    expect(formSubsTone(null)).toBe("unknown");
  });

  it("returns warn on a measured zero — zero inquiries is a real leak, not 'no signal'", () => {
    expect(formSubsTone(0)).toBe("warn");
  });

  it("returns positive when submissions exist", () => {
    expect(formSubsTone(1)).toBe("positive");
    expect(formSubsTone(42)).toBe("positive");
  });
});

describe("referralStatus — unknown vs measured-flat", () => {
  it("returns unknown when either month is missing", () => {
    expect(referralStatus(null, 5).tone).toBe("unknown");
    expect(referralStatus(5, null).tone).toBe("unknown");
    expect(referralStatus(null, null).tone).toBe("unknown");
  });

  it("returns a measured-flat neutral (not unknown) when the months are equal", () => {
    const status = referralStatus(5, 5);
    expect(status.tone).toBe("neutral");
    expect(status.text).toBe("no change");
  });

  it("returns positive with a signed delta when referrals rose", () => {
    expect(referralStatus(36, 5)).toEqual({ text: "31 up", tone: "positive" });
  });

  it("returns warn with a signed delta when referrals fell", () => {
    expect(referralStatus(5, 36)).toEqual({ text: "31 down", tone: "warn" });
  });
});

describe("TONE_COLOR", () => {
  it("has a color for every tone, including unknown", () => {
    const tones: StatusTone[] = [
      "positive",
      "warn",
      "critical",
      "neutral",
      "unknown",
    ];
    for (const tone of tones) {
      expect(TONE_COLOR[tone]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
