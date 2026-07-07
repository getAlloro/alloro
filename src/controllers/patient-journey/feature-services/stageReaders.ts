/**
 * Patient Journey — per-stage readers (T4).
 *
 * One small reader per funnel stage. Every read goes through a model or an
 * existing service (no inline db/knex here, §7.4). Each returns a `StageRead`:
 * the value (null when the source is not connected), an `available` flag that
 * drives the honest empty state, and freshness/`asOf`. Readers never throw —
 * a missing source degrades that stage only (best-effort, like the
 * dashboard-metrics section builders).
 */

import { GscDataModel } from "../../../models/website-builder/GscDataModel";
import { GoogleDataStoreModel } from "../../../models/GoogleDataStoreModel";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import type { StageUnavailableReason } from "../feature-utils/types";
import { FormSubmissionModel } from "../../../models/website-builder/FormSubmissionModel";
import { WebsiteIntegrationModel } from "../../../models/website-builder/WebsiteIntegrationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { ReviewModel } from "../../../models/website-builder/ReviewModel";
import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { MAPS_IMPRESSIONS_TRUSTED_FROM } from "../../../config/patientJourney";
import { aggregatePmsData } from "../../../utils/pms/pmsAggregator";
import { fetchRybbitOverview } from "../../admin-websites/feature-services/service.rybbit-performance";
import { resolveRybbitTimeZone } from "../../../utils/rybbit/rybbit-time-zone";
import logger from "../../../lib/logger";

export type StageReadMetadata = {
  gsc?: {
    clicks: number;
    ctr: number;
    position: number;
    topQueries: Array<{
      key: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
    topPages: Array<{
      key: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
    top10QueryCount: number;
    top3QueryCount: number;
  };
  rybbit?: {
    sessions: number;
    pageviews: number;
    bounceRate: number;
    pagesPerSession: number;
    sessionDuration: number;
  };
  leads?: {
    verified: number;
  };
  /**
   * Whole-practice GBP Maps/local impressions folded into the "Get Found" gate
   * alongside GSC organic. `impressions` is the summed value across ALL the
   * org's locations; `days` is STORED-DAY coverage — how many (location,
   * calendar-day) data points carried a stored GBP `visibility` payload in the
   * window. It is NOT "days Google returned Maps data": the daily writer
   * (service.agent-input-builder.ts flattenSingleDayGbp) ALWAYS emits a
   * `visibility` object, zero-filling the metrics when Google returned nothing,
   * so a genuine all-zero (or Google-empty) day is still counted as a stored
   * day here. `days` only drops a (location, day) when the whole `visibility`
   * side is absent (an un-run / un-stored day), not when Google returned zeros.
   */
  maps?: {
    impressions: number;
    days: number;
  };
};

export interface StageRead {
  value: number | null;
  available: boolean;
  asOf: string | null;
  /** Why an unavailable read is empty; only the impressions reader sets it. */
  unavailableReason?: StageUnavailableReason;
  note?: string;
  metadata?: StageReadMetadata;
}

function emptyRead(): StageRead {
  return { value: null, available: false, asOf: null };
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  // Split on either separator: ISO strings use "T", but a Postgres `timestamp`
  // rendered via `::text` comes back as "YYYY-MM-DD 00:00:00" (space). Splitting
  // on "T" only would leave the time component attached, silently breaking the
  // window boundary checks (dropping the last day) and leaking a time into asOf.
  if (value instanceof Date) return value.toISOString().split(/[T ]/)[0];
  return String(value).split(/[T ]/)[0] || null;
}

type GscDayPayload = Record<string, unknown> & { schemaVersion?: unknown; summary?: { rows?: unknown } };
type GscMetricAccumulator = {
  clicks: number;
  impressions: number;
  weightedPosition: number;
};
type GscDimensionMetric = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

function gscRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const rows = (payload as { rows?: unknown }).rows;
  return Array.isArray(rows)
    ? rows.filter((row): row is Record<string, unknown> => {
        return !!row && typeof row === "object" && !Array.isArray(row);
      })
    : [];
}

function isVersionedGscPayload(data: GscDayPayload): boolean {
  const schemaVersion = Number(data.schemaVersion);
  return Number.isFinite(schemaVersion) && schemaVersion >= 2;
}

function summaryRows(data: GscDayPayload): Array<Record<string, unknown>> {
  return isVersionedGscPayload(data)
    ? gscRows(data.summary)
    : gscRows(data);
}

function dimensionRows(
  data: GscDayPayload,
  dimension: "queries" | "pages",
): Array<Record<string, unknown>> {
  return isVersionedGscPayload(data)
    ? gscRows((data as Record<string, unknown>)[dimension])
    : gscRows(data);
}

function gscKey(row: Record<string, unknown>, index: number): string | null {
  const keys = row.keys;
  if (!Array.isArray(keys)) return null;
  const key = keys[index];
  return typeof key === "string" && key.trim() ? key : null;
}

function emptyGscAccumulator(): GscMetricAccumulator {
  return { clicks: 0, impressions: 0, weightedPosition: 0 };
}

function addGscMetrics(
  accumulator: GscMetricAccumulator,
  row: Record<string, unknown>,
): void {
  const clicks = readNumber(row.clicks);
  const impressions = readNumber(row.impressions);
  const position = readNumber(row.position);
  accumulator.clicks += clicks;
  accumulator.impressions += impressions;
  accumulator.weightedPosition += position * impressions;
}

function summarizeGsc(
  accumulator: GscMetricAccumulator,
): Omit<GscDimensionMetric, "key"> {
  return {
    clicks: Math.round(accumulator.clicks),
    impressions: Math.round(accumulator.impressions),
    ctr:
      accumulator.impressions > 0
        ? accumulator.clicks / accumulator.impressions
        : 0,
    position:
      accumulator.impressions > 0
        ? accumulator.weightedPosition / accumulator.impressions
        : 0,
  };
}

function addGscDimension(
  map: Map<string, GscMetricAccumulator>,
  key: string | null,
  row: Record<string, unknown>,
): void {
  if (!key) return;
  const accumulator = map.get(key) ?? emptyGscAccumulator();
  addGscMetrics(accumulator, row);
  map.set(key, accumulator);
}

function buildGscDimensions(
  map: Map<string, GscMetricAccumulator>,
): GscDimensionMetric[] {
  return Array.from(map.entries())
    .map(([key, accumulator]) => ({ key, ...summarizeGsc(accumulator) }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

/**
 * Distinguish why the impressions window is empty: no active GSC integration
 * (`not_connected`), connected but the current month's data has not landed
 * yet (`pending` — GSC trails ~2 days), or a connected past month with no
 * rows (`no_data`). A failed lookup degrades to the reason-less legacy empty
 * read instead of throwing (§3.1) — the stage stays honestly unavailable.
 */
async function emptyImpressionsRead(
  projectId: string,
  isCurrentMonth: boolean,
): Promise<StageRead> {
  try {
    const integration = await WebsiteIntegrationModel.findByProjectAndPlatform(
      projectId,
      "gsc",
    );
    if (!integration || integration.status !== "active") {
      return { ...emptyRead(), unavailableReason: "not_connected" };
    }
    return {
      ...emptyRead(),
      unavailableReason: isCurrentMonth ? "pending" : "no_data",
    };
  } catch (err) {
    logger.warn(
      { err, projectId },
      "[patient-journey] impressions connection check failed",
    );
    return emptyRead();
  }
}

/**
 * Maps impressions (desktop + mobile) for one stored GBP day-side's `visibility`
 * object, as projected by the model. Returns null when the side carried NO
 * `visibility` payload — that's a missing metric, not a measured zero, so the
 * caller must NOT count it toward day-coverage. A present `visibility` with zero
 * values returns 0 (a real measured zero day).
 */
function mapsImpressionsForVisibility(
  visibility: Record<string, unknown> | null,
): number | null {
  if (!visibility) return null;
  return (
    readNumber(visibility.impressions_maps_desktop) +
    readNumber(visibility.impressions_maps_mobile)
  );
}

/**
 * Whole-practice GBP Maps impressions over [startDate, endDate].
 *
 * Get Found = appearances on Google: GSC organic web-search impressions PLUS
 * Google Maps/local impressions — two distinct surfaces (Search Console API vs
 * Business Profile Performance API), so they never double-count.
 *
 * An org has ONE website (one project → GSC organic) but MANY locations, and
 * the three funnel gates are whole-practice aggregates. So the Maps term sums
 * across EVERY location of the org — not the currently-viewed tab.
 *
 * Each daily row stores two consecutive days — the `yesterday` side maps to
 * `date_end`, `dayBefore` to `date_start` — and a location's consecutive/retried
 * runs overlap by one day, so we key each measured value by (location_id,
 * calendar-day) to de-duplicate (never count one location's day twice), then sum
 * across all locations and days. The model projects just the two `visibility`
 * objects rather than the whole `gbp_data` blob (§10.4) — same values, a
 * fraction of the payload. A (location, day) only counts when its side actually
 * carried a stored `visibility` payload; a missing side (an un-run / un-stored
 * day) is absent, never a fabricated zero. Note `days` is therefore STORED-DAY
 * coverage, not "days Google returned data": the writer zero-fills `visibility`
 * for a Google-empty day, so that day still counts here.
 * Returns null when the org has no daily GBP rows in the window (the Maps term
 * is then absent and the gate falls back to organic-only), and likewise for a
 * window entirely before MAPS_IMPRESSIONS_TRUSTED_FROM — a null there means
 * "Maps is not trusted for this window", which the gate already handles as
 * organic-only.
 */
async function readMapsImpressions(
  organizationId: number,
  startDate: string,
  endDate: string,
): Promise<{ impressions: number; days: number; asOf: string | null } | null> {
  // Trust window (§4.2). Rows written before the unmapped-location fix can be
  // fabricated copies of a sibling's listing, and the mapped-location gate below
  // judges PAST rows by PRESENT mapping — so it decays the moment an unmapped
  // location gets a google_properties row. Clamping the window is what makes the
  // mitigation durable; see the constant for why this costs nothing.
  const effectiveStart =
    startDate > MAPS_IMPRESSIONS_TRUSTED_FROM
      ? startDate
      : MAPS_IMPRESSIONS_TRUSTED_FROM;
  // A window entirely before the fix short-circuits without touching the DB.
  if (effectiveStart > endDate) return null;
  const rows = await GoogleDataStoreModel.findDailyByOrgAndDateRange(
    organizationId,
    effectiveStart,
    endDate,
  );
  if (!rows.length) return null;
  // Count Maps only for locations that actually have a mapped GBP listing. An
  // unmapped location has no Maps presence, but the daily job's account-blob
  // fallback stores the account's first listing under each unmapped location's
  // id, so counting every location_id would double-count that one listing N
  // times (the C1 fabrication). Gate to the org's mapped GBP locations — this
  // corrects historical mis-stored rows too, not just future ones.
  const mappedGbp = await GooglePropertyModel.findSelectedGbpForSync({
    organizationId,
  });
  const mappedLocationIds = new Set<number>(
    mappedGbp.map((property) => property.location_id),
  );
  const perLocationDay = new Map<string, number>();
  let asOf: string | null = null;
  for (const row of rows) {
    const loc = row.location_id;
    // Unmapped location -> its Maps data is the fabricated account-blob copy; skip.
    if (loc === null || !mappedLocationIds.has(loc)) continue;
    // A row's two-day span can reach back past the clamped start, so each day is
    // re-checked against effectiveStart — not the caller's startDate.
    const endDay = isoDate(row.date_end);
    if (endDay && endDay >= effectiveStart && endDay <= endDate) {
      const value = mapsImpressionsForVisibility(row.yesterday_visibility);
      if (value !== null) {
        perLocationDay.set(`${loc}::${endDay}`, value);
        if (!asOf || endDay > asOf) asOf = endDay;
      }
    }
    const startDay = isoDate(row.date_start);
    if (startDay && startDay >= effectiveStart && startDay <= endDate) {
      const value = mapsImpressionsForVisibility(row.day_before_visibility);
      if (value !== null) {
        perLocationDay.set(`${loc}::${startDay}`, value);
        if (!asOf || startDay > asOf) asOf = startDay;
      }
    }
  }
  if (!perLocationDay.size) return null;
  let impressions = 0;
  for (const value of perLocationDay.values()) impressions += value;
  return { impressions, days: perLocationDay.size, asOf };
}

/** Later of two nullable ISO YYYY-MM-DD dates (they compare lexically). */
function laterIsoDate(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

/**
 * Get Found (gate 1) = GSC organic impressions (one org = one website, counted
 * once) + WHOLE-PRACTICE GBP Maps impressions (summed across all the org's
 * locations) for the same window. This is the honest whole-practice aggregate:
 * the shared website is never multiplied across locations, and every location's
 * Maps presence is counted.
 *
 * Maps is additive and best-effort: when `organizationId` is provided and the
 * org has stored daily GBP data, its Maps impressions are folded in; otherwise
 * the Maps term is simply absent (organic-only), never a fabricated add. If GSC
 * has no rows but the org has real (positive) Maps impressions, the gate is
 * still available on the Maps signal alone — the practice genuinely appears on
 * Maps. `metadata.gsc` stays GSC-only and correct; `metadata.maps` carries the
 * Maps split for transparency.
 */
export async function readImpressions(
  projectId: string,
  startDate: string,
  endDate: string,
  isCurrentMonth: boolean,
  organizationId?: number,
): Promise<StageRead> {
  try {
    // Best-effort Maps read: a failure here must not sink the whole gate, so it
    // degrades to null (organic-only) rather than throwing (§3.1).
    let maps: Awaited<ReturnType<typeof readMapsImpressions>> = null;
    if (organizationId != null) {
      try {
        maps = await readMapsImpressions(organizationId, startDate, endDate);
      } catch (err) {
        logger.warn(
          { err, projectId, organizationId },
          "[patient-journey] maps impressions read failed",
        );
      }
    }

    const rows = await GscDataModel.findByProjectAndDateRange(projectId, startDate, endDate);
    if (!rows.length) {
      // No GSC rows. If there's a genuine (positive) Maps signal, the practice
      // still appears on Maps — report that rather than a false "no data".
      if (maps && maps.impressions > 0) {
        return {
          value: maps.impressions,
          available: true,
          asOf: maps.asOf,
          metadata: { maps: { impressions: maps.impressions, days: maps.days } },
        };
      }
      return emptyImpressionsRead(projectId, isCurrentMonth);
    }
    const totals = emptyGscAccumulator();
    const queryMap = new Map<string, GscMetricAccumulator>();
    const pageMap = new Map<string, GscMetricAccumulator>();
    let latest: string | null = null;
    for (const day of rows) {
      const data = day.data as GscDayPayload;
      for (const row of summaryRows(data)) {
        addGscMetrics(totals, row);
      }
      for (const row of dimensionRows(data, "queries")) {
        addGscDimension(queryMap, gscKey(row, 0), row);
      }
      for (const row of dimensionRows(data, "pages")) {
        addGscDimension(
          pageMap,
          isVersionedGscPayload(data) ? gscKey(row, 0) : gscKey(row, 1),
          row,
        );
      }
      const day8 = isoDate(day.report_date);
      if (day8 && (!latest || day8 > latest)) latest = day8;
    }
    const totalsSummary = summarizeGsc(totals);
    const topQueries = buildGscDimensions(queryMap);
    // Get Found = organic + Maps. Maps is added even when 0 (a measured zero is
    // still real); it's only absent when the location has no stored GBP data.
    const mapsImpressions = maps ? maps.impressions : 0;
    return {
      value: totalsSummary.impressions + mapsImpressions,
      available: true,
      asOf: laterIsoDate(latest, maps ? maps.asOf : null),
      metadata: {
        gsc: {
          clicks: totalsSummary.clicks,
          ctr: totalsSummary.ctr,
          position: totalsSummary.position,
          topQueries: topQueries.slice(0, 3),
          topPages: buildGscDimensions(pageMap).slice(0, 3),
          top10QueryCount: topQueries.filter(
            (query) => query.position > 0 && query.position <= 10,
          ).length,
          top3QueryCount: topQueries.filter(
            (query) => query.position > 0 && query.position <= 3,
          ).length,
        },
        ...(maps
          ? { maps: { impressions: maps.impressions, days: maps.days } }
          : {}),
      },
    };
  } catch (err) {
    logger.warn({ err, projectId }, "[patient-journey] impressions read failed");
    return emptyRead();
  }
}

/** Rybbit deduped visitors for the month window (all-channel). */
export async function readVisits(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<StageRead> {
  try {
    const integration = await WebsiteIntegrationModel.findByProjectAndPlatform(projectId, "rybbit");
    if (!integration) return emptyRead();
    const timeZone = resolveRybbitTimeZone(await ProjectModel.getRybbitTimeZone(projectId));
    const overview = await fetchRybbitOverview(integration, startDate, endDate, timeZone);
    if (!overview) return emptyRead();
    return {
      value: readNumber(overview.users),
      available: true,
      asOf: clampAsOfToToday(endDate),
      note: "All-channel visits (search + direct + social), best-effort bot-filtered.",
      metadata: {
        rybbit: {
          sessions: readNumber(overview.sessions),
          pageviews: readNumber(overview.pageviews),
          bounceRate: readNumber(overview.bounceRate),
          pagesPerSession: readNumber(overview.pagesPerSession),
          sessionDuration: readNumber(overview.sessionDuration),
        },
      },
    };
  } catch (err) {
    logger.warn({ err, projectId }, "[patient-journey] visits read failed");
    return emptyRead();
  }
}

/**
 * Never report an "as of" date in the future. For an in-progress month the month
 * boundary is later than today — clamp so a current-month card doesn't read "as of"
 * a future date (pressure-test 2026-07-13). ISO YYYY-MM-DD strings compare correctly.
 */
function clampAsOfToToday(dateStr: string | null): string | null {
  if (dateStr === null) return null;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr < today ? dateStr : today;
}

/** Lead count = non-flagged form submissions for the project in the month. */
export async function readLeads(
  projectId: string,
  monthStart: Date,
  monthEnd: Date
): Promise<StageRead> {
  try {
    const startIso = monthStart.toISOString();
    // Report month's last day (monthEnd is the exclusive next-month boundary),
    // clamped so an in-progress month never reports a future "as of".
    const leadsAsOf = clampAsOfToToday(
      isoDate(new Date(monthEnd.getTime() - 86400000)),
    );
    const stats = await FormSubmissionModel.getMonthlyStatsByProject(projectId, startIso);
    const monthKey = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = stats.find((entry) => entry.month === monthKey);
    if (!row) {
      // The project has form data but none in this month — that's a real zero.
      // If the project has never had a submission, it's connected-but-empty
      // (`no_data`), NOT "not connected" — the caller sets `not_connected`
      // upstream when there's no project at all. (Mirrors the impressions
      // reader's not_connected / pending / no_data distinction.)
      return stats.length
        ? {
            value: 0,
            available: true,
            asOf: leadsAsOf,
            metadata: { leads: { verified: 0 } },
          }
        : { ...emptyRead(), unavailableReason: "no_data" };
    }
    const verified = Number(row.verified) || 0;
    return {
      value: verified,
      available: true,
      asOf: leadsAsOf,
      metadata: { leads: { verified } },
    };
  } catch (err) {
    logger.warn({ err, projectId }, "[patient-journey] leads read failed");
    return emptyRead();
  }
}

export interface PmsRead {
  patients: StageRead;
  revenue: { value: number | null; available: boolean };
}

/** Patients (record count) + revenue (production_total) from approved PMS jobs. */
export async function readPms(organizationId: number, locationId: number): Promise<PmsRead> {
  try {
    const aggregated = await aggregatePmsData(organizationId, locationId);
    if (!aggregated.months.length && !aggregated.patientRecords.length) {
      return { patients: emptyRead(), revenue: { value: null, available: false } };
    }
    const latest = [...aggregated.months].sort((a, b) =>
      String(a.timestamp).localeCompare(String(b.timestamp))
    ).pop();
    const asOf = latest ? isoDate(latest.timestamp) : null;
    const production = aggregated.totals.totalProduction;
    return {
      patients: {
        value: aggregated.patientRecords.length,
        available: aggregated.patientRecords.length > 0,
        asOf,
      },
      revenue: { value: production, available: production > 0 },
    };
  } catch (err) {
    logger.warn({ err, organizationId, locationId }, "[patient-journey] PMS read failed");
    return { patients: emptyRead(), revenue: { value: null, available: false } };
  }
}

export interface RankRead {
  position: number | null;
  totalCompetitors: number | null;
  available: boolean;
  /** Ran a completed ranking but placed outside the local Maps top-20 (null
   *  search_position). NOT "never ran": the card must not say "run a ranking". */
  notInTop20: boolean;
}

/** Latest completed local-rank position + competitor count for the location. */
export async function readRank(organizationId: number, locationId: number): Promise<RankRead> {
  try {
    const row = await PracticeRankingModel.findLatestCompletedRankingMetrics(
      organizationId,
      locationId
    );
    if (!row) return { position: null, totalCompetitors: null, available: false, notInTop20: false };
    // Read the real SerpApi Maps position (`search_position`), NOT the
    // Practice-Health `rank_position` (which defaults to a fabricated #1 when
    // the practice isn't matched among competitors). Null = SerpApi miss →
    // stay unavailable ("estimate pending"), never a fabricated number.
    const position = row.search_position ?? null;
    // `total_competitors` is the Practice-Health CURATED competitor set; it does
    // NOT pair with the SerpApi Maps `search_position` above (two different
    // universes: "#15 in Maps" over "of 5 curated" renders the incoherent
    // "#15 of 5 locally"). We have no SerpApi Maps-universe total, so omit the
    // denominator; the card renders an honest "#N locally" with no mismatched "of M".
    const totalCompetitors = null;
    // notInTop20 is TRUE only when SerpApi CONFIRMS the practice ranked below the
    // local Maps top-20 (search_status "not_in_top_20"). A null position from a
    // lookup failure (api_error / bias_unavailable) means "couldn't measure", NOT
    // "outside top 20", so it falls through to available:false / "Rank not
    // available yet" (matching the rest of the app + Fix-1's intent), never a
    // fabricated negative claim. Requires search_status in the model select above.
    const notInTop20 = row.search_status === "not_in_top_20";
    return {
      position,
      totalCompetitors,
      available: position !== null,
      notInTop20,
    };
  } catch (err) {
    logger.warn({ err, organizationId, locationId }, "[patient-journey] rank read failed");
    return { position: null, totalCompetitors: null, available: false, notInTop20: false };
  }
}

export interface ReviewsRead {
  rating: number | null;
  count: number | null;
  newThisMonth: number | null;
  replyRatePct: number | null;
  available: boolean;
}

/** Stored-review context (rating/count/new/reply-rate) for the location. */
export async function readReviews(
  locationId: number,
  monthStart: Date,
  monthEnd: Date
): Promise<ReviewsRead> {
  try {
    const summary = await ReviewModel.getReviewSummaryForLocation(locationId, monthStart, monthEnd);
    return {
      rating: summary.rating,
      count: summary.count,
      newThisMonth: summary.newThisMonth,
      replyRatePct: summary.replyRatePct,
      available: summary.count !== null,
    };
  } catch (err) {
    logger.warn({ err, locationId }, "[patient-journey] reviews read failed");
    return { rating: null, count: null, newThisMonth: null, replyRatePct: null, available: false };
  }
}
