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

export type StatusTone = "positive" | "warn" | "critical" | "neutral";

/**
 * Dot / status-text colors per tone (warm palette, matches focus cards).
 *
 * App-wide status language (plans/06112026-design-consistency-pass):
 *   positive (green)  = healthy / current / on track
 *   warn     (yellow) = needs attention soon
 *   critical (red)    = overdue / failing — act now
 *   neutral  (stone)  = no signal yet
 * Every hub's status dot imports from here — no ad-hoc dot colors.
 */
export const TONE_COLOR: Record<StatusTone, string> = {
  positive: "#4F8A5B",
  warn: "#C2891E",
  critical: "#B0382E",
  neutral: "#A8A192",
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
    return { text: null, tone: "neutral" };
  }
  const delta = thisMonth - priorMonth;
  if (delta === 0) return { text: "no change", tone: "neutral" };
  return delta > 0
    ? { text: `${delta} up`, tone: "positive" }
    : { text: `${Math.abs(delta)} down`, tone: "warn" };
}

/**
 * Findable (get-found) tone from REAL local rank position. A strong map-pack
 * position reads positive; anything else stays NEUTRAL — we never flag a
 * get-found "gap + move" we can't honestly deliver yet, and post-recency is NOT a
 * rank signal (posts convert, they don't rank — Sterling Sky / lever-evidence-map).
 * A null position is unknown, which is also neutral.
 */
export const RANK_STRONG = 3;
export function rankTone(position: number | null): StatusTone {
  if (position === null) return "neutral";
  return position >= 1 && position <= RANK_STRONG ? "positive" : "neutral";
}

/** Reviews: green at 4.5+, amber below, RED below 3.0, neutral when unknown. */
export const STRONG_RATING = 4.5;
// Below this, a low rating is a real problem, not a "minor gap" — it must escalate
// to critical so the verdict cannot call a 2-star practice "Healthy overall"
// (pressure-test 2026-07-13: the verdict's `critical` branch was dead code because
// no tone ever emitted it). Tunable heuristic, not a product band (see file header).
export const CRITICAL_RATING = 3.0;
export function reviewTone(rating: number | null): StatusTone {
  if (rating === null) return "neutral";
  if (rating < CRITICAL_RATING) return "critical";
  return rating >= STRONG_RATING ? "positive" : "warn";
}

/** Form subs: green when any submissions this month, neutral when zero. */
export function formSubsTone(count: number | null): StatusTone {
  return count ? "positive" : "neutral";
}
