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

export type StatusTone = "positive" | "warn" | "neutral";

/** Dot / status-text colors per tone (warm palette, matches focus cards). */
export const TONE_COLOR: Record<StatusTone, string> = {
  positive: "#4F8A5B",
  warn: "#C2891E",
  neutral: "#A8A192",
};

export interface CardStatus {
  text: string | null;
  tone: StatusTone;
}

/** Referrals: "healthy" when this month ≥ prior month, else "down". */
export function referralStatus(
  thisMonth: number | null,
  priorMonth: number | null,
): CardStatus {
  if (thisMonth === null) return { text: null, tone: "neutral" };
  if (priorMonth === null) return { text: "healthy", tone: "positive" };
  return thisMonth >= priorMonth
    ? { text: "healthy", tone: "positive" }
    : { text: "down", tone: "warn" };
}

/** Local rank: "post due" when the last GBP post is ≥ 30 days old (or unknown). */
export const POST_DUE_DAYS = 30;
export function localRankStatus(daysSinceLastPost: number | null): CardStatus {
  if (daysSinceLastPost === null || daysSinceLastPost >= POST_DUE_DAYS) {
    return { text: "post due", tone: "warn" };
  }
  return { text: "current", tone: "positive" };
}

/** Reviews: green at 4.5+, amber below, neutral when unknown. */
export const STRONG_RATING = 4.5;
export function reviewTone(rating: number | null): StatusTone {
  if (rating === null) return "neutral";
  return rating >= STRONG_RATING ? "positive" : "warn";
}

/** Form subs: green when any submissions this month, neutral when zero. */
export function formSubsTone(count: number | null): StatusTone {
  return count ? "positive" : "neutral";
}
