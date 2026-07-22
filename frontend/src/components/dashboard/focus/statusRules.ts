/**
 * statusRules — pure helpers that derive the Practice Hub stat-card status
 * label + dot tone from raw metric values.
 *
 * Centralized so every threshold lives in ONE tunable place. These are
 * client-side heuristics, NOT product-defined health bands. If the product
 * later defines real thresholds they belong server-side in the
 * dashboard-metrics dictionary, not here.
 *
 * Spec: plans/06092026-practice-hub-simplification/spec.html (T3)
 */

import { parseYM } from "../../PMS/dashboard/pmsPeriod";

/**
 * Status tones.
 *
 * `unknown` and `neutral` render identically (stone) but mean OPPOSITE things,
 * and the difference is load-bearing — see UNKNOWN_IS_NOT_FINE below.
 *
 *   unknown = we have NO measurement. We cannot say anything about this stage.
 *   neutral = we DID measure, and the result is genuinely unremarkable.
 */
export type StatusTone =
  | "positive"
  | "warn"
  | "critical"
  | "neutral"
  | "unknown";

/**
 * UNKNOWN_IS_NOT_FINE — the honesty invariant of this file.
 *
 * "I don't know" and "you're fine" are different answers, and collapsing the
 * first into the second is fabricated reassurance to an owner about his own
 * business. So:
 *
 *   - A missing measurement is `unknown`. It NEVER reads as good news, and it
 *     never lets a verdict claim an all-clear it did not earn.
 *   - A measurement we can see is weak is `warn`/`critical`. It NEVER hides
 *     inside `neutral`, where the verdict would skip it as "not measured".
 *
 * This is the bug PR #155 was reviewed for: rankTone() mapped every position
 * below 3 to `neutral`, buildHealthVerdict() skipped `neutral` as unmeasured,
 * and a practice ranked #10 was told it was healthy. Keep the two states
 * distinct in every helper here, forever.
 */

/**
 * STALE_AFTER_DAYS — how old a stage's data may be before its tone stops
 * meaning anything.
 *
 * Why 35: monthly PMS data lands a few weeks after a month closes, so on July 22
 * the June file (~22 days past month-end) is normal and healthy, while May
 * (~52 days) means a feed has stopped. 35 sits in that gap — past a full month
 * of ordinary lag, short of two.
 *
 * The bug this exists to kill: a practice whose PMS feed stopped in January was
 * told "your practice is healthy this month", because January's referral count
 * still produced a perfectly real `positive` tone and nothing checked its age.
 * This is the freshness half of UNKNOWN_IS_NOT_FINE — old data is not a
 * measurement of now, it is the absence of one. Tunable heuristic, not a product
 * band (see the file header).
 */
export const STALE_AFTER_DAYS = 35;

const MS_PER_DAY = 86_400_000;

/**
 * Days elapsed since the END of a data month — NOT since its start, and NOT
 * since it was uploaded.
 *
 * End-of-month is the only honest anchor: June's data is complete on June 30, so
 * on July 22 it is ~22 days old (fresh), while May is ~52 (stale). Measuring
 * from the start of the month would age June by 52 days and condemn data that is
 * perfectly current.
 *
 * Built from parseYM, never `new Date(monthKey)` — that parses "2026-05" as UTC
 * midnight and shifts the month backwards in western timezones (the documented
 * bug at timeframe.ts:34). Returns null for an unreadable key, which callers must
 * treat as unknown age, never as fresh.
 */
export function monthDataAgeDays(
  monthKey: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!monthKey) return null;
  const p = parseYM(monthKey);
  if (!p || p.month < 1 || p.month > 12) return null;
  // Day 1 of the NEXT month = the instant this one ends, in UTC.
  const monthEnd = Date.UTC(p.year, p.month, 1);
  return Math.floor((now.getTime() - monthEnd) / MS_PER_DAY);
}

/**
 * Is this month's data too old to say anything about now?
 *
 * A missing or unreadable month counts as stale: we will not show a confident
 * tone on data whose age we cannot establish (abstain over guess). A future-dated
 * month has a negative age and is not stale.
 */
export function isMonthStale(
  monthKey: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const age = monthDataAgeDays(monthKey, now);
  if (age === null) return true;
  return age > STALE_AFTER_DAYS;
}

/**
 * The freshness gate: a tone derived from stale data becomes `unknown`.
 *
 * `unknown` is the right downgrade rather than `warn` — we are not claiming the
 * stage got worse, only that we cannot see it. Downstream, buildHealthVerdict
 * drops `unknown` stages from `measured`. That kills the FULL all-clear, but not
 * the hedged one — see the staleNote branch in verdict.ts, which the falsifier
 * test caught.
 */
export function withFreshness(
  tone: StatusTone,
  monthKey: string | null | undefined,
  now: Date = new Date(),
): StatusTone {
  return isMonthStale(monthKey, now) ? "unknown" : tone;
}

/**
 * Dot / status-text colors per tone (warm palette, matches focus cards).
 *
 * App-wide status language (plans/06112026-design-consistency-pass):
 *   positive (green)  = healthy / current / on track
 *   warn     (yellow) = needs attention soon
 *   critical (red)    = overdue / failing — act now
 *   neutral  (stone)  = measured, unremarkable
 *   unknown  (stone)  = no signal yet — we cannot say
 * Every hub's status dot imports from here — no ad-hoc dot colors.
 */
export const TONE_COLOR: Record<StatusTone, string> = {
  positive: "#4F8A5B",
  warn: "#C2891E",
  critical: "#B0382E",
  neutral: "#A8A192",
  unknown: "#A8A192",
};

export interface CardStatus {
  text: string | null;
  tone: StatusTone;
}

/**
 * Referrals: signed delta vs the prior month — "31 up" (positive) or
 * "31 down" (warn) — so owners see HOW MUCH it moved, not just a word
 * (dashboard feedback). Neutral with no label when the count is unknown,
 * there is no prior month to compare, or the two months are equal.
 */
export function referralStatus(
  thisMonth: number | null,
  priorMonth: number | null,
): CardStatus {
  if (thisMonth === null || priorMonth === null) {
    // No count, or no prior month to compare — unknown, not "fine".
    return { text: null, tone: "unknown" };
  }
  const delta = thisMonth - priorMonth;
  if (delta === 0) return { text: "no change", tone: "neutral" };
  return delta > 0
    ? { text: `${delta} up`, tone: "positive" }
    : { text: `${Math.abs(delta)} down`, tone: "warn" };
}

/**
 * Findable tone from REAL local rank position.
 *
 *   null / nonsense → unknown  (we have no position; say nothing)
 *   1..3            → positive (in the map pack)
 *   4+              → warn     (measured, and measured WEAK)
 *
 * The earlier version returned `neutral` for 4+ so the verdict would not flag a
 * get-found gap we have no honest lever for (post-recency is NOT a rank signal:
 * posts convert, they don't rank — Sterling Sky / lever-evidence-map). But
 * silence about a weak rank is not neutrality — the verdict read it as
 * "unmeasured" and told a #10 practice it was healthy.
 *
 * The lever problem is real; hiding the measurement was the wrong fix. We now
 * report the weak rank honestly and let the verdict name the gap WITHOUT
 * promising a move (see STAGE_HAS_HONEST_MOVE in verdict.ts). Naming a problem
 * you can't yet fix is honest; pretending you can't see it is not.
 */
export const RANK_STRONG = 3;
export function rankTone(position: number | null): StatusTone {
  if (position === null || !Number.isFinite(position) || position < 1) {
    return "unknown";
  }
  return position <= RANK_STRONG ? "positive" : "warn";
}

/** Reviews: green at 4.5+, amber below, RED below 3.0, unknown when unmeasured. */
export const STRONG_RATING = 4.5;
// Below this, a low rating is a real problem, not a "minor gap" — it must escalate
// to critical so the verdict cannot call a 2-star practice "Healthy overall"
// (pressure-test 2026-07-13: the verdict's `critical` branch was dead code because
// no tone ever emitted it). Tunable heuristic, not a product band (see file header).
export const CRITICAL_RATING = 3.0;
export function reviewTone(rating: number | null): StatusTone {
  if (rating === null || !Number.isFinite(rating)) return "unknown";
  if (rating < CRITICAL_RATING) return "critical";
  return rating >= STRONG_RATING ? "positive" : "warn";
}

/**
 * Form subs (Bookable):
 *
 *   null → unknown  (nothing connected — we cannot say)
 *   0    → warn     (a MEASURED zero: no one asked to book this month)
 *   1+   → positive
 *
 * The earlier `count ? "positive" : "neutral"` folded a measured zero into the
 * same bucket as "no data", so the verdict skipped it and could call a practice
 * with zero inquiries healthy. A zero we actually measured is the Bookable leak
 * the verdict exists to catch — the same UNKNOWN_IS_NOT_FINE bug as rank.
 *
 * Warning on 0 is only honest because null and 0 genuinely differ upstream, so
 * this will not cry wolf at a practice that simply has no forms:
 *   - No website project → GET .../form-submissions/timeseries 404s
 *     (formSubmissionHandlers.ts: `if (!project) return res.status(404)`), the
 *     api client throws, React Query has no data, callers pass `null` → unknown.
 *   - Has a website, no submissions this month → the service zero-fills every
 *     month in the range (formSubmissions.service.ts getSubmissionsTimeseries),
 *     so `total` is a real, measured 0 → warn.
 */
export function formSubsTone(count: number | null): StatusTone {
  if (count === null || !Number.isFinite(count)) return "unknown";
  return count > 0 ? "positive" : "warn";
}
