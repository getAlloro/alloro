import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

// ─── QueryClient ─────────────────────────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Always stale — show cached instantly, refetch silently in background
      gcTime: 24 * 60 * 60 * 1000, // 24 hours — cache retention
      refetchOnWindowFocus: false,
      refetchOnMount: true, // silent background refetch on every mount
      refetchOnReconnect: true, // refetch when network reconnects
      retry: 1,
      retryDelay: 1000,
      placeholderData: (previousData: unknown) => previousData, // show previous data while refetching
    },
  },
});

// ─── LocalStorage Persister ──────────────────────────────────────
export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "ALLORO_QUERY_CACHE",
  throttleTime: 1000,
  serialize: JSON.stringify,
  deserialize: JSON.parse,
});

export const persistOptions = {
  persister,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  dehydrateOptions: {
    shouldDehydrateQuery: (query: { state: { status: string } }) =>
      query.state.status === "success",
  },
};

// ─── Query Key Factory ───────────────────────────────────────────
export const QUERY_KEYS = {
  // Admin — organizations
  organizations: (view: "active" | "archived" | "all" = "active") =>
    ["admin", "organizations", view] as const,
  organizationsAll: ["admin", "organizations"] as const,
  organization: (id: number) => ["admin", "organization", id] as const,
  organizationLocations: (id: number) =>
    ["admin", "organization", id, "locations"] as const,
  organizationRecipientSettings: (id: number) =>
    ["admin", "organization", id, "recipient-settings"] as const,

  // Admin — minds
  adminMinds: ["admin", "minds"] as const,

  // Admin — websites
  adminWebsites: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    projectListView?: "active" | "inactive" | "archive";
  }) => ["admin", "websites", params] as const,
  adminWebsitesAll: ["admin", "websites"] as const,
  adminStatuses: ["admin", "website-statuses"] as const,

  // Admin — templates
  adminTemplates: ["admin", "templates"] as const,

  // Admin — schedules
  adminSchedules: ["admin", "schedules"] as const,
  adminScheduleRuns: (scheduleId: number) =>
    ["admin", "schedule-runs", scheduleId] as const,

  // Admin — org sub-tab data (tasks, notifications, rankings, PMS, agent outputs)
  adminOrgTasks: (orgId: number, params?: Record<string, unknown>) =>
    ["admin", "org-tasks", orgId, params] as const,
  adminOrgTasksAll: (orgId: number) => ["admin", "org-tasks", orgId] as const,
  adminOrgNotifications: (orgId: number, params?: Record<string, unknown>) =>
    ["admin", "org-notifications", orgId, params] as const,
  adminOrgNotificationsAll: (orgId: number) =>
    ["admin", "org-notifications", orgId] as const,
  adminOrgRankings: (orgId: number, locationId?: number | null) =>
    ["admin", "org-rankings", orgId, locationId] as const,
  adminOrgGbpAutomation: (
    orgId: number,
    locationId?: number | null,
    params?: Record<string, unknown>,
  ) => ["admin", "org-gbp-automation", orgId, locationId, params] as const,
  adminOrgGbpAutomationAll: (orgId: number) =>
    ["admin", "org-gbp-automation", orgId] as const,
  adminOrgGbpPublishedLocalPosts: (
    orgId: number,
    locationId?: number | null,
    params?: Record<string, unknown>,
  ) => ["admin", "org-gbp-published-local-posts", orgId, locationId, params] as const,
  adminOrgGbpPublishedLocalPostsAll: (orgId: number) =>
    ["admin", "org-gbp-published-local-posts", orgId] as const,
  adminOrgPmsJobs: (orgId: number, params?: Record<string, unknown>) =>
    ["admin", "org-pms-jobs", orgId, params] as const,
  adminOrgPmsJobsAll: (orgId: number) =>
    ["admin", "org-pms-jobs", orgId] as const,
  adminOrgPmsKeyData: (orgId: number, locationId?: number | null) =>
    ["admin", "org-pms-key-data", orgId, locationId] as const,
  adminOrgAgentOutputs: (
    orgId: number,
    agentType: string,
    params?: Record<string, unknown>,
  ) => ["admin", "org-agent-outputs", orgId, agentType, params] as const,
  adminOrgAgentOutputsAll: (orgId: number) =>
    ["admin", "org-agent-outputs", orgId] as const,

  // Admin — standalone pages
  adminAgentOutputs: (params?: Record<string, unknown>) =>
    ["admin", "agent-outputs", params] as const,
  adminAgentOutputsAll: ["admin", "agent-outputs"] as const,
  adminAgentOutputOrgs: ["admin", "agent-output-orgs"] as const,
  adminAgentOutputTypes: ["admin", "agent-output-types"] as const,
  adminActionItems: (params?: Record<string, unknown>) =>
    ["admin", "action-items", params] as const,
  adminActionItemsAll: ["admin", "action-items"] as const,
  adminActionItemOrgs: ["admin", "action-item-orgs"] as const,
  adminMissionControl: ["admin", "mission-control"] as const,
  adminMissionControlInsight: ["admin", "mission-control", "insight"] as const,
  adminInsightsSummary: (page: number, month: string) =>
    ["admin", "insights-summary", page, month] as const,
  adminInsightsSummaryAll: ["admin", "insights-summary"] as const,
  adminInsightsRecommendations: (
    agentType: string,
    page: number,
    month?: string | null,
  ) => ["admin", "insights-recommendations", agentType, page, month] as const,
  adminInsightsRecommendationsAll: (agentType: string) =>
    ["admin", "insights-recommendations", agentType] as const,
  adminSupportTickets: (params?: Record<string, unknown>) =>
    ["admin", "support", "tickets", params] as const,
  adminSupportTicketsAll: ["admin", "support", "tickets"] as const,
  adminSupportTicket: (ticketId: string | null) =>
    ["admin", "support", "ticket", ticketId] as const,
  adminSupportAssignees: ["admin", "support", "assignees"] as const,

  // Admin — website detail
  adminWebsiteDetail: (uuid: string) =>
    ["admin", "website-detail", uuid] as const,
  adminWebsiteReviewStats: (uuid: string) =>
    ["admin", "website-detail", uuid, "review-stats"] as const,
  adminWebsiteReviewStatsAll: (uuid: string) =>
    ["admin", "website-detail", uuid, "review-stats"] as const,
  adminWebsiteReviews: (uuid: string, params?: Record<string, unknown>) =>
    ["admin", "website-detail", uuid, "reviews", params] as const,
  adminWebsiteReviewsAll: (uuid: string) =>
    ["admin", "website-detail", uuid, "reviews"] as const,
  adminWebsiteReviewJob: (uuid: string, jobId: string) =>
    ["admin", "website-detail", uuid, "review-job", jobId] as const,
  adminWebsiteRecipients: (uuid: string) =>
    ["admin", "website-detail", uuid, "recipients"] as const,
  adminWebsiteFormCatalog: (uuid: string) =>
    ["admin", "website-detail", uuid, "form-catalog"] as const,
  adminWebsiteIntegrations: (uuid: string) =>
    ["admin", "website-detail", uuid, "integrations"] as const,
  adminWebsiteGscConnections: (uuid: string) =>
    ["admin", "website-detail", uuid, "integrations", "gsc", "connections"] as const,
  adminWebsiteGscSites: (uuid: string, connectionId: number | null) =>
    ["admin", "website-detail", uuid, "integrations", "gsc", "sites", connectionId] as const,

  // Client — notifications
  notifications: (orgId: number | null, locationId: number | null) =>
    ["notifications", orgId, locationId] as const,
  supportTickets: (params?: Record<string, unknown>) =>
    ["support", "tickets", params] as const,
  supportTicketsAll: ["support", "tickets"] as const,
  supportTicket: (ticketId: string | null) =>
    ["support", "ticket", ticketId] as const,

  // Client — settings
  settings: {
    users: ["settings", "users"] as const,
    scopes: ["settings", "scopes"] as const,
    gscIntegration: ["settings", "gsc", "integration"] as const,
    gscConnections: ["settings", "gsc", "connections"] as const,
    gscSites: (connectionId: number | null) =>
      ["settings", "gsc", "sites", connectionId] as const,
    pmsStatus: (orgId: number) => ["settings", "pms", orgId] as const,
  },

  // Client — agent data / dashboard
  agentData: (orgId: number | null, locationId?: number | null) =>
    ["agent-data", orgId, locationId] as const,
  tasks: (orgId: number | null, locationId?: number | null) =>
    ["tasks", orgId, locationId] as const,
  pmsFocusPeriod: (orgId: number | null, locationId?: number | null) =>
    ["pms-focus-period", orgId, locationId] as const,
  gbpAutomation: (
    orgId: number | null,
    locationId?: number | null,
    params?: Record<string, unknown>,
  ) => ["gbp-automation", orgId, locationId, params] as const,
  gbpAutomationAll: (orgId: number | null) =>
    ["gbp-automation", orgId] as const,
  gbpPublishedLocalPosts: (
    orgId: number | null,
    locationId?: number | null,
    params?: Record<string, unknown>,
  ) => ["gbp-published-local-posts", orgId, locationId, params] as const,
  gbpPublishedLocalPostsAll: (orgId: number | null) =>
    ["gbp-published-local-posts", orgId] as const,

  // Client — DFY website
  userWebsite: ["user", "website"] as const,
  websiteSubmissions: (params?: { page?: number; limit?: number }) =>
    ["user", "website", "submissions", params] as const,
  websiteRecipients: ["user", "website", "recipients"] as const,
} as const;
