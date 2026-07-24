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
 *  4. It claims NO causation. It returns the measured rise plus coverage; the
 *     "Alloro caused this" framing is a downstream human / receipt concern, not
 *     this reader's to assert.
 *
 * All DB access goes through models (§7.4); the org -> project scope comes from
 * server context (§11.7); the read degrades honestly and never throws (§3.1).
 */

import { GscDataModel } from "../../../models/website-builder/GscDataModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { sumOrganicImpressionsForDay } from "./stageReaders";
import logger from "../../../lib/logger";

/** A closed date window, inclusive of both ends, as `YYYY-MM-DD` strings. */
export interface DateWindow {
  start: string;
  end: string;
}

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

export interface ImpressionsLiftResult {
  organizationId: number;
  /** The org's website project, or `null` when it has none. */
  projectId: string | null;
  /** Fixed provenance — this reader is GSC web-search organic, never Maps/GBP. */
  source: "gsc_organic";
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
  /** The stored GSC-organic history bounds for the org's project. */
  history: { earliest: string | null; latest: string | null };
}

/** Trim a text / timestamp date to `YYYY-MM-DD`, or `null` if unusable. */
function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = String(value).split(/[T ]/)[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Inclusive count of calendar days in [start, end]. Returns `null` for a
 * malformed or inverted window (start after end) — a null span makes the window
 * un-coverable, which surfaces honestly rather than inventing a span.
 */
function inclusiveDaySpan(start: string, end: string): number | null {
  const s = isoDay(start);
  const e = isoDay(end);
  if (!s || !e) return null;
  const startMs = Date.parse(`${s}T00:00:00Z`);
  const endMs = Date.parse(`${e}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return null;
  }
  return Math.round((endMs - startMs) / 86_400_000) + 1;
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

  const perDay = new Map<string, number>();
  for (const row of rows) {
    const day = isoDay(row.report_date);
    if (!day) continue;
    // Last write wins per calendar day — the sum is stable regardless of the
    // query's row order, and a duplicated report_date can never double-count.
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
 * Never throws: a missing project, an empty history, or a DB failure all
 * degrade to a `sufficient: false` result carrying a plain-words `reason`.
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
    pre: null,
    post: null,
    delta: null,
    pctChange: null,
    sufficient: false,
    reason: null,
    history: { earliest: null, latest: null },
  };

  try {
    const project = await ProjectModel.findByOrganizationId(orgId);
    if (!project) {
      return {
        ...base,
        reason: "organization has no website project with stored GSC history",
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
        history,
      };
    }

    const delta = post.storedImpressions - pre.storedImpressions;
    const pctChange =
      pre.storedImpressions > 0 ? delta / pre.storedImpressions : null;

    return {
      organizationId: orgId,
      projectId,
      source: "gsc_organic",
      pre,
      post,
      delta,
      pctChange,
      sufficient: true,
      reason: null,
      history,
    };
  } catch (err) {
    logger.warn(
      { err, orgId, preWindow, postWindow },
      "[patient-journey] impressions-lift read failed",
    );
    return {
      ...base,
      reason: "impressions-lift read failed",
    };
  }
}
