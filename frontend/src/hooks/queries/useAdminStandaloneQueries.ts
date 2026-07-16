/**
 * TanStack Query hooks for standalone admin pages:
 *   AgentOutputsList
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, QUERY_KEYS } from "../../lib/queryClient";

// ─── API imports ─────────────────────────────────────────────────
import {
  fetchAgentOutputs,
  fetchOrganizations,
  fetchAgentTypes,
} from "../../api/agentOutputs";
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

// INVALIDATION HOOKS
// =====================================================================

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
