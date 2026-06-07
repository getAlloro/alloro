import { db } from "../database/connection";
import { AppUsageRangeParams } from "./AppUsageEventModel";

export const APP_USAGE_EVENTS_TABLE = "app_usage_events";
export const APP_USAGE_PAGE_VIEW_EVENT = "app.page_viewed";
export type AppUsageQueryRow = Record<string, any>;

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
