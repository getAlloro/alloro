import { describe, expect, it } from "vitest";

import {
  formSubsTone,
  isMonthStale,
  monthDataAgeDays,
  monthsBehind,
  rankTone,
  referralStatus,
  reviewTone,
  STALE_GRACE_DAYS,
  TONE_COLOR,
  withFreshness,
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

/**
 * Freshness — the second half of UNKNOWN_IS_NOT_FINE.
 *
 * A tone is only as current as the data under it. These pin the age arithmetic
 * that decides whether a stage still gets to speak, including the two traps:
 * age runs from the END of a data month (not its start), and month keys are
 * never parsed with `new Date()` (the documented UTC-shift bug).
 */
describe("monthDataAgeDays — age from the END of the data month", () => {
  const JULY_22 = new Date("2026-07-22T12:00:00Z");

  it("measures from month-end, not month-start", () => {
    // June ends July 1 → 21 days old on July 22. Measuring from the START of June
    // would give 51 and wrongly age perfectly current data.
    expect(monthDataAgeDays("2026-06", JULY_22)).toBe(21);
    expect(monthDataAgeDays("2026-05", JULY_22)).toBe(51);
    expect(monthDataAgeDays("2026-01", JULY_22)).toBe(171);
  });

  it("accepts display-label keys, and never shifts the month via new Date()", () => {
    // `new Date("2026-06")` is UTC midnight and shifts backwards in western
    // timezones (timeframe.ts:34). parseYM must give the same answer either way.
    expect(monthDataAgeDays("Jun 2026", JULY_22)).toBe(
      monthDataAgeDays("2026-06", JULY_22),
    );
  });

  it("returns null for a missing key", () => {
    expect(monthDataAgeDays(null, JULY_22)).toBeNull();
    expect(monthDataAgeDays(undefined, JULY_22)).toBeNull();
  });
});

describe("isMonthStale — counted in whole months, not days", () => {
  /**
   * Counting months is what makes this insensitive to upload lag. A flat day
   * threshold assumes uploads land within a few days of month close; with a
   * two-week lag the newest file's age peaks past any 35-day line just before
   * the next upload, so a healthy client would be marked stale for part of every
   * month. These pin that this cannot happen.
   */
  it("accepts this month's and last month's data all month long", () => {
    for (const day of [1, 10, 11, 22, 28]) {
      const now = new Date(Date.UTC(2026, 6, day)); // July
      expect(isMonthStale("2026-07", now), `July data on Jul ${day}`).toBe(false);
      expect(isMonthStale("2026-06", now), `June data on Jul ${day}`).toBe(false);
    }
  });

  it("does NOT cry stale on a client whose books simply close late", () => {
    // 22-day lag: June's file lands ~July 23. Right before it arrives, May is the
    // newest data and is 51 days old — a flat 35-day rule would have flagged this
    // healthy client for over two weeks, every single month.
    const justBeforeJuneUpload = new Date(Date.UTC(2026, 6, 22));
    expect(monthDataAgeDays("2026-05", justBeforeJuneUpload)).toBeGreaterThan(35);
    expect(isMonthStale("2026-05", justBeforeJuneUpload)).toBe(true);
    // ...but the same client one month behind at the START of a month is fine:
    const earlyJuly = new Date(Date.UTC(2026, 6, 5));
    expect(isMonthStale("2026-05", earlyJuly)).toBe(false);
  });

  it("gives two-months-behind a grace window early in the month, then flags it", () => {
    const withinGrace = new Date(Date.UTC(2026, 6, STALE_GRACE_DAYS));
    const pastGrace = new Date(Date.UTC(2026, 6, STALE_GRACE_DAYS + 1));
    expect(isMonthStale("2026-05", withinGrace)).toBe(false);
    expect(isMonthStale("2026-05", pastGrace)).toBe(true);
  });

  it("always flags three or more months behind, even on the 1st", () => {
    const firstOfMonth = new Date(Date.UTC(2026, 6, 1));
    expect(isMonthStale("2026-04", firstOfMonth)).toBe(true);
    expect(isMonthStale("2026-01", firstOfMonth)).toBe(true);
  });

  it("flags the live incident: January data read in July", () => {
    expect(isMonthStale("2026-01", new Date("2026-07-22T12:00:00Z"))).toBe(true);
  });

  it("handles the December to January rollover", () => {
    const jan15 = new Date(Date.UTC(2026, 0, 15));
    expect(monthsBehind("2025-12", jan15)).toBe(1);
    expect(isMonthStale("2025-12", jan15)).toBe(false);
    expect(isMonthStale("2025-10", jan15)).toBe(true);
  });

  it("treats a missing month as stale, never as fresh", () => {
    const now = new Date("2026-07-22T12:00:00Z");
    expect(isMonthStale(null, now)).toBe(true);
    expect(isMonthStale(undefined, now)).toBe(true);
    expect(isMonthStale("", now)).toBe(true);
  });

  it("does not call future-dated data stale", () => {
    expect(isMonthStale("2026-08", new Date("2026-07-22T12:00:00Z"))).toBe(false);
  });
});

describe("withFreshness — stale data cannot hold a confident tone", () => {
  const JULY_22 = new Date("2026-07-22T12:00:00Z");

  it("downgrades a real positive tone to unknown when its month is stale", () => {
    // The live bug in one line: January referrals produced a genuine `positive`.
    expect(withFreshness("positive", "2026-01", JULY_22)).toBe("unknown");
  });

  it("leaves a fresh tone untouched", () => {
    expect(withFreshness("positive", "2026-06", JULY_22)).toBe("positive");
    expect(withFreshness("warn", "2026-06", JULY_22)).toBe("warn");
  });

  it("downgrades rather than escalates — staleness is not a claim of decline", () => {
    // `unknown`, never `warn`: we are not saying the stage got worse, only that
    // we cannot see it.
    expect(withFreshness("positive", "2026-01", JULY_22)).not.toBe("warn");
    expect(withFreshness("critical", "2026-01", JULY_22)).toBe("unknown");
  });
});
