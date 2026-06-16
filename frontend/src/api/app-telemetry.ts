import { getCommonHeaders, adminFetch } from "./index";

const api = import.meta.env.VITE_API_URL ?? "/api";

export type AppTelemetryEventName =
  | "app.session_started"
  | "app.page_viewed"
  | "app.page_active_heartbeat"
  | "mission_control.telemetry_viewed";

export type AppTelemetryEvent = {
  eventName: AppTelemetryEventName;
  sessionId: string;
  routeTemplate: string | null;
  surface: string | null;
  pageLabel: string | null;
  activeSeconds?: number;
  isPilotSession: boolean;
  occurredAt: string;
  properties?: {
    tab?: string;
    is_admin_surface?: boolean;
    source?: string;
  };
};

export function recordAppTelemetryEvents(events: AppTelemetryEvent[]): void {
  if (events.length === 0) return;
  // Skip when unauthenticated — telemetry requires a JWT.
  if (!getCommonHeaders().Authorization) return;

  void adminFetch(`${api}/telemetry/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
    keepalive: true,
  }).catch(() => undefined);
}
