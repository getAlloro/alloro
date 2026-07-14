/**
 * Rybbit Data Fetcher
 *
 * Shared utility for fetching website analytics data from the
 * self-hosted Rybbit instance. Used by both daily (Proofline)
 * and monthly (Summary) agents.
 *
 * The legacy comparison functions remain non-blocking and return null on
 * failure. Receipts use a typed result so a missing connection, a source
 * failure, and a real zero cannot be confused.
 */

import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { resolveRybbitTimeZone } from "./rybbit-time-zone";
import logger from "../../lib/logger";

const RYBBIT_API_URL = process.env.RYBBIT_API_URL || "";
const RYBBIT_API_KEY = process.env.RYBBIT_API_KEY || "";
const RECEIPTS_RYBBIT_TIMEOUT_MS = 6_000;

// =====================================================================
// SITE ID LOOKUP
// =====================================================================

export interface RybbitSiteConfig {
  siteId: string;
  /** IANA reporting timezone; falls back to Eastern when unset. */
  timeZone: string;
}

export type RybbitPeriodUsersResult =
  | { status: "ok"; users: number }
  | { status: "not_connected" }
  | { status: "source_unavailable" };

type RybbitPeriodSiteConfigResult =
  | { status: "ok"; config: RybbitSiteConfig }
  | { status: "not_connected" }
  | { status: "source_unavailable" };

/**
 * Look up the Rybbit site ID and reporting timezone for an organization.
 * Returns null if the org has no project or no rybbit_site_id.
 */
export async function getRybbitSiteConfig(
  organizationId: number
): Promise<RybbitSiteConfig | null> {
  try {
    const project = await ProjectModel.findRybbitConfigByOrganizationId(
      organizationId
    );

    if (!project?.rybbit_site_id) return null;
    return {
      siteId: project.rybbit_site_id,
      timeZone: resolveRybbitTimeZone(project.rybbit_time_zone),
    };
  } catch (err: any) {
    logger.error({ err: err?.message || err }, `[Rybbit] Error looking up site config for org ${organizationId}:`);
    return null;
  }
}

// =====================================================================
// OVERVIEW FETCH
// =====================================================================

/**
 * Fetch the Rybbit overview metrics for a site and date range.
 * Returns the raw response data or null on failure.
 */
export async function fetchRybbitOverview(
  siteId: string,
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<any | null> {
  if (!RYBBIT_API_URL || !RYBBIT_API_KEY) {
    logger.warn("[Rybbit] Skipping fetch — missing RYBBIT_API_URL or RYBBIT_API_KEY");
    return null;
  }

  try {
    const url = `${RYBBIT_API_URL}/api/sites/${siteId}/overview?start_date=${startDate}&end_date=${endDate}&time_zone=${encodeURIComponent(timeZone)}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${RYBBIT_API_KEY}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(`[Rybbit] Overview fetch failed (${response.status}): ${body}`);
      return null;
    }

    return await response.json();
  } catch (err: any) {
    logger.error({ err: err?.message || err }, `[Rybbit] Overview fetch error for site ${siteId}:`);
    return null;
  }
}

// =====================================================================
// RECEIPTS PERIOD USERS
// =====================================================================

/**
 * Fetch a period's deduplicated Rybbit users for a receipts report.
 * Unlike the legacy comparison helpers, every unavailable state is explicit.
 */
export async function fetchRybbitPeriodUsers(
  organizationId: number,
  startDate: string,
  endDate: string
): Promise<RybbitPeriodUsersResult> {
  const configResult = await getRybbitPeriodSiteConfig(organizationId);
  if (configResult.status !== "ok") return configResult;

  const { siteId, timeZone } = configResult.config;
  const payload = await fetchRybbitPeriodUsersPayload(
    organizationId,
    siteId,
    startDate,
    endDate,
    timeZone
  );
  const users = readPeriodUsers(payload);

  if (users === null) {
    logger.warn(
      { organizationId, siteId },
      "[Rybbit] Receipts period users unavailable"
    );
    return { status: "source_unavailable" };
  }

  return { status: "ok", users };
}

async function getRybbitPeriodSiteConfig(
  organizationId: number
): Promise<RybbitPeriodSiteConfigResult> {
  try {
    const project = await ProjectModel.findRybbitConfigByOrganizationId(
      organizationId
    );
    const siteId = project?.rybbit_site_id?.trim();
    if (!siteId) return { status: "not_connected" };

    return {
      status: "ok",
      config: {
        siteId,
        timeZone: resolveRybbitTimeZone(project?.rybbit_time_zone),
      },
    };
  } catch (err: unknown) {
    logger.warn(
      { err, organizationId },
      "[Rybbit] Receipts site configuration lookup failed"
    );
    return { status: "source_unavailable" };
  }
}

async function fetchRybbitPeriodUsersPayload(
  organizationId: number,
  siteId: string,
  startDate: string,
  endDate: string,
  timeZone: string
): Promise<unknown | null> {
  if (!RYBBIT_API_URL || !RYBBIT_API_KEY) {
    logger.warn(
      { organizationId, siteId },
      "[Rybbit] Receipts fetch skipped because API configuration is missing"
    );
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    RECEIPTS_RYBBIT_TIMEOUT_MS
  );

  try {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      time_zone: timeZone,
    });
    const url = `${RYBBIT_API_URL}/api/sites/${encodeURIComponent(
      siteId
    )}/overview?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${RYBBIT_API_KEY}` },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn(
        { organizationId, siteId, status: response.status },
        "[Rybbit] Receipts period users request failed"
      );
      return null;
    }

    const payload: unknown = await response.json();
    return payload;
  } catch (err: unknown) {
    logger.warn(
      { err, organizationId, siteId },
      "[Rybbit] Receipts period users request failed"
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function readPeriodUsers(payload: unknown): number | null {
  const outer = asRecord(payload);
  if (!outer) return null;

  const data = asRecord(outer.data) ?? outer;
  const rawUsers = data.users;
  const users =
    typeof rawUsers === "number"
      ? rawUsers
      : typeof rawUsers === "string" && rawUsers.trim() !== ""
        ? Number(rawUsers)
        : Number.NaN;

  return Number.isInteger(users) && users >= 0 ? users : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// =====================================================================
// DAILY COMPARISON (Proofline)
// =====================================================================

export interface RybbitDailyComparison {
  yesterday: RybbitOverviewData;
  dayBefore: RybbitOverviewData;
}

export interface RybbitOverviewData {
  sessions: number;
  pageviews: number;
  users: number;
  bounce_rate: number;
  pages_per_session: number;
  session_duration: number;
}

/**
 * Fetch Rybbit overview for two consecutive days (yesterday vs day-before).
 * Returns structured comparison or null if unavailable.
 */
export async function fetchRybbitDailyComparison(
  organizationId: number,
  yesterday: string,
  dayBefore: string
): Promise<RybbitDailyComparison | null> {
  const config = await getRybbitSiteConfig(organizationId);

  if (!config) {
    logger.info(`[Rybbit] No rybbit_site_id for org ${organizationId}, skipping website analytics`);
    return null;
  }

  const { siteId, timeZone } = config;
  logger.info(`[Rybbit] Fetching daily comparison for site ${siteId} (${dayBefore} vs ${yesterday})`);

  const [yesterdayData, dayBeforeData] = await Promise.all([
    fetchRybbitOverview(siteId, yesterday, yesterday, timeZone),
    fetchRybbitOverview(siteId, dayBefore, dayBefore, timeZone),
  ]);

  if (!yesterdayData && !dayBeforeData) {
    logger.warn(`[Rybbit] No data returned for either day, skipping`);
    return null;
  }

  return {
    yesterday: extractOverviewMetrics(yesterdayData),
    dayBefore: extractOverviewMetrics(dayBeforeData),
  };
}

// =====================================================================
// MONTHLY COMPARISON (Summary)
// =====================================================================

export interface RybbitMonthlyComparison {
  currentMonth: RybbitOverviewData;
  previousMonth: RybbitOverviewData;
}

/**
 * Fetch Rybbit overview for two month ranges (current vs previous).
 * Returns structured comparison or null if unavailable.
 */
export async function fetchRybbitMonthlyComparison(
  organizationId: number,
  currentStart: string,
  currentEnd: string,
  previousStart: string,
  previousEnd: string
): Promise<RybbitMonthlyComparison | null> {
  const config = await getRybbitSiteConfig(organizationId);

  if (!config) {
    logger.info(`[Rybbit] No rybbit_site_id for org ${organizationId}, skipping website analytics`);
    return null;
  }

  const { siteId, timeZone } = config;
  logger.info(`[Rybbit] Fetching monthly comparison for site ${siteId} (${previousStart}–${previousEnd} vs ${currentStart}–${currentEnd})`);

  const [currentData, previousData] = await Promise.all([
    fetchRybbitOverview(siteId, currentStart, currentEnd, timeZone),
    fetchRybbitOverview(siteId, previousStart, previousEnd, timeZone),
  ]);

  if (!currentData && !previousData) {
    logger.warn(`[Rybbit] No data returned for either month, skipping`);
    return null;
  }

  return {
    currentMonth: extractOverviewMetrics(currentData),
    previousMonth: extractOverviewMetrics(previousData),
  };
}

// =====================================================================
// HELPERS
// =====================================================================

function extractOverviewMetrics(data: any): RybbitOverviewData {
  return {
    sessions: data?.sessions ?? 0,
    pageviews: data?.pageviews ?? 0,
    users: data?.users ?? 0,
    bounce_rate: data?.bounce_rate ?? 0,
    pages_per_session: data?.pages_per_session ?? 0,
    session_duration: data?.session_duration ?? 0,
  };
}
