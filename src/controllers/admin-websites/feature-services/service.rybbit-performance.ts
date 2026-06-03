import { RybbitDataModel, type IRybbitData } from "../../../models/website-builder/RybbitDataModel";
import type { IWebsiteIntegrationSafe } from "../../../models/website-builder/WebsiteIntegrationModel";

const DEFAULT_RANGE_DAYS = 90;
const MAX_RANGE_DAYS = 365;
const DEFAULT_ROWS_LIMIT = 20;
const MAX_ROWS_LIMIT = 100;

const RYBBIT_API_URL = process.env.RYBBIT_API_URL || "";
const RYBBIT_API_KEY = process.env.RYBBIT_API_KEY || "";
const LIVE_FETCH_TIMEOUT_MS = 6000;

export interface RybbitMetricSummary {
  sessions: number;
  pageviews: number;
  users: number;
  bounceRate: number;
  pagesPerSession: number;
  sessionDuration: number;
}

export interface RybbitDailyPoint extends RybbitMetricSummary {
  date: string;
}

export interface RybbitMonthlyPoint extends RybbitMetricSummary {
  /** YYYY-MM */
  month: string;
}

export interface RybbitRawRow extends RybbitDailyPoint {
  id: string;
  raw: Record<string, unknown>;
}

export interface RybbitDashboard {
  rangeDays: number;
  fromDate: string | null;
  toDate: string | null;
  latestReportDate: string | null;
  dataDays: number;
  totals: RybbitMetricSummary;
  daily: RybbitDailyPoint[];
  rows: RybbitRawRow[];
  rowsTotal: number;
  rowsLimit: number;
  rowsOffset: number;
  limitations: string[];
}

function normalizeDateString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).split("T")[0] || null;
}

function addUtcDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

function getRangeDays(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RANGE_DAYS;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_RANGE_DAYS);
}

function getPagination(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 0), max);
}

function readNumber(data: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function metricsFromPayload(payload: unknown): RybbitMetricSummary {
  const outer =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
  const data =
    outer.data && typeof outer.data === "object" && !Array.isArray(outer.data)
      ? outer.data as Record<string, unknown>
      : outer;
  const sessions = readNumber(data, ["sessions", "visits"]);
  const pageviews = readNumber(data, ["pageviews", "pageViews"]);
  const users = readNumber(data, ["users", "visitors", "uniqueVisitors"]);
  const rawBounceRate = readNumber(data, ["bounce_rate", "bounceRate"]);
  const bounceRate = rawBounceRate > 1 ? rawBounceRate / 100 : rawBounceRate;

  return {
    sessions,
    pageviews,
    users,
    bounceRate,
    pagesPerSession:
      readNumber(data, ["pages_per_session", "pagesPerSession"]) ||
      (sessions > 0 ? pageviews / sessions : 0),
    sessionDuration: readNumber(data, [
      "session_duration",
      "sessionDuration",
      "averageSessionDuration",
    ]),
  };
}

function emptyMetrics(): RybbitMetricSummary {
  return {
    sessions: 0,
    pageviews: 0,
    users: 0,
    bounceRate: 0,
    pagesPerSession: 0,
    sessionDuration: 0,
  };
}

function summarizeDaily(points: RybbitDailyPoint[]): RybbitMetricSummary {
  const totals = points.reduce(
    (acc, point) => {
      acc.sessions += point.sessions;
      acc.pageviews += point.pageviews;
      acc.users += point.users;
      acc.weightedBounceRate += point.bounceRate * point.sessions;
      acc.weightedDuration += point.sessionDuration * point.sessions;
      return acc;
    },
    {
      sessions: 0,
      pageviews: 0,
      users: 0,
      weightedBounceRate: 0,
      weightedDuration: 0,
    },
  );

  return {
    sessions: Math.round(totals.sessions),
    pageviews: Math.round(totals.pageviews),
    users: Math.round(totals.users),
    bounceRate: totals.sessions > 0 ? totals.weightedBounceRate / totals.sessions : 0,
    pagesPerSession: totals.sessions > 0 ? totals.pageviews / totals.sessions : 0,
    sessionDuration: totals.sessions > 0 ? totals.weightedDuration / totals.sessions : 0,
  };
}

function rowToDailyPoint(row: IRybbitData): RybbitDailyPoint {
  return {
    date: normalizeDateString(row.report_date) ?? String(row.report_date),
    ...metricsFromPayload(row.data),
  };
}

function rowToRawRow(row: IRybbitData): RybbitRawRow {
  return {
    id: row.id,
    raw: row.data,
    ...rowToDailyPoint(row),
  };
}

function emptyDashboard(
  rangeDays: number,
  rowsLimit: number,
  rowsOffset: number,
): RybbitDashboard {
  return {
    rangeDays,
    fromDate: null,
    toDate: null,
    latestReportDate: null,
    dataDays: 0,
    totals: emptyMetrics(),
    daily: [],
    rows: [],
    rowsTotal: 0,
    rowsLimit,
    rowsOffset,
    limitations: [],
  };
}

export async function getDashboard(
  integration: IWebsiteIntegrationSafe,
  rangeDaysInput: unknown,
  rowsLimitInput: unknown,
  rowsOffsetInput: unknown,
): Promise<RybbitDashboard> {
  const rangeDays = getRangeDays(rangeDaysInput);
  const rowsLimit = getPagination(rowsLimitInput, DEFAULT_ROWS_LIMIT, MAX_ROWS_LIMIT);
  const rowsOffset = getPagination(rowsOffsetInput, 0, Number.MAX_SAFE_INTEGER);

  if (integration.platform !== "rybbit") {
    return emptyDashboard(rangeDays, rowsLimit, rowsOffset);
  }

  const latestReportDate = normalizeDateString(
    await RybbitDataModel.findLatestReportDate(integration.project_id),
  );
  if (!latestReportDate) {
    return emptyDashboard(rangeDays, rowsLimit, rowsOffset);
  }

  const fromDate = addUtcDays(latestReportDate, -(rangeDays - 1));
  const [dailyRows, paginatedRows] = await Promise.all([
    RybbitDataModel.findByProjectAndDateRange(
      integration.project_id,
      fromDate,
      latestReportDate,
    ),
    RybbitDataModel.findRowsByProject(integration.project_id, {
      limit: rowsLimit,
      offset: rowsOffset,
    }),
  ]);
  const daily = dailyRows
    .map(rowToDailyPoint)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    rangeDays,
    fromDate,
    toDate: latestReportDate,
    latestReportDate,
    dataDays: daily.length,
    totals: summarizeDaily(daily),
    daily,
    rows: paginatedRows.data.map(rowToRawRow),
    rowsTotal: paginatedRows.total,
    rowsLimit,
    rowsOffset,
    limitations: [],
  };
}

function getSiteId(integration: IWebsiteIntegrationSafe): string | null {
  const value = (integration.metadata as { siteId?: string } | null)?.siteId;
  const siteId = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{1,128}$/.test(siteId) ? siteId : null;
}

async function rybbitGet(path: string): Promise<unknown | null> {
  if (!RYBBIT_API_URL || !RYBBIT_API_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${RYBBIT_API_URL}${path}`, {
      headers: { Authorization: `Bearer ${RYBBIT_API_KEY}` },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live TRUE unique-visitor totals for a period, deduped by Rybbit in a single
 * `/overview` query. Summing the stored daily `users` over-counts repeat
 * visitors (~10%); sessions/pageviews are additive so the stored sum is fine.
 * Returns null on any failure so callers fall back to the stored totals.
 */
export async function fetchRybbitOverview(
  integration: IWebsiteIntegrationSafe,
  startDate: string,
  endDate: string,
  timeZone: string,
): Promise<RybbitMetricSummary | null> {
  const siteId = getSiteId(integration);
  if (!siteId) return null;
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    time_zone: timeZone,
  });
  const payload = await rybbitGet(`/api/sites/${siteId}/overview?${params}`);
  return payload ? metricsFromPayload(payload) : null;
}

/**
 * Live per-MONTH series with TRUE unique visitors — one `overview-bucketed`
 * call (Rybbit dedupes uniques within each month bucket). Months with no data
 * come back zero-filled. Returns null on failure so callers fall back to
 * aggregating the stored daily rows.
 */
export async function fetchRybbitMonthlyUniques(
  integration: IWebsiteIntegrationSafe,
  startDate: string,
  endDate: string,
  timeZone: string,
): Promise<RybbitMonthlyPoint[] | null> {
  const siteId = getSiteId(integration);
  if (!siteId) return null;
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    time_zone: timeZone,
    bucket: "month",
  });
  const payload = await rybbitGet(
    `/api/sites/${siteId}/overview-bucketed?${params}`,
  );
  const outer =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { data?: unknown }).data
      : payload;
  if (!Array.isArray(outer)) return null;
  return outer.map((bucket) => {
    const time = (bucket as { time?: unknown }).time;
    const month = typeof time === "string" ? time.slice(0, 7) : "";
    return { month, ...metricsFromPayload(bucket) };
  });
}
