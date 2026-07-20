import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, QUERY_KEYS } from "../../lib/queryClient";
import { apiGet } from "../../api/index";
import { fetchPmsKeyData, type PmsKeyDataResponse } from "../../api/pms";

// ─── Queries ────────────────────────────────────────────────────────

export function useSettingsUsers() {
  return useQuery<{ users: unknown[]; invitations: unknown[] }>({
    queryKey: QUERY_KEYS.settings.users,
    queryFn: () => apiGet({ path: "/settings/users" }),
    initialData: () =>
      queryClient.getQueryData<{ users: unknown[]; invitations: unknown[] }>(
        QUERY_KEYS.settings.users
      ),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(QUERY_KEYS.settings.users)?.dataUpdatedAt,
  });
}

export function useSettingsScopes() {
  return useQuery<{
    scopes: unknown[];
    missingScopes: string[];
    missingCount: number;
  }>({
    queryKey: QUERY_KEYS.settings.scopes,
    queryFn: () => apiGet({ path: "/settings/scopes" }),
    initialData: () =>
      queryClient.getQueryData<{
        scopes: unknown[];
        missingScopes: string[];
        missingCount: number;
      }>(QUERY_KEYS.settings.scopes),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(QUERY_KEYS.settings.scopes)?.dataUpdatedAt,
  });
}

export function usePmsStatus(orgId: number | undefined) {
  return useQuery<PmsKeyDataResponse>({
    queryKey: QUERY_KEYS.settings.pmsStatus(orgId!),
    // No arguments: the org comes from the JWT and this status card applies no
    // location filter. Previously called as fetchPmsKeyData(orgId!).
    queryFn: () => fetchPmsKeyData(),
    enabled: !!orgId,
    initialData: () =>
      queryClient.getQueryData<PmsKeyDataResponse>(
        QUERY_KEYS.settings.pmsStatus(orgId!)
      ),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(QUERY_KEYS.settings.pmsStatus(orgId!))
        ?.dataUpdatedAt,
  });
}

// ─── Invalidation ───────────────────────────────────────────────────

export function useInvalidateSettingsUsers() {
  const qc = useQueryClient();

  const invalidateAll = () =>
    qc.invalidateQueries({ queryKey: QUERY_KEYS.settings.users });

  return { invalidateAll };
}
