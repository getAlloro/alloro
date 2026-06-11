import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AiSeoAuditRunFilters,
  adminCreateOrganizationAiSeoAudit,
  adminCreateUrlAiSeoAudit,
  adminDeleteAiSeoAuditRun,
  adminDeleteAiSeoAuditRuns,
  adminGetAiSeoAuditRun,
  adminListAiSeoAuditRuns,
  adminListAuditableOrganizationIds,
} from "../../api/aiSeoAudit";
import { QUERY_KEYS } from "../../lib/queryClient";

const ACTIVE_STATUSES = ["queued", "running"];

export function useAiSeoAuditRuns(filters: AiSeoAuditRunFilters = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.adminAiSeoAuditRuns(filters),
    queryFn: () => adminListAiSeoAuditRuns(filters),
    placeholderData: (previousData) => previousData,
    // Poll while any run is still queued/running so new launches surface live.
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      return runs.some((run) => ACTIVE_STATUSES.includes(run.status)) ? 2500 : false;
    },
  });
}

export function useAiSeoAuditRun(runId?: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.adminAiSeoAuditRun(runId),
    queryFn: () => adminGetAiSeoAuditRun(runId!),
    enabled: Boolean(runId),
    placeholderData: (previousData) => previousData,
    // Poll the selected run until it reaches a terminal state.
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      return status && ACTIVE_STATUSES.includes(status) ? 2000 : false;
    },
  });
}

export function useAuditableOrganizationIds() {
  return useQuery({
    queryKey: QUERY_KEYS.adminAiSeoAuditableOrgs,
    queryFn: () => adminListAuditableOrganizationIds(),
    staleTime: 60_000,
  });
}

export function useAiSeoAuditActions(organizationId?: number | null) {
  const queryClient = useQueryClient();
  const invalidateRuns = () =>
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.adminAiSeoAuditRunsAll,
    });

  return {
    runUrlAudit: useMutation({
      mutationFn: (url: string) => adminCreateUrlAiSeoAudit(url),
      onSuccess: async (detail) => {
        queryClient.setQueryData(
          QUERY_KEYS.adminAiSeoAuditRun(detail.run.id),
          detail
        );
        await invalidateRuns();
      },
    }),
    runOrganizationAudit: useMutation({
      mutationFn: () => {
        if (!organizationId) throw new Error("Organization is required.");
        return adminCreateOrganizationAiSeoAudit(organizationId);
      },
      onSuccess: async (detail) => {
        queryClient.setQueryData(
          QUERY_KEYS.adminAiSeoAuditRun(detail.run.id),
          detail
        );
        await invalidateRuns();
      },
    }),
    deleteRun: useMutation({
      mutationFn: (runId: string) => adminDeleteAiSeoAuditRun(runId),
      onSuccess: async (_data, runId) => {
        queryClient.removeQueries({
          queryKey: QUERY_KEYS.adminAiSeoAuditRun(runId),
        });
        await invalidateRuns();
      },
    }),
    deleteAllRuns: useMutation({
      mutationFn: (filters: AiSeoAuditRunFilters = {}) =>
        adminDeleteAiSeoAuditRuns(filters),
      onSuccess: async () => {
        await invalidateRuns();
      },
    }),
  };
}
