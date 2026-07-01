import { db } from "../database/connection";
import { AppUsageRangeParams, AppUsageUserRow } from "./AppUsageEventModel";
import {
  APP_USAGE_EVENTS_TABLE,
  APP_USAGE_PAGE_VIEW_EVENT,
  AppUsageQueryRow,
  buildOrganizationUsageQuery,
  buildPageUsageKey,
  roundUsageMinutes,
} from "./appUsageTelemetryQueryHelpers";

export interface AppUsageOrganizationProfile {
  organizationId: number;
  organizationName: string;
  domain: string | null;
}

export interface AppUsageOrganizationSummary {
  activeUsers: number;
  totalSessions: number;
  totalPageViews: number;
  totalActiveMinutes: number;
  averageActiveMinutesPerUser: number;
  lastActiveAt: string | null;
  topSurface: string | null;
}

export interface AppUsageOrganizationDailyPoint {
  date: string;
  activeUsers: number;
  pageViews: number;
  activeMinutes: number;
}

export interface AppUsageOrganizationSurfaceRow {
  surface: string;
  pageViews: number;
  activeUsers: number;
  activeOrganizations: number;
  activeMinutes: number;
}

export interface AppUsageOrganizationPageRow {
  routeTemplate: string;
  pageLabel: string | null;
  surface: string | null;
  pageViews: number;
  activeUsers: number;
  activeOrganizations: number;
  activeMinutes: number;
}

type AppUsageOrganizationSummaryAggregateRow = {
  active_users?: string | number | null;
  total_sessions?: string | number | null;
  page_views?: string | number | null;
  active_seconds?: string | number | null;
  last_active_at?: Date | string | null;
};

export class AppUsageOrganizationTelemetryModel {
  static async getOrganization(
    organizationId: number,
  ): Promise<AppUsageOrganizationProfile | null> {
    const row = await db("organizations")
      .select("id", "name", "domain")
      .where("id", organizationId)
      .first();

    if (!row) return null;
    return {
      organizationId: Number(row.id),
      organizationName: row.name,
      domain: row.domain ?? null,
    };
  }

  static async getSummary(
    organizationId: number,
    params: AppUsageRangeParams,
  ): Promise<AppUsageOrganizationSummary> {
    const [row, topSurface] = await Promise.all([
      this.base(organizationId, params)
        .countDistinct<{ active_users: string }>("user_id as active_users")
        .countDistinct<{ total_sessions: string }>(
          "session_id as total_sessions",
        )
        .select(
          db.raw("COUNT(*) FILTER (WHERE event_name = ?)::int as page_views", [
            APP_USAGE_PAGE_VIEW_EVENT,
          ]),
        )
        .sum<{ active_seconds: string | null }>(
          "active_seconds as active_seconds",
        )
        .max<{ last_active_at: Date | null }>("created_at as last_active_at")
        .first() as Promise<
        AppUsageOrganizationSummaryAggregateRow | undefined
      >,
      this.getTopSurface(organizationId, params),
    ]);
    const activeUsers = Number(row?.active_users ?? 0);
    const activeSeconds = Number(row?.active_seconds ?? 0);

    return {
      activeUsers,
      totalSessions: Number(row?.total_sessions ?? 0),
      totalPageViews: Number(row?.page_views ?? 0),
      totalActiveMinutes: roundUsageMinutes(activeSeconds),
      averageActiveMinutesPerUser: activeUsers
        ? roundUsageMinutes(activeSeconds / activeUsers)
        : 0,
      lastActiveAt: row?.last_active_at
        ? new Date(row.last_active_at).toISOString()
        : null,
      topSurface,
    };
  }

  static async getDailyUsage(
    organizationId: number,
    params: AppUsageRangeParams,
  ): Promise<AppUsageOrganizationDailyPoint[]> {
    const rows = (await this.base(organizationId, params)
      .select(
        db.raw("date_trunc(?, created_at)::date::text as date", [
          params.granularity,
        ]),
      )
      .countDistinct("user_id as active_users")
      .select(
        db.raw("COUNT(*) FILTER (WHERE event_name = ?)::int as page_views", [
          APP_USAGE_PAGE_VIEW_EVENT,
        ]),
      )
      .sum("active_seconds as active_seconds")
      .groupByRaw("date_trunc(?, created_at)", [params.granularity])
      .orderBy("date", "asc")) as AppUsageQueryRow[];

    return rows.map((row) => ({
      date: row.date,
      activeUsers: Number(row.active_users ?? 0),
      pageViews: Number(row.page_views ?? 0),
      activeMinutes: roundUsageMinutes(Number(row.active_seconds ?? 0)),
    }));
  }

  static async getSurfaceUsage(
    organizationId: number,
    params: AppUsageRangeParams,
  ): Promise<AppUsageOrganizationSurfaceRow[]> {
    const rows = (await this.base(organizationId, params)
      .whereNotNull("surface")
      .select("surface")
      .countDistinct("user_id as active_users")
      .select(db.raw("1::int as active_organizations"))
      .select(
        db.raw("COUNT(*) FILTER (WHERE event_name = ?)::int as page_views", [
          APP_USAGE_PAGE_VIEW_EVENT,
        ]),
      )
      .sum("active_seconds as active_seconds")
      .groupBy("surface")
      .orderBy("page_views", "desc")
      .limit(8)) as AppUsageQueryRow[];

    return rows.map((row) => ({
      surface: row.surface,
      pageViews: Number(row.page_views ?? 0),
      activeUsers: Number(row.active_users ?? 0),
      activeOrganizations: Number(row.active_organizations ?? 0),
      activeMinutes: roundUsageMinutes(Number(row.active_seconds ?? 0)),
    }));
  }

  static async getPageUsage(
    organizationId: number,
    params: AppUsageRangeParams,
  ): Promise<AppUsageOrganizationPageRow[]> {
    const rows = (await this.base(organizationId, params)
      .where("event_name", APP_USAGE_PAGE_VIEW_EVENT)
      .whereNotNull("route_template")
      .select("route_template", "page_label", "surface")
      .count("id as page_views")
      .countDistinct("user_id as active_users")
      .select(db.raw("1::int as active_organizations"))
      .groupBy("route_template", "page_label", "surface")
      .orderBy("page_views", "desc")
      .limit(12)) as AppUsageQueryRow[];

    const activeMinutesByPage = await this.getActiveMinutesByPage(
      organizationId,
      params,
    );
    return rows.map((row) => ({
      routeTemplate: row.route_template,
      pageLabel: row.page_label,
      surface: row.surface,
      pageViews: Number(row.page_views ?? 0),
      activeUsers: Number(row.active_users ?? 0),
      activeOrganizations: Number(row.active_organizations ?? 0),
      activeMinutes: activeMinutesByPage.get(buildPageUsageKey(row)) ?? 0,
    }));
  }

  static async getUserUsage(
    organizationId: number,
    params: AppUsageRangeParams,
  ): Promise<AppUsageUserRow[]> {
    const rows = (await this.base(organizationId, params)
      .join("users as u", `${APP_USAGE_EVENTS_TABLE}.user_id`, "u.id")
      .select(`${APP_USAGE_EVENTS_TABLE}.user_id`, "u.name", "u.email")
      .max(`${APP_USAGE_EVENTS_TABLE}.user_role as role`)
      .countDistinct(`${APP_USAGE_EVENTS_TABLE}.session_id as sessions`)
      .select(
        db.raw("COUNT(*) FILTER (WHERE event_name = ?)::int as page_views", [
          APP_USAGE_PAGE_VIEW_EVENT,
        ]),
      )
      .sum(`${APP_USAGE_EVENTS_TABLE}.active_seconds as active_seconds`)
      .max(`${APP_USAGE_EVENTS_TABLE}.created_at as last_active_at`)
      .groupBy(`${APP_USAGE_EVENTS_TABLE}.user_id`, "u.name", "u.email")
      .orderBy("last_active_at", "desc")) as AppUsageQueryRow[];

    const topSurfaces = await this.getTopSurfaceByUser(organizationId, params);
    return rows.map((row) => ({
      userId: Number(row.user_id),
      name: row.name ?? null,
      email: row.email,
      role: row.role ?? null,
      sessions: Number(row.sessions ?? 0),
      pageViews: Number(row.page_views ?? 0),
      activeMinutes: roundUsageMinutes(Number(row.active_seconds ?? 0)),
      lastActiveAt: row.last_active_at
        ? new Date(row.last_active_at).toISOString()
        : null,
      topSurface: topSurfaces.get(Number(row.user_id)) ?? null,
    }));
  }

  private static base(organizationId: number, params: AppUsageRangeParams) {
    return buildOrganizationUsageQuery(organizationId, params);
  }

  private static async getTopSurface(
    organizationId: number,
    params: AppUsageRangeParams,
  ): Promise<string | null> {
    const row = await this.base(organizationId, params)
      .where("event_name", APP_USAGE_PAGE_VIEW_EVENT)
      .whereNotNull("surface")
      .select("surface")
      .count("id as count")
      .groupBy("surface")
      .orderBy("count", "desc")
      .first();
    return typeof row?.surface === "string" ? row.surface : null;
  }

  private static async getTopSurfaceByUser(
    organizationId: number,
    params: AppUsageRangeParams,
  ) {
    const rows = (await this.base(organizationId, params)
      .where("event_name", APP_USAGE_PAGE_VIEW_EVENT)
      .whereNotNull("user_id")
      .whereNotNull("surface")
      .select("user_id", "surface")
      .count("id as count")
      .groupBy("user_id", "surface")
      .orderBy("count", "desc")) as AppUsageQueryRow[];
    const top = new Map<number, string>();
    for (const row of rows) {
      const userId = Number(row.user_id);
      if (!top.has(userId)) top.set(userId, row.surface);
    }
    return top;
  }

  private static async getActiveMinutesByPage(
    organizationId: number,
    params: AppUsageRangeParams,
  ) {
    const rows = (await this.base(organizationId, params)
      .whereNotNull("route_template")
      .select("route_template", "page_label", "surface")
      .sum("active_seconds as active_seconds")
      .groupBy(
        "route_template",
        "page_label",
        "surface",
      )) as AppUsageQueryRow[];
    return new Map(
      rows.map((row) => [
        buildPageUsageKey(row),
        roundUsageMinutes(Number(row.active_seconds ?? 0)),
      ]),
    );
  }
}
