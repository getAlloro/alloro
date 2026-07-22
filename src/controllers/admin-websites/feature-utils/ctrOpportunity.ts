import type { GscDimensionRow } from "../feature-services/service.gsc-performance";

/**
 * CTR-opportunity diagnosis — brick 1 of the CTR self-optimization loop
 * (diagnose → educated hypothesis → recorded experiment → fleet learning).
 *
 * It finds pages that are SEEN a lot but UNDER-CLICKED *for where they already
 * rank* — the pages where a sharper title/description wins clicks from demand that
 * already exists, with no new ranking required (the fast, existing-demand lever).
 *
 * Honest by construction: it flags only REAL measured gaps against a baseline, never
 * a manufactured one, and returns [] when there is no gap. It reads GSC data; it
 * never invents an impression or a click.
 *
 * The `expectedCtr` here is a STATIC public CTR-by-position baseline — the day-1
 * stand-in. Brick 4 (the fleet learning ledger) will replace it with an expected-CTR
 * learned from real fleet outcomes by vertical/intent; the diagnosis contract does
 * not change when that lands, only the source of `expectedCtr`.
 */

/**
 * Organic CTR-by-position baseline (blended desktop+mobile, rounded from public
 * aggregate studies — Advanced Web Ranking / Backlinko class). Baseline only: it is
 * the "expected click-through for where you already rank," not a per-site claim.
 */
const EXPECTED_CTR_BY_POSITION: Record<number, number> = {
  1: 0.28,
  2: 0.15,
  3: 0.11,
  4: 0.08,
  5: 0.06,
  6: 0.05,
  7: 0.04,
  8: 0.033,
  9: 0.028,
  10: 0.025,
};
/** Positions 11–20 (page 2): ~1%. Beyond that, ranking — not the title — is the lever. */
const PAGE_TWO_CTR = 0.01;

export function expectedCtrForPosition(position: number): number {
  if (position <= 0) return 0;
  const rounded = Math.round(position);
  if (rounded <= 10) return EXPECTED_CTR_BY_POSITION[Math.max(1, rounded)];
  if (rounded <= 20) return PAGE_TWO_CTR;
  return 0; // beyond page 2, a title rewrite can't win clicks — the gate is ranking
}

export interface CtrOpportunity {
  /** The page path/URL (the GSC dimension key). */
  page: string;
  impressions: number;
  clicks: number;
  /** Measured click-through (fraction, e.g. 0.04), straight from GSC. */
  actualCtr: number;
  /** Baseline click-through for this page's rank (see module note). */
  expectedCtr: number;
  position: number;
  /**
   * Estimated extra clicks over the measured window if CTR reached the baseline —
   * the "clicks left on the table." This is the ranking key: biggest win first.
   */
  missedClicks: number;
}

export interface FindCtrOpportunitiesOptions {
  /** Skip pages below this many impressions — too little demand to matter (default 100). */
  minImpressions?: number;
  /** Only flag when actual CTR is at least this far below the baseline (default 0.02). */
  minCtrGap?: number;
  /** Cap the returned list (default 20). */
  limit?: number;
}

export function findCtrOpportunities(
  topPages: GscDimensionRow[],
  options: FindCtrOpportunitiesOptions = {},
): CtrOpportunity[] {
  const minImpressions = options.minImpressions ?? 100;
  const minCtrGap = options.minCtrGap ?? 0.02;
  const limit = options.limit ?? 20;

  const opportunities: CtrOpportunity[] = [];
  for (const row of topPages) {
    if (row.impressions < minImpressions) continue; // not enough demand to be worth it
    const expectedCtr = expectedCtrForPosition(row.position);
    if (expectedCtr <= 0) continue; // page 3+: ranking is the lever, not the title
    const gap = expectedCtr - row.ctr;
    if (gap < minCtrGap) continue; // already at/above baseline — no CTR opportunity here
    opportunities.push({
      page: row.key,
      impressions: row.impressions,
      clicks: row.clicks,
      actualCtr: row.ctr,
      expectedCtr,
      position: row.position,
      missedClicks: Math.round(row.impressions * gap),
    });
  }
  opportunities.sort((a, b) => b.missedClicks - a.missedClicks);
  return opportunities.slice(0, limit);
}
