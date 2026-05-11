import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchFormRecipientCatalog,
  fetchRecipients,
  updateFormRecipientRule,
  type WebsiteFormCatalogItem,
  type RecipientsResponse,
} from "../../api/websites";
import { QUERY_KEYS } from "../../lib/queryClient";

export function useWebsiteFormRecipientCatalog(projectId: string) {
  const queryKey = QUERY_KEYS.adminWebsiteFormCatalog(projectId);

  return useQuery<WebsiteFormCatalogItem[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetchFormRecipientCatalog(projectId);
      return response.data;
    },
    enabled: Boolean(projectId),
  });
}

export function useAdminWebsiteRecipients(projectId: string) {
  const queryKey = QUERY_KEYS.adminWebsiteRecipients(projectId);

  return useQuery<RecipientsResponse["data"]>({
    queryKey,
    queryFn: async () => {
      const response = await fetchRecipients(projectId);
      return response.data;
    },
    enabled: Boolean(projectId),
  });
}

export function useUpdateWebsiteFormRecipientRule(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      formName: string;
      recipients: string[];
      isEnabled: boolean;
    }) => updateFormRecipientRule(projectId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminWebsiteFormCatalog(projectId),
      });
    },
  });
}
