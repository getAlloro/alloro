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
import { FormSubmissionModel } from "../../../models/website-builder/FormSubmissionModel";
import { WebsiteIntegrationModel } from "../../../models/website-builder/WebsiteIntegrationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { ReviewModel } from "../../../models/website-builder/ReviewModel";
import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { KeywordSearchVolumeModel } from "../../../models/KeywordSearchVolumeModel";
import { aggregatePmsData } from "../../../utils/pms/pmsAggregator";
import { fetchRybbitOverview } from "../../admin-websites/feature-services/service.rybbit-performance";
import { resolveRybbitTimeZone } from "../../../utils/rybbit/rybbit-time-zone";
import logger from "../../../lib/logger";

export interface StageRead {
  value: number | null;
  available: boolean;
  asOf: string | null;
  note?: string;
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

/** Sum GSC `summary[].impressions` for a project over [startDate, endDate]. */
export async function readImpressions(
  projectId: string,
  startDate: string,
  endDate: string
): Promise<StageRead> {
  try {
    const rows = await GscDataModel.findByProjectAndDateRange(projectId, startDate, endDate);
    if (!rows.length) return emptyRead();
    let impressions = 0;
    let latest: string | null = null;
    for (const day of rows) {
      const data = day.data as GscDayPayload;
      const versioned = Number(data.schemaVersion) >= 2;
      const summaryRows = versioned
        ? Array.isArray(data.summary?.rows) ? (data.summary?.rows as unknown[]) : []
        : Array.isArray((data as { rows?: unknown }).rows) ? ((data as { rows?: unknown }).rows as unknown[]) : [];
      for (const row of summaryRows) {
        if (row && typeof row === "object") {
          impressions += readNumber((row as Record<string, unknown>).impressions);
        }
      }
      const day8 = isoDate(day.report_date);
      if (day8 && (!latest || day8 > latest)) latest = day8;
    }
    return { value: Math.round(impressions), available: true, asOf: latest };
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
      asOf: endDate,
      note: "All-channel visits (search + direct + social), best-effort bot-filtered.",
    };
  } catch (err) {
    logger.warn({ err, projectId }, "[patient-journey] visits read failed");
    return emptyRead();
  }
}

/** Lead count = non-flagged form submissions for the project in the month. */
export async function readLeads(
  projectId: string,
  monthStart: Date,
  monthEnd: Date
): Promise<StageRead> {
  try {
    const startIso = monthStart.toISOString();
    const stats = await FormSubmissionModel.getMonthlyStatsByProject(projectId, startIso);
    const monthKey = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`;
    const row = stats.find((entry) => entry.month === monthKey);
    if (!row) {
      // The project has form data but none in this month — that's a real zero.
      return stats.length ? { value: 0, available: true, asOf: isoDate(monthEnd) } : emptyRead();
    }
    return { value: Number(row.verified) || 0, available: true, asOf: isoDate(monthEnd) };
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

/** Market demand = summed search volume for the location's keywords this month. */
export async function readMarketDemand(
  organizationId: number,
  locationId: number,
  reportMonth: string
): Promise<StageRead> {
  try {
    const summary = await KeywordSearchVolumeModel.getMarketVolumeForLocation(
      organizationId,
      locationId,
      reportMonth
    );
    if (summary.keywordCount === 0) return emptyRead();
    return { value: summary.totalVolume, available: true, asOf: isoDate(reportMonth) };
  } catch (err) {
    logger.warn({ err, organizationId, locationId }, "[patient-journey] market-demand read failed");
    return emptyRead();
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
    const position = row.rank_position ?? null;
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
