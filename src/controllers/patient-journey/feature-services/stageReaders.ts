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
import type { StageUnavailableReason } from "../feature-utils/types";
import { FormSubmissionModel } from "../../../models/website-builder/FormSubmissionModel";
import { WebsiteIntegrationModel } from "../../../models/website-builder/WebsiteIntegrationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { ReviewModel } from "../../../models/website-builder/ReviewModel";
import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
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
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value).split("T")[0] || null;
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

/** Sum GSC `summary[].impressions` for a project over [startDate, endDate]. */
export async function readImpressions(
  projectId: string,
  startDate: string,
  endDate: string,
  isCurrentMonth: boolean
): Promise<StageRead> {
  try {
    const rows = await GscDataModel.findByProjectAndDateRange(projectId, startDate, endDate);
    if (!rows.length) return emptyImpressionsRead(projectId, isCurrentMonth);
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
    return {
      value: totalsSummary.impressions,
      available: true,
      asOf: latest,
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
}

/** Latest completed local-rank position + competitor count for the location. */
export async function readRank(organizationId: number, locationId: number): Promise<RankRead> {
  try {
    const row = await PracticeRankingModel.findLatestCompletedRankingMetrics(
      organizationId,
      locationId
    );
    if (!row) return { position: null, totalCompetitors: null, available: false };
    // Read the real SerpApi Maps position (`search_position`), NOT the
    // Practice-Health `rank_position` (which defaults to a fabricated #1 when
    // the practice isn't matched among competitors). Null = SerpApi miss →
    // stay unavailable ("estimate pending"), never a fabricated number.
    const position = row.search_position ?? null;
    const totalCompetitors = row.total_competitors ?? null;
    return {
      position,
      totalCompetitors,
      available: position !== null,
    };
  } catch (err) {
    logger.warn({ err, organizationId, locationId }, "[patient-journey] rank read failed");
    return { position: null, totalCompetitors: null, available: false };
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
