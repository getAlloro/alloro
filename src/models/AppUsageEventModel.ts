import { db } from "../database/connection";
import type { QueryContext } from "./BaseModel";

const TABLE = "app_usage_events";
const PAGE_VIEW_EVENT = "app.page_viewed";
type QueryRow = Record<string, any>;

export interface AppUsageEventInsert {
  event_name: string;
  event_category: string;
  source: string;
  user_id: number | null;
  organization_id: number | null;
  user_role: string | null;
  session_id: string;
  route_template: string | null;
  surface: string | null;
  page_label: string | null;
  active_seconds: number;
  is_pilot_session: boolean;
  properties: Record<string, unknown>;
  occurred_at: Date;
}

export interface AppUsageRangeParams {
  startDate: Date;
  endDate: Date;
  includePilot: boolean;
}

export interface AppUsageSummary {
  activeOrganizations: number;
  activeUsers: number;
  totalSessions: number;
  totalPageViews: number;
  totalActiveMinutes: number;
  averageActiveMinutesPerUser: number;
  inactivePaidOrganizations: number;
}

export interface AppUsageDailyPoint {
  date: string;
  activeUsers: number;
  pageViews: number;
  activeMinutes: number;
}

export interface AppUsageSurfaceRow {
  surface: string;
  pageViews: number;
  activeUsers: number;
  activeOrganizations: number;
  activeMinutes: number;
}

export interface AppUsagePageRow {
  routeTemplate: string;
  pageLabel: string | null;
  surface: string | null;
  pageViews: number;
  activeUsers: number;
  activeMinutes: number;
}

export interface AppUsageOrganizationRow {
  organizationId: number;
  organizationName: string;
  domain: string | null;
  activeUsers: number;
  sessions: number;
  pageViews: number;
  activeMinutes: number;
  lastActiveAt: string | null;
  topSurface: string | null;
}

export interface AppUsageUserRow {
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

export class AppUsageEventModel {
  static async createMany(
    events: AppUsageEventInsert[],
    trx?: QueryContext,
  ): Promise<number> {
    if (events.length === 0) return 0;
    await (trx || db)(TABLE).insert(
      events.map((event) => ({
        ...event,
        properties: JSON.stringify(event.properties),
        created_at: new Date(),
      })),
    );
    return events.length;
  }

  static async getSummary(params: AppUsageRangeParams): Promise<AppUsageSummary> {
    const [orgs, users, sessions, pages, active, inactive] = await Promise.all([
      this.countDistinct(params, "organization_id"),
      this.countDistinct(params, "user_id"),
      this.countDistinct(params, "session_id"),
      this.base(params).where("event_name", PAGE_VIEW_EVENT).count<{ count: string }>("id as count").first(),
      this.base(params).sum<{ total: string | null }>("active_seconds as total").first(),
      this.countInactivePaidOrganizations(params),
    ]);
    const totalActiveMinutes = roundMinutes(Number(active?.total ?? 0));
    const activeUsers = Number(users?.count ?? 0);

    return {
      activeOrganizations: Number(orgs?.count ?? 0),
      activeUsers,
      totalSessions: Number(sessions?.count ?? 0),
      totalPageViews: Number(pages?.count ?? 0),
      totalActiveMinutes,
      averageActiveMinutesPerUser: activeUsers
        ? roundMinutes(Number(active?.total ?? 0) / activeUsers)
        : 0,
      inactivePaidOrganizations: Number(inactive?.count ?? 0),
    };
  }

  static async getDailyUsage(
    params: AppUsageRangeParams,
  ): Promise<AppUsageDailyPoint[]> {
    const rows = (await this.base(params)
      .select(db.raw("created_at::date::text as date"))
      .countDistinct("user_id as active_users")
      .select(
        db.raw(
          "COUNT(*) FILTER (WHERE event_name = ?)::int as page_views",
          [PAGE_VIEW_EVENT],
        ),
      )
      .sum("active_seconds as active_seconds")
      .groupByRaw("created_at::date")
      .orderBy("date", "asc")) as QueryRow[];

    return rows.map((row) => ({
      date: row.date,
      activeUsers: Number(row.active_users ?? 0),
      pageViews: Number(row.page_views ?? 0),
      activeMinutes: roundMinutes(Number(row.active_seconds ?? 0)),
    }));
  }

  static async getSurfaceUsage(
    params: AppUsageRangeParams,
  ): Promise<AppUsageSurfaceRow[]> {
    const rows = (await this.base(params)
      .whereNotNull("surface")
      .select("surface")
      .countDistinct("user_id as active_users")
      .countDistinct("organization_id as active_organizations")
      .select(
        db.raw(
          "COUNT(*) FILTER (WHERE event_name = ?)::int as page_views",
          [PAGE_VIEW_EVENT],
        ),
      )
      .sum("active_seconds as active_seconds")
      .groupBy("surface")
      .orderBy("page_views", "desc")) as QueryRow[];

    return rows.map((row) => ({
      surface: row.surface,
      pageViews: Number(row.page_views ?? 0),
      activeUsers: Number(row.active_users ?? 0),
      activeOrganizations: Number(row.active_organizations ?? 0),
      activeMinutes: roundMinutes(Number(row.active_seconds ?? 0)),
    }));
  }

  static async getPageUsage(
    params: AppUsageRangeParams,
  ): Promise<AppUsagePageRow[]> {
    const rows = (await this.base(params)
      .where("event_name", PAGE_VIEW_EVENT)
      .whereNotNull("route_template")
      .select("route_template", "page_label", "surface")
      .count("id as page_views")
      .countDistinct("user_id as active_users")
      .groupBy("route_template", "page_label", "surface")
      .orderBy("page_views", "desc")
      .limit(12)) as QueryRow[];

    const activeMinutesByRoute = await this.getActiveMinutesByRoute(params);
    return rows.map((row) => ({
      routeTemplate: row.route_template,
      pageLabel: row.page_label,
      surface: row.surface,
      pageViews: Number(row.page_views ?? 0),
      activeUsers: Number(row.active_users ?? 0),
      activeMinutes: activeMinutesByRoute.get(row.route_template) ?? 0,
    }));
  }

  static async getOrganizationUsage(
    params: AppUsageRangeParams,
  ): Promise<AppUsageOrganizationRow[]> {
    const rows = (await this.base(params)
      .join("organizations as o", `${TABLE}.organization_id`, "o.id")
      .whereNotNull(`${TABLE}.organization_id`)
      .select(
        `${TABLE}.organization_id`,
        "o.name as organization_name",
        "o.domain",
      )
      .countDistinct(`${TABLE}.user_id as active_users`)
      .countDistinct(`${TABLE}.session_id as sessions`)
      .select(db.raw("COUNT(*) FILTER (WHERE event_name = ?)::int as page_views", [PAGE_VIEW_EVENT]))
      .sum("active_seconds as active_seconds")
      .max(`${TABLE}.created_at as last_active_at`)
      .groupBy(`${TABLE}.organization_id`, "o.name", "o.domain")
      .orderBy("last_active_at", "desc")
      .limit(100)) as QueryRow[];

    const topSurfaces = await this.getTopSurfaceByOrganization(params);
    return rows.map((row) => ({
      organizationId: Number(row.organization_id),
      organizationName: row.organization_name,
      domain: row.domain ?? null,
      activeUsers: Number(row.active_users ?? 0),
      sessions: Number(row.sessions ?? 0),
      pageViews: Number(row.page_views ?? 0),
      activeMinutes: roundMinutes(Number(row.active_seconds ?? 0)),
      lastActiveAt: row.last_active_at ? new Date(row.last_active_at).toISOString() : null,
      topSurface: topSurfaces.get(Number(row.organization_id)) ?? null,
    }));
  }

  static async getUserUsageForOrganization(
    organizationId: number,
    params: AppUsageRangeParams,
  ): Promise<AppUsageUserRow[]> {
    const rows = (await this.base(params)
      .join("users as u", `${TABLE}.user_id`, "u.id")
      .where(`${TABLE}.organization_id`, organizationId)
      .select(`${TABLE}.user_id`, "u.name", "u.email")
      .max(`${TABLE}.user_role as role`)
      .countDistinct(`${TABLE}.session_id as sessions`)
      .select(db.raw("COUNT(*) FILTER (WHERE event_name = ?)::int as page_views", [PAGE_VIEW_EVENT]))
      .sum("active_seconds as active_seconds")
      .max(`${TABLE}.created_at as last_active_at`)
      .groupBy(`${TABLE}.user_id`, "u.name", "u.email")
      .orderBy("last_active_at", "desc")) as QueryRow[];

    const topSurfaces = await this.getTopSurfaceByUser(organizationId, params);
    return rows.map((row) => ({
      userId: Number(row.user_id),
      name: row.name ?? null,
      email: row.email,
      role: row.role ?? null,
      sessions: Number(row.sessions ?? 0),
      pageViews: Number(row.page_views ?? 0),
      activeMinutes: roundMinutes(Number(row.active_seconds ?? 0)),
      lastActiveAt: row.last_active_at ? new Date(row.last_active_at).toISOString() : null,
      topSurface: topSurfaces.get(Number(row.user_id)) ?? null,
    }));
  }

  private static base(params: AppUsageRangeParams) {
    const query = db(TABLE)
      .where(`${TABLE}.created_at`, ">=", params.startDate)
      .where(`${TABLE}.created_at`, "<=", params.endDate);
    if (!params.includePilot) query.where(`${TABLE}.is_pilot_session`, false);
    return query;
  }

  private static countDistinct(params: AppUsageRangeParams, column: string) {
    return this.base(params).whereNotNull(column).countDistinct<{ count: string }>(`${column} as count`).first();
  }

  private static countInactivePaidOrganizations(params: AppUsageRangeParams) {
    const activeOrgs = this.base(params)
      .whereNotNull("organization_id")
      .distinct("organization_id")
      .as("usage_orgs");
    return db("organizations as o")
      .leftJoin(activeOrgs, "usage_orgs.organization_id", "o.id")
      .whereNull("usage_orgs.organization_id")
      .whereNull("o.archived_at")
      .where("o.is_sandbox", false)
      .where("o.subscription_status", "active")
      .count<{ count: string }>("o.id as count")
      .first();
  }

  private static async getActiveMinutesByRoute(params: AppUsageRangeParams) {
    const rows = (await this.base(params)
      .whereNotNull("route_template")
      .select("route_template")
      .sum("active_seconds as active_seconds")
      .groupBy("route_template")) as QueryRow[];
    return new Map(
      rows.map((row) => [
        row.route_template,
        roundMinutes(Number(row.active_seconds ?? 0)),
      ]),
    );
  }

  private static async getTopSurfaceByOrganization(params: AppUsageRangeParams) {
    const rows = (await this.base(params)
      .where("event_name", PAGE_VIEW_EVENT)
      .whereNotNull("organization_id")
      .whereNotNull("surface")
      .select("organization_id", "surface")
      .count("id as count")
      .groupBy("organization_id", "surface")
      .orderBy("count", "desc")) as QueryRow[];
    return pickTopSurface(rows, "organization_id");
  }

  private static async getTopSurfaceByUser(
    organizationId: number,
    params: AppUsageRangeParams,
  ) {
    const rows = (await this.base(params)
      .where("event_name", PAGE_VIEW_EVENT)
      .where("organization_id", organizationId)
      .whereNotNull("user_id")
      .whereNotNull("surface")
      .select("user_id", "surface")
      .count("id as count")
      .groupBy("user_id", "surface")
      .orderBy("count", "desc")) as QueryRow[];
    return pickTopSurface(rows, "user_id");
  }
}

function pickTopSurface(rows: QueryRow[], key: "organization_id" | "user_id") {
  const top = new Map<number, string>();
  for (const row of rows) {
    const id = Number(row[key]);
    if (!top.has(id)) top.set(id, row.surface);
  }
  return top;
}

function roundMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10;
}
