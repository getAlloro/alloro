/**
 * Impressions-lift attribution reader (Get Found, gate 1).
 *
 * Given an org, a PRE window and a POST window, this reads the org's website's
 * STORED GSC-**organic** daily impressions history and returns the honest
 * before -> after delta with full coverage metadata. It is the reusable process
 * that turns already-stored data into an honest lift number — the machinery
 * behind a proven-lift receipt.
 *
 * WHAT THIS IS NOT (honesty constraints — Value #6; a fabricated receipt is
 * worse than none):
 *
 *  1. It NEVER touches `ctrAttributionMath` — that instrument is CTR-only and
 *     reads a rise in impressions as `trending_down`. This is get-found /
 *     impressions: deterministic window arithmetic over stored rows, nothing
 *     else, no LLM judgement in the number.
 *  2. GSC-organic ONLY. It deliberately does NOT fold in Google Maps / GBP
 *     impressions: those are trust-clamped to a recent date (see
 *     `MAPS_IMPRESSIONS_TRUSTED_FROM`) and are too short a history for a
 *     multi-week before/after. This reader answers one surface honestly rather
 *     than two surfaces muddily.
 *  3. Coverage is exposed, never fabricated. There is NO historical backfill —
 *     stored history depth equals days since the GSC integration went active.
 *     Each window reports its stored-day count, its expected calendar-day span,
 *     the earliest/latest stored report_date inside it, and a `fullyCovered`
 *     boolean. A `delta` is produced ONLY when BOTH windows are fully covered;
 *     a partial or empty window returns a null delta with a plain-words reason,
 *     never a delta summed over missing days dressed up as real.
 *  4. Completeness is not comparability. Two fully-covered windows of DIFFERENT
 *     lengths still produce a delta that measures the calendar — impressions
 *     are a count, so a 28-day POST against a 14-day PRE reads "+100%" for a
 *     practice that did not move by one point. The pair is checked for
 *     comparability (equal length, no overlap, within the max span) BEFORE any
 *     row is read; see `compareReceiptWindows`.
 *  5. It claims NO causation. It returns the measured rise plus coverage; the
 *     "Alloro caused this" framing is a downstream human / receipt concern, not
 *     this reader's to assert.
 *
 * All DB access goes through models (§7.4); the org -> project scope comes from
 * server context (§11.7); the read degrades honestly and never throws (§3.1).
 */

import { GscDataModel } from "../../../models/website-builder/GscDataModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { sumOrganicImpressionsForDay } from "./stageReaders";
import {
  compareReceiptWindows,
  inclusiveDaySpan,
  isoDay,
  type DateWindow,
} from "../../../utils/receiptWindows";
import logger from "../../../lib/logger";

export type { DateWindow };

/**
 * Honest coverage + value for a single window. `storedImpressions` is the sum of
 * GSC-organic impressions over the stored days ACTUALLY PRESENT in the window —
 * it is a coverage figure, not "the window total", and it is only safe to read
 * as a window total when `fullyCovered` is true.
 */
export interface ImpressionsWindowCoverage {
  window: DateWindow;
  /** GSC-organic impressions summed over the stored days present in the window. */
  storedImpressions: number;
  /** Count of distinct stored report_date rows found inside the window. */
  storedDays: number;
  /** Inclusive calendar-day span of the window (the days we WOULD need). */
  expectedDays: number;
  /** Min stored report_date present in the window (`null` when none). */
  earliestStored: string | null;
  /** Max stored report_date present in the window (`null` when none). */
  latestStored: string | null;
  /** True only when every calendar day in the window has a stored row. */
  fullyCovered: boolean;
}

/**
 * Why a lift result is insufficient, as a machine-readable code.
 *
 * The `reason` string is what a human reads; this is what a caller BRANCHES on.
 * Without it, every consumer has to guess from a null value whether the source
 * is disconnected, the history is short, the request was bad, or the read
 * failed — and guessing wrong turns a read failure into a false statement about
 * the practice ("you have no search history").
 */
export type ImpressionsLiftFailureKind =
  | "no_project"
  | "invalid_window"
  | "window_too_long"
  | "unequal_length"
  | "overlapping"
  | "partial_coverage"
  | "read_failed";

export interface ImpressionsLiftResult {
  organizationId: number;
  /** The org's website project, or `null` when it has none. */
  projectId: string | null;
  /** Fixed provenance — this reader is GSC web-search organic, never Maps/GBP. */
  source: "gsc_organic";
  /**
   * Surfaces deliberately NOT counted in this number. `AGENTS.md` defines the
   * Get Found gate as map + organic + AI answers; this reader answers organic
   * only (see honesty note 2 above). Carrying the exclusion on the result means
   * a downstream label cannot quietly present it as the whole gate.
   */
  excludes: readonly ["gbp_maps"];
  pre: ImpressionsWindowCoverage | null;
  post: ImpressionsWindowCoverage | null;
  /**
   * post.storedImpressions - pre.storedImpressions, but ONLY when both windows
   * are fully covered. `null` whenever the delta would be summed over missing
   * days (partial/empty coverage) or the org has no stored history.
   */
  delta: number | null;
  /**
   * delta / pre.storedImpressions as a fraction. `null` when the delta is null,
   * or when the pre window's organic impressions are 0 (a rise from zero has no
   * honest percentage).
   */
  pctChange: number | null;
  /** True only when a real delta was produced (both windows fully covered). */
  sufficient: boolean;
  /** Plain-words reason the result is insufficient; `null` when sufficient. */
  reason: string | null;
  /** Machine-readable cause behind `reason`; `null` when sufficient. */
  failureKind: ImpressionsLiftFailureKind | null;
  /** The stored GSC-organic history bounds for the org's project. */
  history: { earliest: string | null; latest: string | null };
}

/**
 * Read the stored GSC-organic history for one window and report its honest
 * coverage. Dedupes by report_date (the table is unique on
 * (project_id, report_date), but we never assume the query preserves that).
 */
async function readWindowCoverage(
  projectId: string,
  window: DateWindow,
): Promise<ImpressionsWindowCoverage> {
  const expectedDaysOrNull = inclusiveDaySpan(window.start, window.end);
  // A malformed window is un-coverable: 0 expected days it can never meet, so
  // fullyCovered is impossible and the empty-window branch below owns it.
  const expectedDays = expectedDaysOrNull ?? 0;

  const rows = await GscDataModel.findByProjectAndDateRange(
    projectId,
    window.start,
    window.end,
  );

  const windowStart = isoDay(window.start);
  const windowEnd = isoDay(window.end);

  const perDay = new Map<string, number>();
  for (const row of rows) {
    const day = isoDay(row.report_date);
    if (!day) continue;
    // Only count days that are actually IN the window. The model's
    // `whereBetween` already guarantees this, but the coverage proof rests on
    // `storedDays <= expectedDays` — which only holds while every counted day
    // is in-window. Re-checking here means a widened query can never make a
    // window with a MISSING day read as fully covered.
    if (windowStart !== null && day < windowStart) continue;
    if (windowEnd !== null && day > windowEnd) continue;
    // Keying by day makes the sum stable regardless of the query's row order.
    // The table's UNIQUE (project_id, report_date) constraint already makes a
    // duplicate impossible, so this is defence-in-depth, not a live concern —
    // note that if duplicates ever DID occur, last-write-wins would silently
    // drop one rather than surface it.
    perDay.set(day, sumOrganicImpressionsForDay(row.data));
  }

  let storedImpressions = 0;
  let earliestStored: string | null = null;
  let latestStored: string | null = null;
  for (const [day, impressions] of perDay) {
    storedImpressions += impressions;
    if (!earliestStored || day < earliestStored) earliestStored = day;
    if (!latestStored || day > latestStored) latestStored = day;
  }

  const storedDays = perDay.size;
  const fullyCovered =
    expectedDaysOrNull !== null &&
    storedDays > 0 &&
    storedDays === expectedDaysOrNull;

  return {
    window,
    storedImpressions,
    storedDays,
    expectedDays,
    earliestStored,
    latestStored,
    fullyCovered,
  };
}

/** Build the plain-words reason a pair of windows can't yield an honest delta. */
function insufficientReason(
  pre: ImpressionsWindowCoverage,
  post: ImpressionsWindowCoverage,
): string {
  const shortfall = (
    label: string,
    cov: ImpressionsWindowCoverage,
  ): string | null => {
    if (cov.fullyCovered) return null;
    if (cov.storedDays === 0) {
      return `${label} window has no stored GSC-organic history`;
    }
    return `${label} window is only partially covered (${cov.storedDays} of ${cov.expectedDays} days stored)`;
  };
  const parts = [shortfall("PRE", pre), shortfall("POST", post)].filter(
    (part): part is string => part !== null,
  );
  return parts.join("; ");
}

/**
 * Read the honest before -> after GSC-organic impressions lift for an org.
 *
 * @param orgId       organization id (server-context scoped, §11.7)
 * @param preWindow   the "before" window, inclusive `YYYY-MM-DD` bounds
 * @param postWindow  the "after" window, inclusive `YYYY-MM-DD` bounds
 *
 * Never throws: a missing project, an incomparable window pair, an empty
 * history, or a DB failure all degrade to a `sufficient: false` result carrying
 * a plain-words `reason` and a machine-readable `failureKind`.
 */
export async function readImpressionsLift(
  orgId: number,
  preWindow: DateWindow,
  postWindow: DateWindow,
): Promise<ImpressionsLiftResult> {
  const base: ImpressionsLiftResult = {
    organizationId: orgId,
    projectId: null,
    source: "gsc_organic",
    excludes: ["gbp_maps"],
    pre: null,
    post: null,
    delta: null,
    pctChange: null,
    sufficient: false,
    reason: null,
    failureKind: null,
    history: { earliest: null, latest: null },
  };

  // Comparability is decided BEFORE any row is read, for two reasons: an
  // incomparable pair can never produce an honest delta no matter what the
  // rows say, and an oversized window must not reach the query at all (it is
  // the amplification vector — one JSONB row per day, unbounded).
  const comparability = compareReceiptWindows(preWindow, postWindow);
  if (!comparability.comparable) {
    return {
      ...base,
      reason: comparability.reason,
      failureKind: comparability.kind,
    };
  }

  try {
    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) {
      return {
        ...base,
        reason: "organization has no website project with stored GSC history",
        failureKind: "no_project",
      };
    }
    const projectId = project.id;

    const [pre, post, historyEarliest, historyLatest] = await Promise.all([
      readWindowCoverage(projectId, preWindow),
      readWindowCoverage(projectId, postWindow),
      GscDataModel.findEarliestReportDate(projectId),
      GscDataModel.findLatestReportDate(projectId),
    ]);

    const history = {
      earliest: isoDay(historyEarliest),
      latest: isoDay(historyLatest),
    };

    // Both windows must be fully covered before ANY delta is honest. A partial
    // window's storedImpressions is real but incomplete, so subtracting one
    // incomplete window from another would dress missing days up as a measured
    // change — exactly the fabrication this reader exists to refuse.
    if (!pre.fullyCovered || !post.fullyCovered) {
      return {
        ...base,
        projectId,
        pre,
        post,
        reason: insufficientReason(pre, post),
        failureKind: "partial_coverage",
        history,
      };
    }

    // Safe to subtract: both windows are fully covered AND comparable (equal
    // length, non-overlapping, within the max span — checked above).
    const delta = post.storedImpressions - pre.storedImpressions;
    const pctChange =
      pre.storedImpressions > 0 ? delta / pre.storedImpressions : null;

    return {
      organizationId: orgId,
      projectId,
      source: "gsc_organic",
      excludes: ["gbp_maps"],
      pre,
      post,
      delta,
      pctChange,
      sufficient: true,
      reason: null,
      failureKind: null,
      history,
    };
  } catch (err) {
    logger.warn(
      { err, orgId, preWindow, postWindow },
      "[patient-journey] impressions-lift read failed",
    );
    return {
      ...base,
      // Owner-safe wording: this string can be rendered verbatim in a card, so
      // it says what happened in plain words. The internal detail lives in the
      // Pino line above and in `failureKind`, not in prose shown to a practice.
      reason: "we could not read your search history just now",
      failureKind: "read_failed",
    };
  }
}
