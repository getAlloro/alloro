/**
 * E2 — pure attributed-lift measurement (proving-simulation spec T3, Rev 4).
 *
 * ⛔ THIS MEASURES CLICK-THROUGH RATE, AND ONLY CLICK-THROUGH RATE.
 *
 * Impressions enter solely as the DENOMINATOR. That makes this the wrong instrument for
 * any action whose goal is to raise impressions — and pointing it at one yields a confident
 * verdict in the WRONG DIRECTION, which is worse than no verdict at all. Demonstrated by
 * adversary review: impressions ×3 with clicks +80% (CTR 5% → 3%) returns `trending_down`,
 * the engine blaming a get-found action that in fact worked.
 *
 * Before wiring this to live data:
 *  1. NEVER point it at an impressions-targeted action (a GBP completeness fill, a primary-
 *     category change). Those need an impressions mode this file does not have. Note that
 *     `metricActions.ts` declares an IMPRESSIONS stage/metric — the config is broader than
 *     this engine, and the config does not license the wiring.
 *  2. NEVER feed it org-wide GBP impressions to score a SINGLE-LOCATION change. The
 *     untreated locations dilute the treated series, so a real local move shrinks toward
 *     zero and reads as "no detectable change" (the org-wide constraint from #183). Treated
 *     and control series must both be scoped to exactly what the action touched.
 *  3. NEVER pass "today" as `dataEndDate` when Search Console lag exceeds the trailing-day
 *     guard — fresh days under-report clicks and manufacture a false `trending_down`.
 *
 * No DB access, no model calls — takes an action's intervention date plus the daily
 * metric series (treated pages, and untreated pages as an OPTIONAL within-site control)
 * and returns an ORDINAL verdict: not enough data / no detectable change / trending up /
 * trending down. It NEVER emits a causal point estimate (spec D5).
 *
 * Honesty guarantee (hardened over three adversary rounds):
 *  - Uncertainty is count-based: the observed change uses the RAW rate, but the error band
 *    uses the Agresti–Coull variance p̃(1−p̃)/(N+4), which stays POSITIVE at 0 or all clicks,
 *    so a quiet window is never "perfectly certain". The band self-widens as views thin, and
 *    the confidence bar (BAND_Z, ~1% chance-crossing in the middle, ~3% at the 0-click edge)
 *    keeps almost every chance run at a thin window from crossing it.
 *  - The treated pages must ACTUALLY have moved — materially and beyond noise — before
 *    anything is attributed. A control can only ADJUST for a shared trend; it can never
 *    invent a treated move, and a flat control CONFIRMS a real move rather than burying it.
 *  - The baseline must be verified stable FIRST (before ITS or DiD); a moving baseline is
 *    not attributable by any single-site method, so it abstains.
 *  - Missing days are unknown (reduce coverage → widen the band → abstain), never a 0% CTR.
 *    Malformed days (clicks>impressions, non-finite) are dropped everywhere — including the
 *    stationarity guard — so corrupt data can never blind a check while arming the verdict.
 *  - Windows come from actual coverage, so a new business with no baseline is "not enough
 *    data" structurally.
 *
 * Known residual limits (why the surface stays DARK until real-data calibration): a gradual
 * sub-threshold pre-trend can still evade the stationarity guard (fundamental to single-site
 * ITS), and BAND_Z is a per-measurement bar with no fleet-wide multiple-testing correction
 * yet. Both are documented in the spec and are calibration/enable gates, not shipped claims.
 */

import {
  ATTRIBUTION,
  type AttributionRung,
} from "../../../config/metricActions";

export type { AttributionRung };

export interface DailyMetricPoint {
  /** YYYY-MM-DD (UTC). Lexicographic order is chronological order. */
  date: string;
  impressions: number;
  clicks: number;
}

export interface AttributionInput {
  /** Aggregated daily series for the pages the action touched. */
  treated: DailyMetricPoint[];
  /** Aggregated daily series for untreated pages of the same project; [] = no control. */
  control: DailyMetricPoint[];
  /** The day the action took effect (YYYY-MM-DD). Pre = strictly before; post = on/after. */
  interventionDate: string;
  /** The last date with any GSC coverage; trailing unsettled days are dropped from it. */
  dataEndDate: string;
}

export interface AttributionVerdict {
  rung: AttributionRung;
  /** The method that produced the verdict. */
  method: "did" | "its" | "none";
  /** The confound this design cannot rule out; always set for up/down, else null. */
  confound: string | null;
  /** Why the rung is what it is (especially "not_enough_data": blind vs measured-null). */
  reason: string;
  // Intentionally NO numeric magnitude field: v1 cannot carry a causal number (D5).
}

const CONFOUND_WITH_CONTROL =
  "A within-site control (page-vs-page) was used, but a change hitting only the treated pages in the same window cannot be fully separated out.";
// "did not move DETECTABLY", not "did not move": a smaller control has a wider noise band,
// so a shared site-wide shift can move it by the same relative amount and still land inside
// that band. Saying it "did not move" would state as fact something the data cannot show —
// and that case is exactly when a seasonal shift leaks through as attribution.
const CONFOUND_CONTROL_FLAT =
  "A within-site control was checked and did not move detectably, but within-site confirmation is inherently weak (a change affecting only the treated pages is never fully excluded, and a control with fewer views can move without clearing its own noise band); single-practice measurement can't fully separate this from market shifts.";
const CONFOUND_CONTROL_OPPOSITE =
  "A within-site control moved the other way, which strengthens this reading, though single-practice measurement can't fully separate it from market shifts.";
const CONFOUND_NO_CONTROL =
  "No within-site control was available, so single-practice measurement cannot fully separate this from market shifts such as a Google update or seasonality.";
const CONFOUND_CONTROL_UNRELIABLE =
  "A within-site control was provided but wasn't stable or large enough to trust, so this couldn't be cross-checked against a shared market shift.";
const REASON_DIRECTION =
  "The treated pages moved beyond the day-to-day noise for this volume and past the bar for a meaningful move.";
const REASON_NETTED =
  "Once the shared, site-wide shift is removed, the treated pages moved no differently.";
const REASON_UNDERPERFORMED =
  "The treated pages rose, but by less than the wider site, so no gain can be credited to the change.";
const REASON_CUSHIONED =
  "The treated pages fell, but by less than the wider site — the change appears to have cushioned them, though a raw rise wasn't seen.";
const REASON_NULL =
  "There were enough views to detect a meaningful move, and none showed up beyond normal day-to-day noise.";
const REASON_IMMATERIAL =
  "The treated pages moved slightly, but not by a meaningful amount.";
const REASON_DID_IMMATERIAL =
  "Once the shared, site-wide shift is removed, the treated pages moved only slightly — not by a meaningful amount.";
const REASON_BLIND =
  "Too few views to detect a meaningful change at this volume — no verdict is offered (blind, not 'no change').";
const REASON_BAD_DATES =
  "The dates on this data couldn't be read, so no verdict is offered rather than risk measuring the wrong window.";
const REASON_DUP_DATES =
  "The same day appears more than once in this data, so it can't be trusted to measure against — no verdict is offered.";

interface WindowCounts {
  clicks: number;
  impressions: number;
  /** Days that carry usable impressions (unknown/zero/malformed days are not counted). */
  days: number;
}

/**
 * A day is usable only if its date is a real YYYY-MM-DD, it is finite, has impressions, and
 * clicks are within [0, impressions]. Validating the point date (not just the request dates)
 * drops a malformed/impossible/format-variant row — e.g. "2026-06-05 " or "2026-02-30" — so a
 * JOIN emitting variant rows can't double-count a day or count an impossible one.
 */
function isUsableDay(p: DailyMetricPoint): boolean {
  return (
    isValidIsoDate(p.date) &&
    Number.isFinite(p.impressions) &&
    Number.isFinite(p.clicks) &&
    p.impressions > 0 &&
    p.clicks >= 0 &&
    p.clicks <= p.impressions
  );
}

/** Sum clicks/impressions over the usable days of a window (missing/malformed ≠ 0% CTR). */
function windowCounts(points: DailyMetricPoint[]): WindowCounts {
  let clicks = 0;
  let impressions = 0;
  let days = 0;
  for (const p of points) {
    if (!isUsableDay(p)) continue;
    clicks += p.clicks;
    impressions += p.impressions;
    days += 1;
  }
  return { clicks, impressions, days };
}

/** Observed (raw) CTR — the honest point estimate for the direction of a move. */
function ctrOf(w: WindowCounts): number {
  return w.impressions > 0 ? w.clicks / w.impressions : 0;
}

/**
 * Agresti–Coull variance of a window's CTR: p̃(1−p̃)/(N+4), p̃=(clicks+2)/(N+4). Positive at
 * 0 and all clicks, so a thin/quiet window is uncertain rather than "perfectly certain".
 * No coverage → infinite uncertainty, which can only widen the band toward abstain.
 */
function ctrVariance(w: WindowCounts): number {
  if (w.impressions <= 0) return Number.POSITIVE_INFINITY;
  const nTilde = w.impressions + 4;
  const pTilde = (w.clicks + 2) / nTilde;
  return (pTilde * (1 - pTilde)) / nTilde;
}

/** The Z×SE noise band for a difference of two window CTRs. */
function bandFor(...windows: WindowCounts[]): number {
  const variance = windows.reduce((sum, w) => sum + ctrVariance(w), 0);
  return ATTRIBUTION.BAND_Z * Math.sqrt(variance);
}

/**
 * What counts as a material move: the larger of a fixed fraction of the baseline CTR
 * (relative) and a tiny absolute floor (so a ~0 baseline can't make everything material).
 */
function materialityOf(baselineCtr: number): number {
  return Math.max(
    ATTRIBUTION.MATERIAL_RELATIVE_FRACTION * baselineCtr,
    ATTRIBUTION.MATERIAL_ABSOLUTE_MIN,
  );
}

/**
 * A well-formed, REAL YYYY-MM-DD date. Round-trips through UTC so an impossible date the
 * legacy parser silently rolls over (e.g. "2026-02-30" → Mar 2) is rejected, not accepted.
 */
function isValidIsoDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/** True when two or more rows share a calendar date (violates the aggregated-daily contract). */
function hasDuplicateDates(points: DailyMetricPoint[]): boolean {
  const seen = new Set<string>();
  for (const p of points) {
    if (seen.has(p.date)) return true;
    seen.add(p.date);
  }
  return false;
}

/** Chronological sort by date string (lexicographic = chronological for YYYY-MM-DD). */
function byDate(a: DailyMetricPoint, b: DailyMetricPoint): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
}

/** Subtract N days from a YYYY-MM-DD date, in UTC, returning YYYY-MM-DD. */
function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d - days));
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

interface Split {
  pre: DailyMetricPoint[];
  post: DailyMetricPoint[];
}

/** Split a series into pre/post around the intervention, dropping trailing unsettled days. */
function splitAroundIntervention(
  series: DailyMetricPoint[],
  interventionDate: string,
  cutoffDate: string,
): Split {
  const settled = series.filter((p) => p.date <= cutoffDate);
  return {
    pre: settled.filter((p) => p.date < interventionDate),
    post: settled.filter((p) => p.date >= interventionDate),
  };
}

function notEnoughData(reason: string): AttributionVerdict {
  return { rung: "not_enough_data", method: "none", confound: null, reason };
}

function direction(
  diff: number,
  method: "did" | "its",
  confound: string,
): AttributionVerdict {
  return {
    rung: diff > 0 ? "trending_up" : "trending_down",
    method,
    confound,
    reason: REASON_DIRECTION,
  };
}

/** Whether two segments' CTRs differ beyond their combined noise. Empty segment → can't verify → differ. */
function segmentsDiffer(a: WindowCounts, b: WindowCounts): boolean {
  if (a.impressions <= 0 || b.impressions <= 0) return true;
  return Math.abs(ctrOf(a) - ctrOf(b)) > bandFor(a, b);
}

/**
 * Is the pre-window non-stationary — so a single series can't tell the action apart from a
 * trend already underway? Splits the USABLE pre-days into thirds and flags any pair —
 * adjacent OR first-vs-last — that differs beyond noise (first-vs-last catches a gradual
 * monotone drift that adjacent thirds average out; thirds catch a V/∧). Too few pre-days to
 * check, or a corrupt/empty segment, is itself treated as non-stationary (abstain).
 */
function preWindowNonStationary(prePoints: DailyMetricPoint[]): boolean {
  const usable = prePoints.filter(isUsableDay);
  if (usable.length < ATTRIBUTION.MIN_PRE_DAYS_FOR_STATIONARITY) return true;
  const third = Math.floor(usable.length / 3);
  const s1 = windowCounts(usable.slice(0, third));
  const s2 = windowCounts(usable.slice(third, 2 * third));
  const s3 = windowCounts(usable.slice(2 * third));
  return (
    segmentsDiffer(s1, s2) || segmentsDiffer(s2, s3) || segmentsDiffer(s1, s3)
  );
}

/**
 * Whether a control clears the gate to be trusted for DiD: an absolute volume floor, AND
 * comparability to the treated set (so a scrawny control can't flood the error), AND a
 * stable baseline of its own.
 */
function controlQualifies(
  control: Split,
  cPre: WindowCounts,
  cPost: WindowCounts,
  tPre: WindowCounts,
  tPost: WindowCounts,
): boolean {
  const comparable =
    ATTRIBUTION.CONTROL_MIN_FRACTION_OF_TREATED * Math.min(tPre.impressions, tPost.impressions);
  return (
    cPre.impressions >= ATTRIBUTION.MIN_CONTROL_IMPRESSIONS &&
    cPost.impressions >= ATTRIBUTION.MIN_CONTROL_IMPRESSIONS &&
    cPre.impressions >= comparable &&
    cPost.impressions >= comparable &&
    !preWindowNonStationary(control.pre)
  );
}

/**
 * Measure whether an action moved the metric, honestly. Returns exactly one verdict rung
 * and, for a directional verdict, the confound the design cannot rule out. Never returns a
 * causal magnitude. See the module header for the method and the honesty guarantee.
 */
export function measureCtrAttribution(input: AttributionInput): AttributionVerdict {
  // Unreadable dates would poison the settling cutoff (NaN sorts before every real date and
  // disables the unsettled-day guard) — abstain rather than measure the wrong window.
  if (!isValidIsoDate(input.dataEndDate) || !isValidIsoDate(input.interventionDate)) {
    return notEnoughData(REASON_BAD_DATES);
  }
  // Sort defensively: the stationarity guard reads days positionally, so an unsorted series
  // (e.g. an ORDER-BY-less DB join) must not be able to scramble the trend check.
  const treatedPoints = [...input.treated].sort(byDate);
  const controlPoints = [...input.control].sort(byDate);

  // Duplicate calendar dates (a JOIN/ORDER-BY bug) would double-count and halve the band —
  // the same contract violation the sort/malformed guards defend against. Abstain, never guess.
  if (hasDuplicateDates(treatedPoints) || hasDuplicateDates(controlPoints)) {
    return notEnoughData(REASON_DUP_DATES);
  }

  const cutoffDate = shiftDate(input.dataEndDate, ATTRIBUTION.UNSETTLED_TRAILING_DAYS);
  const treated = splitAroundIntervention(treatedPoints, input.interventionDate, cutoffDate);
  const tPre = windowCounts(treated.pre);
  const tPost = windowCounts(treated.post);

  // Coverage: a real baseline AND a real post window. No pre coverage is the new-business
  // cold start — "not enough data" structurally, no special branch.
  if (tPre.days < ATTRIBUTION.MIN_PRE_DAYS || tPre.impressions <= 0) {
    return notEnoughData(
      "No usable baseline before the change yet — nothing to measure a shift against (a new or quiet page reads this way).",
    );
  }
  if (tPost.days < ATTRIBUTION.MIN_POST_DAYS || tPost.impressions <= 0) {
    return notEnoughData(
      "Not enough settled days after the change yet — still gathering the after-picture.",
    );
  }

  // A baseline already moving can't be attributed by any single-site method — abstain BEFORE
  // choosing ITS or DiD (a control does not rescue a treated-specific pre-trend).
  if (preWindowNonStationary(treated.pre)) {
    return notEnoughData(
      "The baseline was already trending before the change, so we can't tell the action apart from a shift already underway.",
    );
  }

  const baseline = ctrOf(tPre);
  const material = materialityOf(baseline);
  const tDiff = ctrOf(tPost) - ctrOf(tPre);
  const tBand = bandFor(tPre, tPost);

  // The treated pages must ACTUALLY have moved — materially and beyond noise — before
  // anything is attributed. A control can adjust for a shared trend, never invent a move.
  const treatedMoved = Math.abs(tDiff) > tBand && Math.abs(tDiff) >= material;
  if (!treatedMoved) {
    if (tBand > material) return notEnoughData(REASON_BLIND);
    // Enough power to see a material move; separate a true null (inside noise) from a real
    // but immaterial wiggle — the reason must not claim "nothing beyond noise" when it moved.
    const reason = Math.abs(tDiff) <= tBand ? REASON_NULL : REASON_IMMATERIAL;
    return { rung: "no_detectable_change", method: "its", confound: null, reason };
  }

  // Treated moved. Adjust for a shared trend only if a trustworthy, comparable control also
  // moved the same way; a flat control CONFIRMS the move (never buries it).
  const control = splitAroundIntervention(controlPoints, input.interventionDate, cutoffDate);
  const cPre = windowCounts(control.pre);
  const cPost = windowCounts(control.post);
  if (controlQualifies(control, cPre, cPost, tPre, tPost)) {
    const cDiff = ctrOf(cPost) - ctrOf(cPre);
    const controlMovedSameWay =
      Math.abs(cDiff) > bandFor(cPre, cPost) && Math.sign(cDiff) === Math.sign(tDiff);
    if (controlMovedSameWay) {
      const did = tDiff - cDiff;
      const didBeyondNoise = Math.abs(did) > bandFor(tPre, tPost, cPre, cPost);
      const didSignificant = didBeyondNoise && Math.abs(did) >= material;
      if (didSignificant && Math.sign(did) === Math.sign(tDiff)) {
        return direction(did, "did", CONFOUND_WITH_CONTROL);
      }
      // The net effect points the OTHER way from the raw treated move — report it honestly,
      // and by quadrant: treated ROSE-but-less is an underperformance; treated FELL-but-less
      // is the change cushioning a wider drop (the one message the owner should get).
      let reason: string;
      if (didSignificant) {
        reason = tDiff > 0 ? REASON_UNDERPERFORMED : REASON_CUSHIONED;
      } else {
        // Beyond noise but immaterial after netting — the treated pages may have moved a lot
        // in RAW terms, so the honest sentence is about the NET (post-share-removal) move, not
        // "moved slightly" (that would deny a real raw jump). A true wash stays REASON_NETTED.
        reason = didBeyondNoise ? REASON_DID_IMMATERIAL : REASON_NETTED;
      }
      return { rung: "no_detectable_change", method: "did", confound: null, reason };
    }
    // Control qualified but did not move the same way: no differencing ran, so this is a
    // single-site (ITS) direction. Name the control honestly — flat vs moved-opposite.
    const controlConfound =
      Math.abs(cDiff) > bandFor(cPre, cPost) ? CONFOUND_CONTROL_OPPOSITE : CONFOUND_CONTROL_FLAT;
    return direction(tDiff, "its", controlConfound);
  }

  // No trustworthy control — the treated move stands, single-site caveat attached. If a
  // control WAS provided but didn't qualify, say so rather than claim none existed.
  return direction(
    tDiff,
    "its",
    controlPoints.length > 0 ? CONFOUND_CONTROL_UNRELIABLE : CONFOUND_NO_CONTROL,
  );
}
