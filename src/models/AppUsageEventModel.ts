import { db } from "../database/connection";
import { appUsageBucketExpression } from "./appUsageTelemetryQueryHelpers";
import type { QueryContext } from "./BaseModel";

const TABLE = "app_usage_events";
const PAGE_VIEW_EVENT = "app.page_viewed";
const LOW_ENGAGEMENT_MINUTE_THRESHOLD = 5;
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

export type AppUsageBucketGranularity = "day" | "month";

export interface AppUsageRangeParams {
  startDate: Date;
  endDate: Date;
  includePilot: boolean;
  includeAdmin: boolean;
  granularity: AppUsageBucketGranularity;
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
  // Distinct orgs in the bucket — populated by the global aggregate query only.
  activeOrganizations?: number;
  pageViews: number;
  activeMinutes: number;
}

export interface AppUsageSurfaceRow {
  surface: string;
  pageViews: number;
  activeUsers: number;
  activeOrganizations: number;
  activeMinutes: number;
  lastOrganizationId: number | null;
  lastOrganizationName: string | null;
  lastUserId: number | null;
  lastUserName: string | null;
  lastUserEmail: string | null;
}

export interface AppUsagePageRow {
  routeTemplate: string;
  pageLabel: string | null;
  surface: string | null;
  pageViews: number;
  activeUsers: number;
  activeOrganizations: number;
  activeMinutes: number;
  lastOrganizationId: number | null;
  lastOrganizationName: string | null;
  lastUserId: number | null;
  lastUserName: string | null;
  lastUserEmail: string | null;
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
  isLowEngagement?: boolean;
}

export interface AppUsageLowEngagementOrganizationRow {
  organizationId: number;
  organizationName: string;
  domain: string | null;
  sessions: number;
  activeMinutes: number;
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
    const bucket = appUsageBucketExpression(params.granularity);
    const rows = (await this.base(params)
      .select(db.raw(`${bucket}::date::text as date`))
      .countDistinct("user_id as active_users")
      .countDistinct("organization_id as active_organizations")
      .select(
        db.raw(
          "COUNT(*) FILTER (WHERE event_name = ?)::int as page_views",
          [PAGE_VIEW_EVENT],
        ),
      )
      .sum("active_seconds as active_seconds")
      .groupByRaw(bucket)
      .orderBy("date", "asc")) as QueryRow[];

    return rows.map((row) => ({
      date: row.date,
      activeUsers: Number(row.active_users ?? 0),
      activeOrganizations: Number(row.active_organizations ?? 0),
      pageViews: Number(row.page_views ?? 0),
      activeMinutes: roundMinutes(Number(row.active_seconds ?? 0)),
    }));
  }

  static async getSurfaceUsage(
    params: AppUsageRangeParams,
  ): Promise<AppUsageSurfaceRow[]> {
    const rows = (await this.base(params)
      .leftJoin("users as u", `${TABLE}.user_id`, "u.id")
      .leftJoin("organizations as o", `${TABLE}.organization_id`, "o.id")
      .whereNotNull("surface")
      .select(`${TABLE}.surface`)
      .countDistinct(`${TABLE}.user_id as active_users`)
      .countDistinct(`${TABLE}.organization_id as active_organizations`)
      .select(
        db.raw(
          "COUNT(*) FILTER (WHERE event_name = ?)::int as page_views",
          [PAGE_VIEW_EVENT],
        ),
      )
      .select(latestActorSelects())
      .sum(`${TABLE}.active_seconds as active_seconds`)
      .groupBy(`${TABLE}.surface`)
      .orderBy("page_views", "desc")) as QueryRow[];

    return rows.map((row) => ({
      surface: row.surface,
      pageViews: Number(row.page_views ?? 0),
      activeUsers: Number(row.active_users ?? 0),
      activeOrganizations: Number(row.active_organizations ?? 0),
      activeMinutes: roundMinutes(Number(row.active_seconds ?? 0)),
      ...mapLatestActor(row),
    }));
  }

  static async getPageUsage(
    params: AppUsageRangeParams,
  ): Promise<AppUsagePageRow[]> {
    const rows = (await this.base(params)
      .leftJoin("users as u", `${TABLE}.user_id`, "u.id")
      .leftJoin("organizations as o", `${TABLE}.organization_id`, "o.id")
      .where(`${TABLE}.event_name`, PAGE_VIEW_EVENT)
      .whereNotNull(`${TABLE}.route_template`)
      .select(`${TABLE}.route_template`, `${TABLE}.page_label`, `${TABLE}.surface`)
      .count(`${TABLE}.id as page_views`)
      .countDistinct(`${TABLE}.user_id as active_users`)
      .countDistinct(`${TABLE}.organization_id as active_organizations`)
      .select(latestActorSelects())
      .groupBy(`${TABLE}.route_template`, `${TABLE}.page_label`, `${TABLE}.surface`)
      .orderBy("page_views", "desc")
      .limit(12)) as QueryRow[];

    const activeMinutesByPage = await this.getActiveMinutesByPage(params);
    return rows.map((row) => ({
      routeTemplate: row.route_template,
      pageLabel: row.page_label,
      surface: row.surface,
      pageViews: Number(row.page_views ?? 0),
      activeUsers: Number(row.active_users ?? 0),
      activeOrganizations: Number(row.active_organizations ?? 0),
      activeMinutes: activeMinutesByPage.get(buildPageUsageKey(row)) ?? 0,
      ...mapLatestActor(row),
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
    if (!params.includeAdmin) {
      query
        .where((builder) => {
          builder
            .whereNull(`${TABLE}.surface`)
            .orWhere(`${TABLE}.surface`, "<>", "mission_control");
        })
        .whereRaw(
          `COALESCE((${TABLE}.properties->>'is_admin_surface')::boolean, false) = false`,
        );
    }
    // Alloro Teams (sandbox orgs) and internal staff never count as client
    // engagement — excluded unconditionally, not behind a toggle.
    query
      .whereRaw(
        `NOT EXISTS (SELECT 1 FROM organizations WHERE organizations.id = ${TABLE}.organization_id AND organizations.is_sandbox = true)`,
      )
      .whereRaw(
        `NOT EXISTS (SELECT 1 FROM users WHERE users.id = ${TABLE}.user_id AND users.is_internal = true)`,
      );
    return query;
  }

  private static countDistinct(params: AppUsageRangeParams, column: string) {
    return this.base(params).whereNotNull(column).countDistinct<{ count: string }>(`${column} as count`).first();
  }

  /**
   * Eligible client orgs (not archived, not sandbox, active subscription)
   * with zero sessions or under LOW_ENGAGEMENT_MINUTE_THRESHOLD active
   * minutes in range. Mirrors countInactivePaidOrganizations' LEFT JOIN
   * pattern rather than reading getOrganizationUsage(), which INNER JOINs to
   * app_usage_events and would silently omit zero-activity orgs entirely.
   */
  static async getLowEngagementOrganizations(
    params: AppUsageRangeParams,
  ): Promise<AppUsageLowEngagementOrganizationRow[]> {
    const usage = this.base(params)
      .whereNotNull("organization_id")
      .groupBy("organization_id")
      .select("organization_id")
      .countDistinct("session_id as sessions")
      .sum("active_seconds as active_seconds")
      .as("usage");

    const rows = (await db("organizations as o")
      .leftJoin(usage, "usage.organization_id", "o.id")
      .whereNull("o.archived_at")
      .where("o.is_sandbox", false)
      .where("o.subscription_status", "active")
      .where((builder) => {
        builder
          .whereNull("usage.organization_id")
          .orWhere("usage.sessions", 0)
          .orWhere(
            "usage.active_seconds",
            "<",
            LOW_ENGAGEMENT_MINUTE_THRESHOLD * 60,
          );
      })
      .select("o.id as organization_id", "o.name as organization_name", "o.domain")
      .select(db.raw("COALESCE(usage.sessions, 0)::int as sessions"))
      .select(db.raw("COALESCE(usage.active_seconds, 0) as active_seconds"))
      .orderBy("o.name", "asc")) as QueryRow[];

    return rows.map((row) => ({
      organizationId: Number(row.organization_id),
      organizationName: row.organization_name,
      domain: row.domain ?? null,
      sessions: Number(row.sessions ?? 0),
      activeMinutes: roundMinutes(Number(row.active_seconds ?? 0)),
    }));
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

  private static async getActiveMinutesByPage(params: AppUsageRangeParams) {
    const rows = (await this.base(params)
      .whereNotNull("route_template")
      .select("route_template", "page_label", "surface")
      .sum("active_seconds as active_seconds")
      .groupBy("route_template", "page_label", "surface")) as QueryRow[];
    return new Map(
      rows.map((row) => [
        buildPageUsageKey(row),
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

function latestActorSelects() {
  const orderedByCreatedAt = `ORDER BY ${TABLE}.created_at DESC`;
  return [
    db.raw(
      `(ARRAY_AGG(o.id ${orderedByCreatedAt}) FILTER (WHERE o.id IS NOT NULL))[1]::int as last_organization_id`,
    ),
    db.raw(
      `(ARRAY_AGG(o.name ${orderedByCreatedAt}) FILTER (WHERE o.name IS NOT NULL))[1] as last_organization_name`,
    ),
    db.raw(
      `(ARRAY_AGG(u.id ${orderedByCreatedAt}) FILTER (WHERE u.id IS NOT NULL))[1]::int as last_user_id`,
    ),
    db.raw(
      `(ARRAY_AGG(u.name ${orderedByCreatedAt}) FILTER (WHERE u.name IS NOT NULL))[1] as last_user_name`,
    ),
    db.raw(
      `(ARRAY_AGG(u.email ${orderedByCreatedAt}) FILTER (WHERE u.email IS NOT NULL))[1] as last_user_email`,
    ),
  ];
}

function mapLatestActor(row: QueryRow) {
  return {
    lastOrganizationId: row.last_organization_id
      ? Number(row.last_organization_id)
      : null,
    lastOrganizationName: row.last_organization_name ?? null,
    lastUserId: row.last_user_id ? Number(row.last_user_id) : null,
    lastUserName: row.last_user_name ?? null,
    lastUserEmail: row.last_user_email ?? null,
  };
}

function buildPageUsageKey(row: QueryRow): string {
  return [
    row.route_template ?? "",
    row.page_label ?? "",
    row.surface ?? "",
  ].join("::");
}

function roundMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10;
}
