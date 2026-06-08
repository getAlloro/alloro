import { AppUsageRangeParams } from "./AppUsageEventModel";
import {
  APP_USAGE_EVENTS_TABLE,
  APP_USAGE_PAGE_VIEW_EVENT,
  AppUsageQueryRow,
  buildOrganizationUsageQuery,
  roundUsageMinutes,
} from "./appUsageTelemetryQueryHelpers";

export interface AppUsageOrganizationMovementRow {
  id: string;
  eventName: string;
  eventLabel: string;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  sessionId: string;
  routeTemplate: string | null;
  surface: string | null;
  pageLabel: string | null;
  activeSeconds: number;
  activeMinutes: number;
  occurredAt: string;
  createdAt: string;
}

export class AppUsageOrganizationMovementModel {
  static async getRecentMovements(
    organizationId: number,
    params: AppUsageRangeParams,
    userId?: number,
  ): Promise<AppUsageOrganizationMovementRow[]> {
    const query = buildOrganizationUsageQuery(organizationId, params);
    if (userId) {
      query.where(`${APP_USAGE_EVENTS_TABLE}.user_id`, userId);
    }

    const rows = (await query
      .leftJoin("users as u", `${APP_USAGE_EVENTS_TABLE}.user_id`, "u.id")
      .select(
        `${APP_USAGE_EVENTS_TABLE}.id`,
        `${APP_USAGE_EVENTS_TABLE}.event_name`,
        `${APP_USAGE_EVENTS_TABLE}.user_id`,
        "u.name as user_name",
        "u.email as user_email",
        `${APP_USAGE_EVENTS_TABLE}.user_role`,
        `${APP_USAGE_EVENTS_TABLE}.session_id`,
        `${APP_USAGE_EVENTS_TABLE}.route_template`,
        `${APP_USAGE_EVENTS_TABLE}.surface`,
        `${APP_USAGE_EVENTS_TABLE}.page_label`,
        `${APP_USAGE_EVENTS_TABLE}.active_seconds`,
        `${APP_USAGE_EVENTS_TABLE}.occurred_at`,
        `${APP_USAGE_EVENTS_TABLE}.created_at`,
      )
      .orderBy(`${APP_USAGE_EVENTS_TABLE}.created_at`, "desc")
      .limit(30)) as AppUsageQueryRow[];

    return rows.map((row) => ({
      id: String(row.id),
      eventName: row.event_name,
      eventLabel: formatEventLabel(row.event_name),
      userId: row.user_id ? Number(row.user_id) : null,
      userName: row.user_name ?? null,
      userEmail: row.user_email ?? null,
      userRole: row.user_role ?? null,
      sessionId: row.session_id,
      routeTemplate: row.route_template ?? null,
      surface: row.surface ?? null,
      pageLabel: row.page_label ?? null,
      activeSeconds: Number(row.active_seconds ?? 0),
      activeMinutes: roundUsageMinutes(Number(row.active_seconds ?? 0)),
      occurredAt: new Date(row.occurred_at).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }
}

function formatEventLabel(eventName: string): string {
  if (eventName === "app.session_started") return "Session started";
  if (eventName === APP_USAGE_PAGE_VIEW_EVENT) return "Page viewed";
  if (eventName === "app.page_active_heartbeat") return "Active heartbeat";
  if (eventName === "mission_control.telemetry_viewed") {
    return "Telemetry viewed";
  }
  return eventName;
}
