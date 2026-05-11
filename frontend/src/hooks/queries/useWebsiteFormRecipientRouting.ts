import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchFormRecipientCatalog,
  fetchRecipients,
  updateFormCatalogPreferences,
  updateFormRecipientRule,
  type FormCatalogPreferenceInput,
  type WebsiteFormCatalogItem,
  type RecipientsResponse,
} from "../../api/websites";
import { QUERY_KEYS } from "../../lib/queryClient";

export type FetchFormRecipientCatalogFn = (
  projectId: string,
) => Promise<{ success: boolean; data: WebsiteFormCatalogItem[] }>;

export type FetchWebsiteRecipientsFn = (
  projectId: string,
) => Promise<RecipientsResponse>;

export type UpdateFormRecipientRuleFn = (
  projectId: string,
  payload: { formName: string; recipients: string[]; isEnabled: boolean },
) => ReturnType<typeof updateFormRecipientRule>;

export type UpdateFormCatalogPreferencesFn = (
  projectId: string,
  payload: { preferences: FormCatalogPreferenceInput[] },
) => ReturnType<typeof updateFormCatalogPreferences>;

function compareForms(
  a: WebsiteFormCatalogItem,
  b: WebsiteFormCatalogItem,
): number {
  const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;

  if (b.submission_count !== a.submission_count) {
    return b.submission_count - a.submission_count;
  }
  const aLastSeen = a.last_seen ? new Date(a.last_seen).getTime() : 0;
  const bLastSeen = b.last_seen ? new Date(b.last_seen).getTime() : 0;
  if (bLastSeen !== aLastSeen) return bLastSeen - aLastSeen;
  return a.form_name.localeCompare(b.form_name);
}

export function useWebsiteFormRecipientCatalog(
  projectId: string,
  options?: {
    fetchCatalogFn?: FetchFormRecipientCatalogFn;
    queryKey?: readonly unknown[];
    refetchInterval?: number;
  },
) {
  const queryKey = options?.queryKey ?? QUERY_KEYS.adminWebsiteFormCatalog(projectId);

  return useQuery<WebsiteFormCatalogItem[]>({
    queryKey,
    queryFn: async () => {
      const fetchFn = options?.fetchCatalogFn ?? fetchFormRecipientCatalog;
      const response = await fetchFn(projectId);
      return response.data;
    },
    refetchInterval: options?.refetchInterval,
    enabled: Boolean(projectId),
  });
}

export function useUpdateWebsiteFormCatalogPreferences(
  projectId: string,
  options?: {
    updatePreferencesFn?: UpdateFormCatalogPreferencesFn;
    catalogQueryKey?: readonly unknown[];
  },
) {
  const queryClient = useQueryClient();
  const catalogQueryKey =
    options?.catalogQueryKey ?? QUERY_KEYS.adminWebsiteFormCatalog(projectId);

  return useMutation({
    mutationFn: (payload: { preferences: FormCatalogPreferenceInput[] }) => {
      const updateFn =
        options?.updatePreferencesFn ?? updateFormCatalogPreferences;
      return updateFn(projectId, payload);
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: catalogQueryKey });
      const previousCatalog =
        queryClient.getQueryData<WebsiteFormCatalogItem[]>(catalogQueryKey);
      const preferencesByName = new Map(
        payload.preferences.map((preference) => [
          preference.formName,
          preference,
        ]),
      );

      queryClient.setQueryData<WebsiteFormCatalogItem[]>(
        catalogQueryKey,
        (current) =>
          current
            ?.map((form) => {
              const preference = preferencesByName.get(form.form_name);
              if (!preference) return form;
              return {
                ...form,
                display_label: preference.displayLabel,
                sort_order: preference.sortOrder,
              };
            })
            .sort(compareForms) ?? current,
      );

      return { previousCatalog };
    },
    onError: (_error, _payload, context) => {
      if (context?.previousCatalog) {
        queryClient.setQueryData(catalogQueryKey, context.previousCatalog);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: catalogQueryKey,
      });
    },
  });
}

export function useAdminWebsiteRecipients(
  projectId: string,
  options?: {
    fetchRecipientsFn?: FetchWebsiteRecipientsFn;
    queryKey?: readonly unknown[];
  },
) {
  const queryKey = options?.queryKey ?? QUERY_KEYS.adminWebsiteRecipients(projectId);

  return useQuery<RecipientsResponse["data"]>({
    queryKey,
    queryFn: async () => {
      const fetchFn = options?.fetchRecipientsFn ?? fetchRecipients;
      const response = await fetchFn(projectId);
      return response.data;
    },
    enabled: Boolean(projectId),
  });
}

export function useUpdateWebsiteFormRecipientRule(
  projectId: string,
  options?: {
    updateRuleFn?: UpdateFormRecipientRuleFn;
    catalogQueryKey?: readonly unknown[];
  },
) {
  const queryClient = useQueryClient();
  const catalogQueryKey =
    options?.catalogQueryKey ?? QUERY_KEYS.adminWebsiteFormCatalog(projectId);

  return useMutation({
    mutationFn: (payload: {
      formName: string;
      recipients: string[];
      isEnabled: boolean;
    }) => {
      const updateFn = options?.updateRuleFn ?? updateFormRecipientRule;
      return updateFn(projectId, payload);
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: catalogQueryKey });
      const previousCatalog =
        queryClient.getQueryData<WebsiteFormCatalogItem[]>(catalogQueryKey);

      queryClient.setQueryData<WebsiteFormCatalogItem[]>(
        catalogQueryKey,
        (current) =>
          current?.map((form) => {
            if (form.form_name !== payload.formName) return form;
            return {
              ...form,
              rule: {
                id: form.rule?.id ?? `optimistic-${form.form_key}`,
                recipients: payload.recipients,
                is_enabled: payload.isEnabled,
                updated_at: new Date().toISOString(),
              },
            };
          }) ?? current,
      );

      return { previousCatalog };
    },
    onError: (_error, _payload, context) => {
      if (context?.previousCatalog) {
        queryClient.setQueryData(catalogQueryKey, context.previousCatalog);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: catalogQueryKey,
      });
    },
  });
}
