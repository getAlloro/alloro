import { db } from "../database/connection";
import { AppUsageDailyPoint, AppUsageRangeParams } from "./AppUsageEventModel";
import {
  APP_USAGE_EVENTS_TABLE,
  APP_USAGE_PAGE_VIEW_EVENT,
  AppUsageQueryRow,
  buildOrganizationUserUsageQuery,
  buildPageUsageKey,
  roundUsageMinutes,
} from "./appUsageTelemetryQueryHelpers";
import {
  AppUsageOrganizationPageRow,
  AppUsageOrganizationSurfaceRow,
} from "./AppUsageOrganizationTelemetryModel";

export interface AppUsageUserTelemetryRow {
  userId: number;
  name: string | null;
  email: string;
  role: string | null;
  sessions: number;
  pageViews: number;
  activeMinutes: number;
  lastActiveAt: string | null;
  topSurface: string | null;
}

export class AppUsageUserTelemetryModel {
  static async getUser(
    organizationId: number,
    userId: number,
    params: AppUsageRangeParams,
  ): Promise<AppUsageUserTelemetryRow | null> {
    const row = await this.base(organizationId, userId, params)
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
      .first();

    if (!row) return null;
    return {
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
      topSurface: await this.getTopSurface(organizationId, userId, params),
    };
  }

  static async getDailyUsage(
    organizationId: number,
    userId: number,
    params: AppUsageRangeParams,
  ): Promise<AppUsageDailyPoint[]> {
    const rows = (await this.base(organizationId, userId, params)
      .select(db.raw("created_at::date::text as date"))
      .select(db.raw("1::int as active_users"))
      .select(
        db.raw("COUNT(*) FILTER (WHERE event_name = ?)::int as page_views", [
          APP_USAGE_PAGE_VIEW_EVENT,
        ]),
      )
      .sum("active_seconds as active_seconds")
      .groupByRaw("created_at::date")
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
    userId: number,
    params: AppUsageRangeParams,
  ): Promise<AppUsageOrganizationSurfaceRow[]> {
    const rows = (await this.base(organizationId, userId, params)
      .whereNotNull("surface")
      .select("surface")
      .select(db.raw("1::int as active_users"))
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
    userId: number,
    params: AppUsageRangeParams,
  ): Promise<AppUsageOrganizationPageRow[]> {
    const rows = (await this.base(organizationId, userId, params)
      .where("event_name", APP_USAGE_PAGE_VIEW_EVENT)
      .whereNotNull("route_template")
      .select("route_template", "page_label", "surface")
      .count("id as page_views")
      .select(db.raw("1::int as active_users"))
      .select(db.raw("1::int as active_organizations"))
      .groupBy("route_template", "page_label", "surface")
      .orderBy("page_views", "desc")
      .limit(12)) as AppUsageQueryRow[];

    const activeMinutesByPage = await this.getActiveMinutesByPage(
      organizationId,
      userId,
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

  private static base(
    organizationId: number,
    userId: number,
    params: AppUsageRangeParams,
  ) {
    return buildOrganizationUserUsageQuery(organizationId, userId, params);
  }

  private static async getTopSurface(
    organizationId: number,
    userId: number,
    params: AppUsageRangeParams,
  ): Promise<string | null> {
    const row = await this.base(organizationId, userId, params)
      .where("event_name", APP_USAGE_PAGE_VIEW_EVENT)
      .whereNotNull("surface")
      .select("surface")
      .count("id as count")
      .groupBy("surface")
      .orderBy("count", "desc")
      .first();
    return typeof row?.surface === "string" ? row.surface : null;
  }

  private static async getActiveMinutesByPage(
    organizationId: number,
    userId: number,
    params: AppUsageRangeParams,
  ) {
    const rows = (await this.base(organizationId, userId, params)
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
