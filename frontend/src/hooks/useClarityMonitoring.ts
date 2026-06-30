import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getCommonHeaders, isPilotSession } from "../api";
import { useAuth } from "./useAuth";
import {
  ensureClarityScript,
  recordClarityEvent,
  setClarityTag,
} from "../utils/telemetry/clarityMonitoring";
import { getRouteTelemetryDescriptor } from "../utils/telemetry/routeTelemetry";

export function useClarityMonitoring(): void {
  const location = useLocation();
  const { isLoadingUserProperties, userProfile } = useAuth();
  const hasUserProfile = Boolean(userProfile);
  const organizationTag = userProfile?.organizationId
    ? `org:${userProfile.organizationId}`
    : "no_org";

  useEffect(() => {
    if (isLoadingUserProperties) return;
    if (!getCommonHeaders().Authorization) return;
    if (!hasUserProfile) return;
    if (location.pathname.startsWith("/admin")) return;

    const descriptor = getRouteTelemetryDescriptor(location.pathname);
    if (!descriptor) return;

    const isPilot = isPilotSession();
    ensureClarityScript();
    setClarityTag("alloro_app", "client_dashboard");
    setClarityTag("alloro_context", isPilot ? "pilot" : "client");
    setClarityTag("is_pilot_session", String(isPilot));
    setClarityTag("organization_id", organizationTag);
    setClarityTag("surface", descriptor.surface);
    setClarityTag("route_template", descriptor.routeTemplate);
    setClarityTag("page_label", descriptor.pageLabel);
    recordClarityEvent("alloro_client_page_viewed");
  }, [
    hasUserProfile,
    isLoadingUserProperties,
    location.pathname,
    organizationTag,
  ]);
}
