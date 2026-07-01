import {
  AppUsageBucketGranularity,
  AppUsageDailyPoint,
  AppUsageRangeParams,
} from "../../../models/AppUsageEventModel";

export type MissionControlTelemetryRange =
  | "7d"
  | "30d"
  | "90d"
  | "mtd"
  | "12m"
  | "ytd";

const RANGE_VALUES: MissionControlTelemetryRange[] = [
  "7d",
  "30d",
  "90d",
  "mtd",
  "12m",
  "ytd",
];

// 12m and ytd aggregate by calendar month; the rest plot daily.
const MONTHLY_RANGES: MissionControlTelemetryRange[] = ["12m", "ytd"];

export function parseOrganizationId(value: unknown): number {
  const organizationId = Number(value);
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error("Invalid organization id");
  }
  return organizationId;
}

export function parseUserId(value: unknown): number {
  const userId = Number(value);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid user id");
  }
  return userId;
}

export function buildRangeParams(
  range: MissionControlTelemetryRange,
  includePilot: boolean,
  includeAdmin: boolean,
): AppUsageRangeParams {
  const endDate = new Date();
  const startDate = rangeStartDate(range, endDate);
  startDate.setHours(0, 0, 0, 0);
  const granularity: AppUsageBucketGranularity = MONTHLY_RANGES.includes(range)
    ? "month"
    : "day";
  return { startDate, endDate, includePilot, includeAdmin, granularity };
}

export function parseRange(value: unknown): MissionControlTelemetryRange {
  return RANGE_VALUES.includes(value as MissionControlTelemetryRange)
    ? (value as MissionControlTelemetryRange)
    : "30d";
}

function rangeStartDate(
  range: MissionControlTelemetryRange,
  endDate: Date,
): Date {
  if (range === "mtd") {
    return new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  }
  if (range === "12m") {
    return new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1);
  }
  if (range === "ytd") {
    return new Date(endDate.getFullYear(), 0, 1);
  }
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - rangeToDays(range) + 1);
  return startDate;
}

export function parseBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

export function fillDailyUsage(
  rows: AppUsageDailyPoint[],
  startDate: Date,
  endDate: Date,
  granularity: AppUsageBucketGranularity = "day",
): AppUsageDailyPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const buckets: AppUsageDailyPoint[] = [];
  const cursor =
    granularity === "month"
      ? new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      : new Date(startDate);
  while (cursor <= endDate) {
    const date = formatLocalDateKey(
      granularity === "month"
        ? new Date(cursor.getFullYear(), cursor.getMonth(), 1)
        : cursor,
    );
    buckets.push(
      byDate.get(date) ?? {
        date,
        activeUsers: 0,
        activeOrganizations: 0,
        pageViews: 0,
        activeMinutes: 0,
      },
    );
    if (granularity === "month") cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  return buckets;
}

function rangeToDays(range: MissionControlTelemetryRange): number {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  return 30;
}

function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
