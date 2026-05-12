import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, QUERY_KEYS } from "../../lib/queryClient";
import {
  createGscIntegration,
  fetchGscConnections,
  fetchGscSites,
  getReconnectUrl,
  type GscConnection,
  type GscSite,
} from "../../api/integrations";

type GscConnectionsResponse = Awaited<ReturnType<typeof fetchGscConnections>>;
type GscSitesResponse = Awaited<ReturnType<typeof fetchGscSites>>;

export function useGscConnections(projectId: string) {
  const queryKey = QUERY_KEYS.adminWebsiteGscConnections(projectId);

  return useQuery<GscConnectionsResponse>({
    queryKey,
    queryFn: () => fetchGscConnections(projectId),
    enabled: !!projectId,
    initialData: () => queryClient.getQueryData<GscConnectionsResponse>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

export function useGscSites(projectId: string, connectionId: number | null) {
  const queryKey = QUERY_KEYS.adminWebsiteGscSites(projectId, connectionId);

  return useQuery<GscSitesResponse>({
    queryKey,
    queryFn: () => fetchGscSites(projectId, connectionId!),
    enabled: !!projectId && !!connectionId,
    initialData: () => queryClient.getQueryData<GscSitesResponse>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

export function useCreateGscIntegration(projectId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: { connectionId: number; siteUrl: string }) =>
      createGscIntegration(projectId, payload),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: QUERY_KEYS.adminWebsiteIntegrations(projectId),
      });
      qc.invalidateQueries({
        queryKey: QUERY_KEYS.adminWebsiteGscConnections(projectId),
      });
    },
  });
}

export function useGoogleReconnect() {
  return useMutation({
    mutationFn: (scopes: string) => getReconnectUrl(scopes),
  });
}

export type { GscConnection, GscSite };
