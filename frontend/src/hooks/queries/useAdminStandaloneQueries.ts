/**
 * TanStack Query hooks for standalone admin pages:
 *   AIDataInsightsList, AIDataInsightsDetail, AgentOutputsList
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, QUERY_KEYS } from "../../lib/queryClient";

// ─── API imports ─────────────────────────────────────────────────
import { adminFetch } from "../../api";
import {
  fetchAgentOutputs,
  fetchOrganizations,
  fetchAgentTypes,
} from "../../api/agentOutputs";
import type {
  AgentOutput,
  FetchAgentOutputsRequest,
} from "../../types/agentOutputs";
import type {
  AgentInsightSummary,
  AgentInsightsSummaryResponse,
  AgentRecommendation,
  AgentRecommendationsResponse,
} from "../../types/agentInsights";

// =====================================================================
// AI DATA INSIGHTS — SUMMARY LIST
// =====================================================================

export function useAdminInsightsSummary(page: number, month: string) {
  const queryKey = QUERY_KEYS.adminInsightsSummary(page, month);

  return useQuery<{
    data: AgentInsightSummary[];
    totalPages: number;
  }>({
    queryKey,
    queryFn: async () => {
      const response = await adminFetch(
        `/api/admin/agent-insights/summary?page=${page}&limit=50&month=${month}`,
      );
      const json: AgentInsightsSummaryResponse = await response.json();

      if (!json.success) throw new Error(json.message || "Failed to fetch summary");
      return {
        data: json.data,
        totalPages: json.pagination.totalPages,
      };
    },
    initialData: () =>
      queryClient.getQueryData<{ data: AgentInsightSummary[]; totalPages: number }>(
        queryKey,
      ),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

// =====================================================================
// AI DATA INSIGHTS — RECOMMENDATIONS DETAIL
// =====================================================================

export function useAdminInsightsRecommendations(
  agentType: string | undefined,
  page: number,
  month?: string | null,
) {
  const queryKey = QUERY_KEYS.adminInsightsRecommendations(
    agentType || "",
    page,
    month,
  );

  return useQuery<{
    data: AgentRecommendation[];
    totalPages: number;
  }>({
    queryKey,
    queryFn: async () => {
      const monthParam = month ? `&month=${month}` : "";
      const response = await adminFetch(
        `/api/admin/agent-insights/${agentType}/recommendations?page=${page}&limit=50${monthParam}`,
      );
      const json: AgentRecommendationsResponse = await response.json();

      if (!json.success) throw new Error("Failed to load recommendations");
      return {
        data: json.data,
        totalPages: json.pagination.totalPages,
      };
    },
    enabled: !!agentType,
    initialData: () =>
      queryClient.getQueryData<{
        data: AgentRecommendation[];
        totalPages: number;
      }>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

// =====================================================================
// AGENT OUTPUTS LIST (STANDALONE PAGE)
// =====================================================================

export function useAdminAgentOutputsList(filters: FetchAgentOutputsRequest) {
  const queryKey = QUERY_KEYS.adminAgentOutputs(filters as Record<string, unknown>);

  return useQuery<{
    data: AgentOutput[];
    total: number;
    totalPages: number;
  }>({
    queryKey,
    queryFn: async () => {
      const response = await fetchAgentOutputs(filters);
      return {
        data: response.data,
        total: response.pagination.total,
        totalPages: response.pagination.totalPages,
      };
    },
    initialData: () =>
      queryClient.getQueryData<{
        data: AgentOutput[];
        total: number;
        totalPages: number;
      }>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

export function useAdminAgentOutputOrgs() {
  const queryKey = QUERY_KEYS.adminAgentOutputOrgs;

  return useQuery<{ id: number; name: string }[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetchOrganizations();
      return response.organizations;
    },
    staleTime: 10 * 60 * 1000, // orgs rarely change
    initialData: () =>
      queryClient.getQueryData<{ id: number; name: string }[]>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

export function useAdminAgentOutputTypesList() {
  const queryKey = QUERY_KEYS.adminAgentOutputTypes;

  return useQuery<string[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetchAgentTypes();
      return response.agentTypes;
    },
    staleTime: 10 * 60 * 1000,
    initialData: () => queryClient.getQueryData<string[]>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

// =====================================================================
// INVALIDATION HOOKS
// =====================================================================

export function useInvalidateAdminInsights() {
  const qc = useQueryClient();
  return {
    invalidateAll: useCallback(
      () => qc.invalidateQueries({ queryKey: QUERY_KEYS.adminInsightsSummaryAll }),
      [qc],
    ),
    invalidateRecommendations: useCallback(
      (agentType: string) =>
        qc.invalidateQueries({
          queryKey: QUERY_KEYS.adminInsightsRecommendationsAll(agentType),
        }),
      [qc],
    ),
  };
}

export function useInvalidateAdminAgentOutputs() {
  const qc = useQueryClient();
  return {
    invalidateAll: useCallback(
      () =>
        qc.invalidateQueries({ queryKey: QUERY_KEYS.adminAgentOutputsAll }),
      [qc],
    ),
  };
}
