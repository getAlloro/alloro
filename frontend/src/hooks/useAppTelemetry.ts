import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  type AppTelemetryEvent,
  recordAppTelemetryEvents,
} from "../api/app-telemetry";
import { useAuth } from "./useAuth";
import { getRouteTelemetryDescriptor } from "../utils/telemetry/routeTelemetry";

const SESSION_KEY = "alloro_app_telemetry_session_id";
const HEARTBEAT_INTERVAL_MS = 30_000;

type CurrentRoute = {
  routeTemplate: string | null;
  surface: string | null;
  pageLabel: string | null;
  tab: string | null;
};

export function useAppTelemetry(): void {
  const location = useLocation();
  const { isLoadingUserProperties } = useAuth();
  const sessionId = useMemo(getTelemetrySessionId, []);
  const hasSentSessionStart = useRef(false);
  const currentRoute = useRef<CurrentRoute | null>(null);
  const lastActiveAt = useRef(Date.now());

  useEffect(() => {
    if (isLoadingUserProperties) return;
    const descriptor = getRouteTelemetryDescriptor(location.pathname);
    if (!descriptor) return;

    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    const route: CurrentRoute = {
      routeTemplate: descriptor.routeTemplate,
      surface: descriptor.surface,
      pageLabel:
        descriptor.routeTemplate === "/admin/mission-control" && tab === "telemetry"
          ? "Mission Control Telemetry"
          : descriptor.pageLabel,
      tab,
    };
    currentRoute.current = route;
    lastActiveAt.current = Date.now();

    const events: AppTelemetryEvent[] = [];
    if (!hasSentSessionStart.current) {
      hasSentSessionStart.current = true;
      events.push(buildEvent("app.session_started", sessionId, route, 0));
    }
    events.push(buildEvent("app.page_viewed", sessionId, route, 0));
    if (route.routeTemplate === "/admin/mission-control" && tab === "telemetry") {
      events.push(
        buildEvent("mission_control.telemetry_viewed", sessionId, route, 0),
      );
    }
    recordAppTelemetryEvents(events);
  }, [isLoadingUserProperties, location.pathname, location.search, sessionId]);

  useEffect(() => {
    const flushHeartbeat = () => {
      if (document.visibilityState !== "visible") return;
      const route = currentRoute.current;
      if (!route) return;
      const now = Date.now();
      const activeSeconds = Math.max(
        0,
        Math.round((now - lastActiveAt.current) / 1000),
      );
      lastActiveAt.current = now;
      if (activeSeconds === 0) return;
      recordAppTelemetryEvents([
        buildEvent("app.page_active_heartbeat", sessionId, route, activeSeconds),
      ]);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushHeartbeat();
      else lastActiveAt.current = Date.now();
    };

    const interval = window.setInterval(flushHeartbeat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flushHeartbeat);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushHeartbeat);
    };
  }, [sessionId]);
}

function buildEvent(
  eventName: AppTelemetryEvent["eventName"],
  sessionId: string,
  route: CurrentRoute,
  activeSeconds: number,
): AppTelemetryEvent {
  return {
    eventName,
    sessionId,
    routeTemplate: route.routeTemplate,
    surface: route.surface,
    pageLabel: route.pageLabel,
    activeSeconds,
    isPilotSession: isPilotSession(),
    occurredAt: new Date().toISOString(),
    properties: {
      source: "route_tracker",
      is_admin_surface: route.surface === "mission_control",
      ...(route.tab ? { tab: route.tab } : {}),
    },
  };
}

function getTelemetrySessionId(): string {
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = createUuid();
  window.sessionStorage.setItem(SESSION_KEY, next);
  return next;
}

function createUuid(): string {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (
      Number(char) ^
      (window.crypto.getRandomValues(new Uint8Array(1))[0] &
        (15 >> (Number(char) / 4)))
    ).toString(16),
  );
}

function isPilotSession(): boolean {
  return (
    window.sessionStorage.getItem("pilot_mode") === "true" ||
    Boolean(window.sessionStorage.getItem("token"))
  );
}
