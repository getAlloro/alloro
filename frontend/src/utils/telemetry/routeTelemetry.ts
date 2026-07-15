export type RouteTelemetryDescriptor = {
  routeTemplate: string;
  surface: string;
  pageLabel: string;
};

const ROUTE_TELEMETRY: Record<string, RouteTelemetryDescriptor> = {
  "/dashboard": {
    routeTemplate: "/dashboard",
    surface: "practice_hub",
    pageLabel: "Practice Hub",
  },
  "/pmsStatistics": {
    routeTemplate: "/pmsStatistics",
    surface: "referrals_hub",
    pageLabel: "Referrals Hub",
  },
  "/referralEngine": {
    routeTemplate: "/referralEngine",
    surface: "referral_engine",
    pageLabel: "Referral Engine",
  },
  "/patientJourneyInsights": {
    routeTemplate: "/patientJourneyInsights",
    surface: "patient_journey",
    pageLabel: "Patient Journey",
  },
  "/rankings": {
    routeTemplate: "/rankings",
    surface: "local_rankings",
    pageLabel: "Local Rankings",
  },
  "/dfy/website": {
    routeTemplate: "/dfy/website",
    surface: "website",
    pageLabel: "Website",
  },
  "/settings": {
    routeTemplate: "/settings",
    surface: "settings",
    pageLabel: "Settings",
  },
  "/settings/integrations": {
    routeTemplate: "/settings/integrations",
    surface: "settings",
    pageLabel: "Settings Integrations",
  },
  "/settings/users": {
    routeTemplate: "/settings/users",
    surface: "settings",
    pageLabel: "Settings Users",
  },
  "/settings/billing": {
    routeTemplate: "/settings/billing",
    surface: "settings",
    pageLabel: "Settings Billing",
  },
  "/settings/account": {
    routeTemplate: "/settings/account",
    surface: "settings",
    pageLabel: "Settings Account",
  },
  "/notifications": {
    routeTemplate: "/notifications",
    surface: "notifications",
    pageLabel: "Notifications",
  },
  "/help": {
    routeTemplate: "/help",
    surface: "help",
    pageLabel: "Help",
  },
  "/admin/mission-control": {
    routeTemplate: "/admin/mission-control",
    surface: "mission_control",
    pageLabel: "Mission Control",
  },
  "/new-account-onboarding": {
    routeTemplate: "/new-account-onboarding",
    surface: "onboarding",
    pageLabel: "Onboarding",
  },
};

export function getRouteTelemetryDescriptor(
  pathname: string,
): RouteTelemetryDescriptor | null {
  if (pathname.startsWith("/dashboard/competitors/")) {
    return {
      routeTemplate: "/dashboard/competitors/:locationId/onboarding",
      surface: "local_rankings",
      pageLabel: "Competitor Onboarding",
    };
  }
  return ROUTE_TELEMETRY[pathname] ?? null;
}
