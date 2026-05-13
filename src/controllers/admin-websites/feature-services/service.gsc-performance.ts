import { GscDataModel, type IGscData } from "../../../models/website-builder/GscDataModel";
import type { IWebsiteIntegrationSafe } from "../../../models/website-builder/WebsiteIntegrationModel";

const DEFAULT_RANGE_DAYS = 90;
const MAX_RANGE_DAYS = 548;
const TOP_LIMIT = 10;

type MetricAccumulator = {
  clicks: number;
  impressions: number;
  weightedPosition: number;
  sourceRows: number;
};

type GscResponsePayload = {
  rows?: unknown;
};

type GscStoredPayload = Record<string, unknown> & {
  schemaVersion?: unknown;
  summary?: GscResponsePayload;
  queries?: GscResponsePayload;
  pages?: GscResponsePayload;
  countries?: GscResponsePayload;
  devices?: GscResponsePayload;
};

export type GscMetricSummary = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscDailyPoint = GscMetricSummary & {
  date: string;
  sourceRows: number;
};

export type GscDimensionRow = GscMetricSummary & {
  key: string;
};

export type GscPerformanceDashboard = {
  rangeDays: number;
  fromDate: string | null;
  toDate: string | null;
  latestReportDate: string | null;
  dataDays: number;
  totals: GscMetricSummary;
  daily: GscDailyPoint[];
  topQueries: GscDimensionRow[];
  topPages: GscDimensionRow[];
  topCountries: GscDimensionRow[];
  topDevices: GscDimensionRow[];
  limitations: string[];
};

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

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readRows(data: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(data.rows)
    ? data.rows.filter((row): row is Record<string, unknown> => {
        return !!row && typeof row === "object" && !Array.isArray(row);
      })
    : [];
}

function readPayloadRows(payload: unknown): Array<Record<string, unknown>> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? readRows(payload as Record<string, unknown>)
    : [];
}

function isVersionedPayload(data: GscStoredPayload): boolean {
  const schemaVersion = Number(data.schemaVersion);
  return Number.isFinite(schemaVersion) && schemaVersion >= 2;
}

function readSummaryRows(data: GscStoredPayload): Array<Record<string, unknown>> {
  return isVersionedPayload(data) ? readPayloadRows(data.summary) : readRows(data);
}

function readQueryRows(data: GscStoredPayload): Array<Record<string, unknown>> {
  return isVersionedPayload(data) ? readPayloadRows(data.queries) : readRows(data);
}

function readPageRows(data: GscStoredPayload): Array<Record<string, unknown>> {
  return isVersionedPayload(data) ? readPayloadRows(data.pages) : readRows(data);
}

function readCountryRows(data: GscStoredPayload): Array<Record<string, unknown>> {
  return isVersionedPayload(data) ? readPayloadRows(data.countries) : [];
}

function readDeviceRows(data: GscStoredPayload): Array<Record<string, unknown>> {
  return isVersionedPayload(data) ? readPayloadRows(data.devices) : [];
}

function readKey(row: Record<string, unknown>, index: number): string | null {
  const keys = row.keys;
  if (!Array.isArray(keys)) return null;
  const key = keys[index];
  return typeof key === "string" && key.trim() ? key : null;
}

function createAccumulator(): MetricAccumulator {
  return {
    clicks: 0,
    impressions: 0,
    weightedPosition: 0,
    sourceRows: 0,
  };
}

function addRowMetrics(acc: MetricAccumulator, row: Record<string, unknown>): void {
  const clicks = readNumber(row.clicks);
  const impressions = readNumber(row.impressions);
  const position = readNumber(row.position);

  acc.clicks += clicks;
  acc.impressions += impressions;
  acc.weightedPosition += position * impressions;
  acc.sourceRows += 1;
}

function summarize(acc: MetricAccumulator): GscMetricSummary {
  return {
    clicks: Math.round(acc.clicks),
    impressions: Math.round(acc.impressions),
    ctr: acc.impressions > 0 ? acc.clicks / acc.impressions : 0,
    position:
      acc.impressions > 0 ? acc.weightedPosition / acc.impressions : 0,
  };
}

function addDimensionRow(
  map: Map<string, MetricAccumulator>,
  key: string | null,
  row: Record<string, unknown>,
): void {
  if (!key) return;
  const acc = map.get(key) ?? createAccumulator();
  addRowMetrics(acc, row);
  map.set(key, acc);
}

function buildDimensionRows(
  map: Map<string, MetricAccumulator>,
): GscDimensionRow[] {
  return Array.from(map.entries())
    .map(([key, acc]) => ({ key, ...summarize(acc) }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, TOP_LIMIT);
}

function emptyDashboard(rangeDays: number): GscPerformanceDashboard {
  return {
    rangeDays,
    fromDate: null,
    toDate: null,
    latestReportDate: null,
    dataDays: 0,
    totals: summarize(createAccumulator()),
    daily: [],
    topQueries: [],
    topPages: [],
    topCountries: [],
    topDevices: [],
    limitations: [],
  };
}

export async function getDashboard(
  integration: IWebsiteIntegrationSafe,
  rangeDaysInput: unknown,
): Promise<GscPerformanceDashboard> {
  if (integration.platform !== "gsc") {
    return emptyDashboard(getRangeDays(rangeDaysInput));
  }

  const rangeDays = getRangeDays(rangeDaysInput);
  const latestReportDate = normalizeDateString(
    await GscDataModel.findLatestReportDate(integration.project_id),
  );

  if (!latestReportDate) {
    return emptyDashboard(rangeDays);
  }

  const fromDate = addUtcDays(latestReportDate, -(rangeDays - 1));
  const rows = await GscDataModel.findByProjectAndDateRange(
    integration.project_id,
    fromDate,
    latestReportDate,
  );

  const totals = createAccumulator();
  const queryMap = new Map<string, MetricAccumulator>();
  const pageMap = new Map<string, MetricAccumulator>();
  const countryMap = new Map<string, MetricAccumulator>();
  const deviceMap = new Map<string, MetricAccumulator>();
  let legacyPayloads = 0;

  const daily = rows
    .map((day: IGscData): GscDailyPoint => {
      const dayAcc = createAccumulator();
      const data = day.data as GscStoredPayload;

      if (!isVersionedPayload(data)) {
        legacyPayloads += 1;
      }

      for (const row of readSummaryRows(data)) {
        addRowMetrics(dayAcc, row);
        addRowMetrics(totals, row);
      }

      for (const row of readQueryRows(data)) {
        addDimensionRow(queryMap, readKey(row, 0), row);
      }

      for (const row of readPageRows(data)) {
        addDimensionRow(
          pageMap,
          isVersionedPayload(data) ? readKey(row, 0) : readKey(row, 1),
          row,
        );
      }

      for (const row of readCountryRows(data)) {
        addDimensionRow(countryMap, readKey(row, 0), row);
      }

      for (const row of readDeviceRows(data)) {
        addDimensionRow(deviceMap, readKey(row, 0), row);
      }

      return {
        date: normalizeDateString(day.report_date) ?? String(day.report_date),
        sourceRows: dayAcc.sourceRows,
        ...summarize(dayAcc),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    rangeDays,
    fromDate,
    toDate: latestReportDate,
    latestReportDate,
    dataDays: rows.length,
    totals: summarize(totals),
    daily,
    topQueries: buildDimensionRows(queryMap),
    topPages: buildDimensionRows(pageMap),
    topCountries: buildDimensionRows(countryMap),
    topDevices: buildDimensionRows(deviceMap),
    limitations: [
      ...(legacyPayloads > 0
        ? [
            `${legacyPayloads} stored day(s) use the legacy query/page payload. Run Fetch History again to rebuild dashboard-safe metrics.`,
          ]
        : []),
    ],
  };
}
