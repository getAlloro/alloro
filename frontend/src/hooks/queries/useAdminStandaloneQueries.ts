/**
 * TanStack Query hooks for standalone admin pages:
 *   AgentOutputsList, ActionItemsHub
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, QUERY_KEYS } from "../../lib/queryClient";

// ─── API imports ─────────────────────────────────────────────────
import { fetchAllTasks } from "../../api/tasks";
import {
  fetchAgentOutputs,
  fetchOrganizations,
  fetchAgentTypes,
} from "../../api/agentOutputs";
import type {
  ActionItemsResponse,
  FetchActionItemsRequest,
} from "../../types/tasks";
import type {
  AgentOutput,
  FetchAgentOutputsRequest,
} from "../../types/agentOutputs";

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
// ACTION ITEMS HUB (STANDALONE PAGE)
// =====================================================================

export function useAdminActionItems(filters: FetchActionItemsRequest) {
  const queryKey = QUERY_KEYS.adminActionItems(filters as Record<string, unknown>);

  return useQuery<ActionItemsResponse>({
    queryKey,
    queryFn: () => fetchAllTasks(filters),
    refetchInterval: 3000, // 3-second silent auto-refresh
    refetchIntervalInBackground: false,
    initialData: () =>
      queryClient.getQueryData<ActionItemsResponse>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

export function useAdminActionItemOrgs() {
  const queryKey = QUERY_KEYS.adminActionItemOrgs;

  return useQuery<{ id: number; name: string }[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetchOrganizations();
      return response.organizations;
    },
    staleTime: 10 * 60 * 1000,
    initialData: () =>
      queryClient.getQueryData<{ id: number; name: string }[]>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
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

export function useInvalidateAdminActionItems() {
  const qc = useQueryClient();
  return {
    invalidateAll: useCallback(
      () =>
        qc.invalidateQueries({ queryKey: QUERY_KEYS.adminActionItemsAll }),
      [qc],
    ),
  };
}
