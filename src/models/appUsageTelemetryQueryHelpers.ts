import { db } from "../database/connection";
import {
  AppUsageBucketGranularity,
  AppUsageRangeParams,
} from "./AppUsageEventModel";

export const APP_USAGE_EVENTS_TABLE = "app_usage_events";
export const APP_USAGE_PAGE_VIEW_EVENT = "app.page_viewed";
export type AppUsageQueryRow = Record<string, any>;

// SELECT and GROUP BY must share the exact same expression text — with two
// separate bind params ($1 vs $7) Postgres cannot match them and rejects the
// query. granularity is a closed two-value union (gated by parseRange), so
// inlining the vetted literal is safe: only these two fixed strings exist.
export function appUsageBucketExpression(
  granularity: AppUsageBucketGranularity,
): string {
  return granularity === "month"
    ? "date_trunc('month', created_at)"
    : "date_trunc('day', created_at)";
}

export function buildOrganizationUsageQuery(
  organizationId: number,
  params: AppUsageRangeParams,
) {
  const query = db(APP_USAGE_EVENTS_TABLE)
    .where(`${APP_USAGE_EVENTS_TABLE}.organization_id`, organizationId)
    .where(`${APP_USAGE_EVENTS_TABLE}.created_at`, ">=", params.startDate)
    .where(`${APP_USAGE_EVENTS_TABLE}.created_at`, "<=", params.endDate);

  if (!params.includePilot) {
    query.where(`${APP_USAGE_EVENTS_TABLE}.is_pilot_session`, false);
  }

  if (!params.includeAdmin) {
    query
      .where((builder) => {
        builder
          .whereNull(`${APP_USAGE_EVENTS_TABLE}.surface`)
          .orWhere(
            `${APP_USAGE_EVENTS_TABLE}.surface`,
            "<>",
            "mission_control",
          );
      })
      .whereRaw(
        `COALESCE((${APP_USAGE_EVENTS_TABLE}.properties->>'is_admin_surface')::boolean, false) = false`,
      );
  }

  // Alloro Teams (sandbox orgs) and internal staff never count as client
  // engagement — excluded unconditionally, not behind a toggle.
  query
    .whereRaw(
      `NOT EXISTS (SELECT 1 FROM organizations WHERE organizations.id = ${APP_USAGE_EVENTS_TABLE}.organization_id AND organizations.is_sandbox = true)`,
    )
    .whereRaw(
      `NOT EXISTS (SELECT 1 FROM users WHERE users.id = ${APP_USAGE_EVENTS_TABLE}.user_id AND users.is_internal = true)`,
    );

  return query;
}

export function buildOrganizationUserUsageQuery(
  organizationId: number,
  userId: number,
  params: AppUsageRangeParams,
) {
  return buildOrganizationUsageQuery(organizationId, params).where(
    `${APP_USAGE_EVENTS_TABLE}.user_id`,
    userId,
  );
}

export function buildPageUsageKey(row: AppUsageQueryRow): string {
  return [
    row.route_template ?? "",
    row.page_label ?? "",
    row.surface ?? "",
  ].join("::");
}

export function roundUsageMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10;
}
