/**
 * rankingsHubDerivation — pure, testable derivations behind the Local Rankings
 * hero and vitals.
 *
 * Extracted from RankingsHubSurface so the honesty rules can be unit-tested
 * without rendering. Every function here answers a gauge question, and the
 * discipline is the same one statusRules.ts states: a value we did not measure
 * is never shown as a measured one.
 */

// The SAME shared freshness guard the focus dashboard uses (invariant I2 — one
// code path, never re-implemented per surface). A rank is a latest-snapshot: if
// the ranking run that produced it stopped months ago, "#4" reads as current
// when it is not. isMonthStale answers that on month cadence.
import { isMonthStale } from "../focus/statusRules";

/** The client's Maps rank, and — only when it shares a universe — a denominator. */
export interface RankDisplay {
  /**
   * True when the ranking run placed the practice with a confirmed status
   * (searchStatus "ok" + a non-null position). Note: an "ok" position can come
   * from the Places-text fallback, not only SerpApi Maps — the hero does not yet
   * distinguish the source (a known follow-up), so `show` means "placed", not
   * "placed by SerpApi Maps".
   */
  show: boolean;
  position: number | null;
  /**
   * Total businesses in the SAME SerpApi result the position came from, or null
   * when we cannot pair honestly. Never the curated competitor count.
   */
  outOf: number | null;
  /**
   * True when the run behind this position is 2+ whole months old (the same
   * month-cadence staleness the focus surface applies via isMonthStale). The
   * rank still shows — the surface strips its confident color and dates it —
   * because hiding it entirely would lose a real, if old, measurement.
   */
  stale: boolean;
  /** The check date behind the shown position (searchCheckedAt), or null. */
  checkedAt: string | null;
}

interface RankResultInput {
  searchStatus: "ok" | "not_in_top_20" | "bias_unavailable" | "api_error" | null;
  searchPosition: number | null;
  /** The full SerpApi Maps result set, client included (isClient). */
  searchResults: Array<{ isClient?: boolean }> | null;
  /** When the shown position was last checked — the freshness anchor. */
  searchCheckedAt: string | null;
}

/**
 * Resolve the "#N of M" hero.
 *
 * Two rules, both from the canonical reader (stageReaders.readRank, which
 * carries NO denominator precisely because the counts don't share a universe):
 *
 *  1. A rank shows ONLY when searchStatus is exactly "ok". The component used to
 *     default a null status to "ok" (`searchStatus ?? "ok"`), which prints a
 *     confident rank on data whose status we never confirmed.
 *  2. The denominator is the SerpApi result count — the same universe the
 *     position was measured in — NEVER the curated competitor set
 *     (selectedCompetitorSearchResults / totalCompetitors). Pairing a SerpApi
 *     position (#4 of the 20 businesses on the map) with a curated count (5
 *     tracked rivals) produces "#4 of 6", which is not a fact about anything.
 *     When the SerpApi set is missing or inconsistent, the rank shows alone.
 */
export function resolveRankDisplay(result: RankResultInput): RankDisplay {
  if (result.searchStatus !== "ok" || result.searchPosition === null) {
    return { show: false, position: null, outOf: null, stale: false, checkedAt: null };
  }

  const position = result.searchPosition;
  const universe = Array.isArray(result.searchResults)
    ? result.searchResults.length
    : null;

  // Pair only when the count could contain this position AND there is more than
  // one business in it. A universe smaller than the rank is corrupt data; a
  // universe of exactly 1 gives "#1 of 1 nearby", where the "1 nearby" is the
  // practice itself — absurd, so show the rank alone.
  const outOf = universe !== null && universe > 1 && universe >= position ? universe : null;

  // Only call it stale when there IS a readable check date. A null or empty date
  // is "unknown age", not "old" — inventing staleness there would hide a fresh
  // rank behind a missing timestamp (and mute it with no caption, since the
  // caption gates on a truthy date). Mirrors useStageTones' own
  // `latestMonth != null && isMonthStale(...)` discipline.
  const checkedAt = result.searchCheckedAt;
  const stale = Boolean(checkedAt) && isMonthStale(checkedAt);

  return { show: true, position, outOf, stale, checkedAt };
}

/**
 * Average Google rating across the competitor set, or null when there is none.
 *
 * Two fixes over the old inline math:
 *  - returns null (→ "—" in the UI) instead of the invented constant 4.5 when
 *    there are no competitors to average;
 *  - SKIPS a competitor with no rating instead of folding it in as 0, which
 *    dragged the "market" average toward zero for every unrated listing.
 */
export function resolveMarketRating(
  competitors: Array<{ averageRating?: number | null }>,
): number | null {
  const rated = competitors
    .map((c) => c.averageRating)
    .filter((r): r is number => typeof r === "number" && Number.isFinite(r) && r > 0);

  if (rated.length === 0) return null;
  return rated.reduce((sum, r) => sum + r, 0) / rated.length;
}

/**
 * The "Rating vs Market" cell, honest on both sides.
 * Renders a market figure only when one was actually computed.
 */
export function formatRatingVsMarket(
  avgRating: number | null,
  marketAvgRating: number | null,
): string {
  if (avgRating === null) return "—";
  const market = marketAvgRating === null ? "—" : marketAvgRating.toFixed(1);
  return `${avgRating.toFixed(1)} / ${market}`;
}

/**
 * 30-day review velocity: the measured count, or null when the scrape carried
 * none. The old `?? 0` rendered a hard "0 reviews last 30 days" over absent
 * data — a measured claim about a number we never had.
 */
export function resolveReviewsLast30d(
  clientGbp: { reviewsLast30d?: number | null } | null,
): number | null {
  const value = clientGbp?.reviewsLast30d;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
