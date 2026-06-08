import {
  AppUsageDailyPoint,
  AppUsageRangeParams,
} from "../../../models/AppUsageEventModel";

export type MissionControlTelemetryRange = "7d" | "30d" | "90d";

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
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - rangeToDays(range) + 1);
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate, includePilot, includeAdmin };
}

export function parseRange(value: unknown): MissionControlTelemetryRange {
  return value === "7d" || value === "90d" ? value : "30d";
}

export function parseBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

export function fillDailyUsage(
  rows: AppUsageDailyPoint[],
  startDate: Date,
  endDate: Date,
): AppUsageDailyPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const days: AppUsageDailyPoint[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const date = formatLocalDateKey(cursor);
    days.push(
      byDate.get(date) ?? {
        date,
        activeUsers: 0,
        pageViews: 0,
        activeMinutes: 0,
      },
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
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
