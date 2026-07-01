import * as Sentry from "@sentry/node";
import {
  APP_TELEMETRY_PROPERTY_KEY_SET,
  isAppTelemetryEventName,
  isAppTelemetryRouteTemplate,
  isAppTelemetrySurface,
} from "../feature-utils/appTelemetryCatalog";
import {
  AppUsageEventInsert,
  AppUsageEventModel,
} from "../../../models/AppUsageEventModel";
import { UserModel } from "../../../models/UserModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import type { UserRole } from "../../../middleware/rbac";

const MAX_BATCH_SIZE = 20;
const MAX_ACTIVE_SECONDS = 120;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AppTelemetryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppTelemetryValidationError";
  }
}

export interface AppTelemetryActor {
  userId: number;
  organizationId?: number;
  userRole?: UserRole;
}

export async function ingestAppTelemetryEvents(
  body: unknown,
  actor: AppTelemetryActor,
): Promise<{ accepted: number }> {
  // Pilot (Mission Control's embedded "view as user" support sessions) never
  // counts as client telemetry — dropped per-event, going forward.
  const events = extractEvents(body)
    .map((event) => normalizeEvent(event, actor))
    .filter((event) => !event.is_pilot_session);

  if (events.length === 0) return { accepted: 0 };
  if (await isSuppressedActor(actor)) return { accepted: 0 };

  const accepted = await AppUsageEventModel.createMany(events);
  return { accepted };
}

// Internal staff (@getalloro.com) and sandbox/internal orgs (e.g. Alloro
// Teams) never generate real client telemetry — blocked at write time here,
// not just filtered at read time. Fails open on lookup errors: a DB hiccup
// on this hot path must never drop legitimate client telemetry.
async function isSuppressedActor(actor: AppTelemetryActor): Promise<boolean> {
  try {
    const [user, organization] = await Promise.all([
      UserModel.findInternalFlagById(actor.userId),
      actor.organizationId
        ? OrganizationModel.findSandboxFlagById(actor.organizationId)
        : Promise.resolve(undefined),
    ]);
    return Boolean(user?.is_internal) || Boolean(organization?.is_sandbox);
  } catch (error) {
    Sentry.captureException(error);
    return false;
  }
}

function extractEvents(body: unknown): Record<string, unknown>[] {
  const payload = (body || {}) as Record<string, unknown>;
  const events = payload.events;
  if (!Array.isArray(events)) {
    throw new AppTelemetryValidationError("events must be an array");
  }
  if (events.length === 0 || events.length > MAX_BATCH_SIZE) {
    throw new AppTelemetryValidationError(
      `events must contain 1-${MAX_BATCH_SIZE} items`,
    );
  }
  return events as Record<string, unknown>[];
}

function normalizeEvent(
  input: Record<string, unknown>,
  actor: AppTelemetryActor,
): AppUsageEventInsert {
  if (!isAppTelemetryEventName(input.eventName)) {
    throw new AppTelemetryValidationError("invalid eventName");
  }
  if (!isUuid(input.sessionId)) {
    throw new AppTelemetryValidationError("invalid sessionId");
  }

  const routeTemplate = normalizeRouteTemplate(input.routeTemplate);
  const surface = normalizeSurface(input.surface);
  const occurredAt = normalizeOccurredAt(input.occurredAt);

  return {
    event_name: input.eventName,
    event_category: categoryForEvent(input.eventName),
    source: "frontend",
    user_id: actor.userId,
    organization_id: actor.organizationId ?? null,
    user_role: actor.userRole ?? null,
    session_id: String(input.sessionId),
    route_template: routeTemplate,
    surface,
    page_label: normalizeString(input.pageLabel, 120),
    active_seconds: normalizeActiveSeconds(input.activeSeconds),
    is_pilot_session: input.isPilotSession === true,
    properties: normalizeProperties(input.properties),
    occurred_at: occurredAt,
  };
}

function normalizeRouteTemplate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!isAppTelemetryRouteTemplate(value)) {
    throw new AppTelemetryValidationError("invalid routeTemplate");
  }
  return value;
}

function normalizeSurface(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!isAppTelemetrySurface(value)) {
    throw new AppTelemetryValidationError("invalid surface");
  }
  return value;
}

function normalizeActiveSeconds(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(Math.round(numeric), MAX_ACTIVE_SECONDS);
}

function normalizeOccurredAt(value: unknown): Date {
  if (typeof value !== "string") return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function normalizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeProperties(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const properties: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!APP_TELEMETRY_PROPERTY_KEY_SET.has(key)) continue;
    if (typeof raw === "string") properties[key] = raw.slice(0, 80);
    if (typeof raw === "boolean") properties[key] = raw;
  }
  return properties;
}

function categoryForEvent(eventName: string): string {
  if (eventName.includes("heartbeat")) return "engagement";
  if (eventName.includes("page_viewed") || eventName.includes("viewed")) {
    return "navigation";
  }
  return "session";
}

function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}
