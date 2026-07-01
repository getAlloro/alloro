import {
  AppUsageDailyPoint,
  AppUsageEventModel,
  AppUsageLowEngagementOrganizationRow,
  AppUsageOrganizationRow,
  AppUsagePageRow,
  AppUsageSummary,
  AppUsageSurfaceRow,
  AppUsageUserRow,
} from "../../../models/AppUsageEventModel";
import {
  AppUsageOrganizationMovementModel,
  AppUsageOrganizationMovementRow,
} from "../../../models/AppUsageOrganizationMovementModel";
import {
  AppUsageOrganizationSummary,
  AppUsageOrganizationTelemetryModel,
} from "../../../models/AppUsageOrganizationTelemetryModel";
import {
  AppUsageUserTelemetryModel,
  AppUsageUserTelemetryRow,
} from "../../../models/AppUsageUserTelemetryModel";
import {
  buildRangeParams,
  fillDailyUsage,
  parseBoolean,
  parseOrganizationId,
  parseRange,
  parseUserId,
  type MissionControlTelemetryRange,
} from "./MissionControlTelemetryRangeUtils";

export type { MissionControlTelemetryRange } from "./MissionControlTelemetryRangeUtils";

export interface MissionControlTelemetryData {
  generatedAt: string;
  range: MissionControlTelemetryRange;
  includePilot: boolean;
  includeAdmin: boolean;
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
  includeAdmin: boolean;
  organizationId: number;
  users: AppUsageUserRow[];
}

export interface MissionControlTelemetryOrganizationDetailData {
  generatedAt: string;
  range: MissionControlTelemetryRange;
  includePilot: boolean;
  includeAdmin: boolean;
  organization: AppUsageOrganizationRow;
  summary: AppUsageOrganizationSummary;
  dailyUsage: AppUsageDailyPoint[];
  surfaceUsage: AppUsageSurfaceRow[];
  pageUsage: AppUsagePageRow[];
  users: AppUsageUserRow[];
  recentMovements: AppUsageOrganizationMovementRow[];
}

export interface MissionControlTelemetryUserDetailData {
  generatedAt: string;
  range: MissionControlTelemetryRange;
  includePilot: boolean;
  includeAdmin: boolean;
  organization: AppUsageOrganizationRow;
  user: AppUsageUserTelemetryRow;
  dailyUsage: AppUsageDailyPoint[];
  surfaceUsage: AppUsageSurfaceRow[];
  pageUsage: AppUsagePageRow[];
  recentMovements: AppUsageOrganizationMovementRow[];
}

export async function getMissionControlTelemetryData(input: {
  range?: unknown;
  includePilot?: unknown;
  includeAdmin?: unknown;
}): Promise<MissionControlTelemetryData> {
  const range = parseRange(input.range);
  const includePilot = parseBoolean(input.includePilot);
  const includeAdmin = parseBoolean(input.includeAdmin);
  const params = buildRangeParams(range, includePilot, includeAdmin);
  const [summary, dailyUsage, surfaceUsage, pageUsage, organizationUsage, lowEngagementOrganizations] =
    await Promise.all([
      AppUsageEventModel.getSummary(params),
      AppUsageEventModel.getDailyUsage(params),
      AppUsageEventModel.getSurfaceUsage(params),
      AppUsageEventModel.getPageUsage(params),
      AppUsageEventModel.getOrganizationUsage(params),
      AppUsageEventModel.getLowEngagementOrganizations(params),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    range,
    includePilot,
    includeAdmin,
    summary,
    dailyUsage: fillDailyUsage(dailyUsage, params.startDate, params.endDate),
    surfaceUsage,
    pageUsage,
    organizationUsage: mergeLowEngagementFlag(
      organizationUsage,
      lowEngagementOrganizations,
    ),
  };
}

// Flags low-engagement orgs on their existing organizationUsage row, and
// appends a synthetic zero-activity row for any that don't have one at all —
// getOrganizationUsage() INNER JOINs to app_usage_events, so a client with
// zero events in range is otherwise silently absent from the list.
function mergeLowEngagementFlag(
  organizationUsage: AppUsageOrganizationRow[],
  lowEngagementOrganizations: AppUsageLowEngagementOrganizationRow[],
): AppUsageOrganizationRow[] {
  const lowEngagementById = new Map(
    lowEngagementOrganizations.map((row) => [row.organizationId, row]),
  );
  const flagged = organizationUsage.map((row) =>
    lowEngagementById.has(row.organizationId)
      ? { ...row, isLowEngagement: true }
      : row,
  );

  const missingOrganizationIds = new Set(flagged.map((row) => row.organizationId));
  const zeroActivityRows: AppUsageOrganizationRow[] = lowEngagementOrganizations
    .filter((row) => !missingOrganizationIds.has(row.organizationId))
    .map((row) => ({
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      domain: row.domain,
      activeUsers: 0,
      sessions: row.sessions,
      pageViews: 0,
      activeMinutes: row.activeMinutes,
      lastActiveAt: null,
      topSurface: null,
      isLowEngagement: true,
    }));

  return [...flagged, ...zeroActivityRows];
}

export async function getMissionControlTelemetryOrganizationDetail(input: {
  organizationId: unknown;
  range?: unknown;
  includePilot?: unknown;
  includeAdmin?: unknown;
}): Promise<MissionControlTelemetryOrganizationDetailData> {
  const organizationId = parseOrganizationId(input.organizationId);
  const range = parseRange(input.range);
  const includePilot = parseBoolean(input.includePilot);
  const includeAdmin = parseBoolean(input.includeAdmin);
  const params = buildRangeParams(range, includePilot, includeAdmin);
  const organization =
    await AppUsageOrganizationTelemetryModel.getOrganization(organizationId);
  if (!organization) throw new Error("Organization not found");

  const [summary, dailyUsage, surfaceUsage, pageUsage, users, recentMovements] =
    await Promise.all([
      AppUsageOrganizationTelemetryModel.getSummary(organizationId, params),
      AppUsageOrganizationTelemetryModel.getDailyUsage(organizationId, params),
      AppUsageOrganizationTelemetryModel.getSurfaceUsage(
        organizationId,
        params,
      ),
      AppUsageOrganizationTelemetryModel.getPageUsage(organizationId, params),
      AppUsageOrganizationTelemetryModel.getUserUsage(organizationId, params),
      AppUsageOrganizationMovementModel.getRecentMovements(
        organizationId,
        params,
      ),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    range,
    includePilot,
    includeAdmin,
    organization: {
      ...organization,
      activeUsers: summary.activeUsers,
      sessions: summary.totalSessions,
      pageViews: summary.totalPageViews,
      activeMinutes: summary.totalActiveMinutes,
      lastActiveAt: summary.lastActiveAt,
      topSurface: summary.topSurface,
    },
    summary,
    dailyUsage: fillDailyUsage(dailyUsage, params.startDate, params.endDate),
    surfaceUsage: surfaceUsage.map((row) => ({
      ...row,
      lastOrganizationId: organization.organizationId,
      lastOrganizationName: organization.organizationName,
      lastUserId: null,
      lastUserName: null,
      lastUserEmail: null,
    })),
    pageUsage: pageUsage.map((row) => ({
      ...row,
      lastOrganizationId: organization.organizationId,
      lastOrganizationName: organization.organizationName,
      lastUserId: null,
      lastUserName: null,
      lastUserEmail: null,
    })),
    users,
    recentMovements,
  };
}

export async function getMissionControlTelemetryUsers(input: {
  organizationId: unknown;
  range?: unknown;
  includePilot?: unknown;
  includeAdmin?: unknown;
}): Promise<MissionControlTelemetryUsersData> {
  const organizationId = parseOrganizationId(input.organizationId);
  const range = parseRange(input.range);
  const includePilot = parseBoolean(input.includePilot);
  const includeAdmin = parseBoolean(input.includeAdmin);
  const params = buildRangeParams(range, includePilot, includeAdmin);
  const users = await AppUsageEventModel.getUserUsageForOrganization(
    organizationId,
    params,
  );

  return {
    generatedAt: new Date().toISOString(),
    range,
    includePilot,
    includeAdmin,
    organizationId,
    users,
  };
}

export async function getMissionControlTelemetryUserDetail(input: {
  organizationId: unknown;
  userId: unknown;
  range?: unknown;
  includePilot?: unknown;
  includeAdmin?: unknown;
}): Promise<MissionControlTelemetryUserDetailData> {
  const organizationId = parseOrganizationId(input.organizationId);
  const userId = parseUserId(input.userId);
  const range = parseRange(input.range);
  const includePilot = parseBoolean(input.includePilot);
  const includeAdmin = parseBoolean(input.includeAdmin);
  const params = buildRangeParams(range, includePilot, includeAdmin);
  const organization =
    await AppUsageOrganizationTelemetryModel.getOrganization(organizationId);
  if (!organization) throw new Error("Organization not found");

  const [user, dailyUsage, surfaceUsage, pageUsage, recentMovements] =
    await Promise.all([
      AppUsageUserTelemetryModel.getUser(organizationId, userId, params),
      AppUsageUserTelemetryModel.getDailyUsage(organizationId, userId, params),
      AppUsageUserTelemetryModel.getSurfaceUsage(
        organizationId,
        userId,
        params,
      ),
      AppUsageUserTelemetryModel.getPageUsage(organizationId, userId, params),
      AppUsageOrganizationMovementModel.getRecentMovements(
        organizationId,
        params,
        userId,
      ),
    ]);
  if (!user) throw new Error("User telemetry not found");

  return {
    generatedAt: new Date().toISOString(),
    range,
    includePilot,
    includeAdmin,
    organization: {
      ...organization,
      activeUsers: 1,
      sessions: user.sessions,
      pageViews: user.pageViews,
      activeMinutes: user.activeMinutes,
      lastActiveAt: user.lastActiveAt,
      topSurface: user.topSurface,
    },
    user,
    dailyUsage: fillDailyUsage(dailyUsage, params.startDate, params.endDate),
    surfaceUsage: surfaceUsage.map((row) => ({
      ...row,
      lastOrganizationId: organization.organizationId,
      lastOrganizationName: organization.organizationName,
      lastUserId: user.userId,
      lastUserName: user.name,
      lastUserEmail: user.email,
    })),
    pageUsage: pageUsage.map((row) => ({
      ...row,
      lastOrganizationId: organization.organizationId,
      lastOrganizationName: organization.organizationName,
      lastUserId: user.userId,
      lastUserName: user.name,
      lastUserEmail: user.email,
    })),
    recentMovements,
  };
}
