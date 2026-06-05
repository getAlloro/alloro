import {
  AppUsageDailyPoint,
  AppUsageEventModel,
  AppUsageOrganizationRow,
  AppUsagePageRow,
  AppUsageSummary,
  AppUsageSurfaceRow,
  AppUsageUserRow,
} from "../../../models/AppUsageEventModel";

export type MissionControlTelemetryRange = "7d" | "30d" | "90d";

export interface MissionControlTelemetryData {
  generatedAt: string;
  range: MissionControlTelemetryRange;
  includePilot: boolean;
  summary: AppUsageSummary;
  dailyUsage: AppUsageDailyPoint[];
  surfaceUsage: AppUsageSurfaceRow[];
  pageUsage: AppUsagePageRow[];
  organizationUsage: AppUsageOrganizationRow[];
}

export interface MissionControlTelemetryUsersData {
  generatedAt: string;
  range: MissionControlTelemetryRange;
  includePilot: boolean;
  organizationId: number;
  users: AppUsageUserRow[];
}

export async function getMissionControlTelemetryData(input: {
  range?: unknown;
  includePilot?: unknown;
}): Promise<MissionControlTelemetryData> {
  const range = parseRange(input.range);
  const includePilot = parseBoolean(input.includePilot);
  const params = buildRangeParams(range, includePilot);
  const [summary, dailyUsage, surfaceUsage, pageUsage, organizationUsage] =
    await Promise.all([
      AppUsageEventModel.getSummary(params),
      AppUsageEventModel.getDailyUsage(params),
      AppUsageEventModel.getSurfaceUsage(params),
      AppUsageEventModel.getPageUsage(params),
      AppUsageEventModel.getOrganizationUsage(params),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    range,
    includePilot,
    summary,
    dailyUsage: fillDailyUsage(dailyUsage, params.startDate, params.endDate),
    surfaceUsage,
    pageUsage,
    organizationUsage,
  };
}

export async function getMissionControlTelemetryUsers(input: {
  organizationId: unknown;
  range?: unknown;
  includePilot?: unknown;
}): Promise<MissionControlTelemetryUsersData> {
  const organizationId = Number(input.organizationId);
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error("Invalid organization id");
  }
  const range = parseRange(input.range);
  const includePilot = parseBoolean(input.includePilot);
  const params = buildRangeParams(range, includePilot);
  const users = await AppUsageEventModel.getUserUsageForOrganization(
    organizationId,
    params,
  );

  return {
    generatedAt: new Date().toISOString(),
    range,
    includePilot,
    organizationId,
    users,
  };
}

function buildRangeParams(range: MissionControlTelemetryRange, includePilot: boolean) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - rangeToDays(range) + 1);
  startDate.setHours(0, 0, 0, 0);
  return { startDate, endDate, includePilot };
}

function parseRange(value: unknown): MissionControlTelemetryRange {
  return value === "7d" || value === "90d" ? value : "30d";
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function rangeToDays(range: MissionControlTelemetryRange): number {
  if (range === "7d") return 7;
  if (range === "90d") return 90;
  return 30;
}

function fillDailyUsage(
  rows: AppUsageDailyPoint[],
  startDate: Date,
  endDate: Date,
): AppUsageDailyPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const days: AppUsageDailyPoint[] = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const date = cursor.toISOString().slice(0, 10);
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
