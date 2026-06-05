export const APP_TELEMETRY_EVENT_NAMES = [
  "app.session_started",
  "app.page_viewed",
  "app.page_active_heartbeat",
  "mission_control.telemetry_viewed",
] as const;

export type AppTelemetryEventName = (typeof APP_TELEMETRY_EVENT_NAMES)[number];

export const APP_TELEMETRY_SURFACES = [
  "practice_hub",
  "referrals_hub",
  "referral_engine",
  "patient_journey",
  "local_rankings",
  "tasks",
  "website",
  "settings",
  "notifications",
  "help",
  "mission_control",
  "onboarding",
] as const;

export type AppTelemetrySurface = (typeof APP_TELEMETRY_SURFACES)[number];

export const APP_TELEMETRY_ROUTE_TEMPLATES = [
  "/dashboard",
  "/pmsStatistics",
  "/referralEngine",
  "/patientJourneyInsights",
  "/rankings",
  "/tasks",
  "/dfy/website",
  "/settings",
  "/settings/integrations",
  "/settings/users",
  "/settings/billing",
  "/settings/account",
  "/notifications",
  "/help",
  "/admin/mission-control",
  "/dashboard/competitors/:locationId/onboarding",
  "/new-account-onboarding",
] as const;

export type AppTelemetryRouteTemplate =
  (typeof APP_TELEMETRY_ROUTE_TEMPLATES)[number];

export const APP_TELEMETRY_PROPERTY_KEYS = [
  "tab",
  "is_admin_surface",
  "source",
] as const;

const EVENT_NAME_SET = new Set<string>(APP_TELEMETRY_EVENT_NAMES);
const SURFACE_SET = new Set<string>(APP_TELEMETRY_SURFACES);
const ROUTE_TEMPLATE_SET = new Set<string>(APP_TELEMETRY_ROUTE_TEMPLATES);
export const APP_TELEMETRY_PROPERTY_KEY_SET = new Set<string>(
  APP_TELEMETRY_PROPERTY_KEYS,
);

export function isAppTelemetryEventName(
  value: unknown,
): value is AppTelemetryEventName {
  return typeof value === "string" && EVENT_NAME_SET.has(value);
}

export function isAppTelemetrySurface(
  value: unknown,
): value is AppTelemetrySurface {
  return typeof value === "string" && SURFACE_SET.has(value);
}

export function isAppTelemetryRouteTemplate(
  value: unknown,
): value is AppTelemetryRouteTemplate {
  return typeof value === "string" && ROUTE_TEMPLATE_SET.has(value);
}
