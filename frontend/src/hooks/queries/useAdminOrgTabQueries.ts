/**
 * TanStack Query hooks for admin org detail sub-tabs:
 *   OrgTasksTab, OrgNotificationsTab, OrgRankingsTab, OrgPmsTab, OrgAgentOutputsTab
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, QUERY_KEYS } from "../../lib/queryClient";

// ─── API imports ─────────────────────────────────────────────────
import { adminFetch } from "../../api";
import { fetchAllTasks } from "../../api/tasks";
import {
  fetchAdminNotifications,
  type Notification,
} from "../../api/notifications";
import {
  fetchPmsJobs,
  fetchPmsKeyData,
  type PmsJob,
  type PmsKeyDataResponse,
} from "../../api/pms";
import { fetchAgentOutputs } from "../../api/agentOutputs";
import type {
  ActionItem,
  FetchActionItemsRequest,
} from "../../types/tasks";
import type { AgentOutput, AgentOutputType } from "../../types/agentOutputs";

// =====================================================================
// ORG TASKS
// =====================================================================

interface OrgTasksParams {
  organizationId: number;
  locationId?: number | null;
  statusFilter?: string;
  categoryFilter?: string;
  page?: number;
  pageSize?: number;
}

export function useAdminOrgTasks({
  organizationId,
  locationId,
  statusFilter = "all",
  categoryFilter = "all",
  page = 1,
  pageSize = 50,
}: OrgTasksParams) {
  const params: Record<string, unknown> = {
    locationId,
    statusFilter,
    categoryFilter,
    page,
  };
  const queryKey = QUERY_KEYS.adminOrgTasks(organizationId, params);

  return useQuery<{ tasks: ActionItem[]; total: number }>({
    queryKey,
    queryFn: async () => {
      const filters: FetchActionItemsRequest = {
        organization_id: organizationId,
        location_id: locationId ?? undefined,
        status:
          statusFilter !== "all"
            ? (statusFilter as "complete" | "pending" | "in_progress" | "archived")
            : undefined,
        category:
          categoryFilter !== "all"
            ? (categoryFilter as "ALLORO" | "USER")
            : undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      const response = await fetchAllTasks(filters);
      if (!response.success) throw new Error("Failed to load tasks");
      return { tasks: response.tasks, total: response.total };
    },
    initialData: () =>
      queryClient.getQueryData<{ tasks: ActionItem[]; total: number }>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

// =====================================================================
// ORG NOTIFICATIONS
// =====================================================================

interface OrgNotificationsParams {
  organizationId: number;
  locationId?: number | null;
  page?: number;
  pageSize?: number;
}

export function useAdminOrgNotifications({
  organizationId,
  locationId,
  page = 1,
  pageSize = 20,
}: OrgNotificationsParams) {
  const params: Record<string, unknown> = { locationId, page };
  const queryKey = QUERY_KEYS.adminOrgNotifications(organizationId, params);

  return useQuery<{ notifications: Notification[]; total: number }>({
    queryKey,
    queryFn: async () => {
      const response = await fetchAdminNotifications({
        organization_id: organizationId,
        location_id: locationId ?? undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      if (!response.success) throw new Error("Failed to load notifications");
      return {
        notifications: response.notifications,
        total: response.total,
      };
    },
    initialData: () =>
      queryClient.getQueryData<{ notifications: Notification[]; total: number }>(
        queryKey,
      ),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

// =====================================================================
// ORG RANKINGS
// =====================================================================

interface RankingJob {
  id: number;
  organization_id?: number;
  location_id?: number | null;
  location_name?: string | null;
  specialty: string;
  location: string | null;
  gbp_location_id?: string | null;
  gbp_location_name?: string | null;
  batch_id?: string | null;
  status: string;
  rank_score?: number | null;
  rank_position?: number | null;
  total_competitors?: number | null;
  created_at?: string;
  status_detail?: {
    currentStep: string;
    message: string;
    progress: number;
  } | null;
}

export function useAdminOrgRankings(
  organizationId: number,
  locationId: number | null,
) {
  const queryKey = QUERY_KEYS.adminOrgRankings(organizationId, locationId);

  return useQuery<RankingJob[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        organization_id: String(organizationId),
        limit: "100",
      });
      if (locationId) {
        params.set("location_id", String(locationId));
      }

      const response = await adminFetch(
        `/api/admin/practice-ranking/list?${params.toString()}`,
      );

      if (!response.ok) throw new Error("Failed to fetch rankings");

      const data = await response.json();
      return data.rankings || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes — rankings don't change often
    initialData: () => queryClient.getQueryData<RankingJob[]>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

// =====================================================================
// ORG PMS
// =====================================================================

interface OrgPmsData {
  jobs: PmsJob[];
  total: number;
  keyData: PmsKeyDataResponse["data"] | null;
}

export function useAdminOrgPms(
  organizationId: number,
  locationId: number | null,
  page: number = 1,
) {
  const params: Record<string, unknown> = { locationId, page };
  const queryKey = QUERY_KEYS.adminOrgPmsJobs(organizationId, params);

  return useQuery<OrgPmsData>({
    queryKey,
    queryFn: async () => {
      const [jobsRes, keyRes] = await Promise.all([
        fetchPmsJobs({
          organization_id: organizationId,
          location_id: locationId || undefined,
          page,
        }),
        fetchPmsKeyData(organizationId, locationId || undefined),
      ]);

      return {
        jobs: jobsRes.success && jobsRes.data ? jobsRes.data.jobs || [] : [],
        total: jobsRes.success && jobsRes.data ? jobsRes.data.pagination?.total || 0 : 0,
        keyData: keyRes.success && keyRes.data ? keyRes.data : null,
      };
    },
    initialData: () => queryClient.getQueryData<OrgPmsData>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

// =====================================================================
// ORG AGENT OUTPUTS
// =====================================================================

interface OrgAgentOutputsParams {
  organizationId: number;
  agentType: AgentOutputType;
  locationId?: number | null;
  statusFilter?: string;
  page?: number;
  pageSize?: number;
}

export function useAdminOrgAgentOutputs({
  organizationId,
  agentType,
  locationId,
  statusFilter = "all",
  page = 1,
  pageSize = 50,
}: OrgAgentOutputsParams) {
  const params: Record<string, unknown> = {
    locationId,
    statusFilter,
    page,
  };
  const queryKey = QUERY_KEYS.adminOrgAgentOutputs(organizationId, agentType, params);

  return useQuery<{ outputs: AgentOutput[]; total: number }>({
    queryKey,
    queryFn: async () => {
      const response = await fetchAgentOutputs({
        organization_id: organizationId,
        location_id: locationId ?? undefined,
        agent_type: agentType,
        status: statusFilter !== "all" ? (statusFilter as "success" | "pending" | "error" | "archived") : undefined,
        page,
        limit: pageSize,
      });

      if (!response.success) throw new Error("Failed to load agent outputs");
      return {
        outputs: response.data || [],
        total: response.pagination.total || 0,
      };
    },
    initialData: () =>
      queryClient.getQueryData<{ outputs: AgentOutput[]; total: number }>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

// =====================================================================
// INVALIDATION HOOKS
// =====================================================================

export function useInvalidateAdminOrgTasks() {
  const qc = useQueryClient();
  return {
    invalidateForOrg: useCallback(
      (orgId: number) =>
        qc.invalidateQueries({ queryKey: QUERY_KEYS.adminOrgTasksAll(orgId) }),
      [qc],
    ),
  };
}

export function useInvalidateAdminOrgNotifications() {
  const qc = useQueryClient();
  return {
    invalidateForOrg: useCallback(
      (orgId: number) =>
        qc.invalidateQueries({
          queryKey: QUERY_KEYS.adminOrgNotificationsAll(orgId),
        }),
      [qc],
    ),
  };
}

export function useInvalidateAdminOrgRankings() {
  const qc = useQueryClient();
  return {
    invalidateForOrg: useCallback(
      (orgId: number) =>
        qc.invalidateQueries({
          queryKey: QUERY_KEYS.adminOrgRankings(orgId, null),
        }),
      [qc],
    ),
  };
}

export function useInvalidateAdminOrgPms() {
  const qc = useQueryClient();
  return {
    invalidateForOrg: useCallback(
      (orgId: number) =>
        qc.invalidateQueries({
          queryKey: QUERY_KEYS.adminOrgPmsJobsAll(orgId),
        }),
      [qc],
    ),
  };
}

export function useInvalidateAdminOrgAgentOutputs() {
  const qc = useQueryClient();
  return {
    invalidateForOrg: useCallback(
      (orgId: number) =>
        qc.invalidateQueries({
          queryKey: QUERY_KEYS.adminOrgAgentOutputsAll(orgId),
        }),
      [qc],
    ),
  };
}
