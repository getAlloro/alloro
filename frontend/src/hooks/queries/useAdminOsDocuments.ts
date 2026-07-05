import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  adminOsCreateCategory,
  adminOsListCategories,
  adminOsListDocuments,
  type OsCategory,
  type OsDocumentListItem,
  type OsDocumentListParams,
  type OsPagination,
} from "../../api/admin-os";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * Library list + category taxonomy queries (plans/07042026-alloro-os-admin-port
 * P3 T1). Triad analog (§12.1): api/admin-os.ts → these hooks → QUERY_KEYS.
 */

const OS_LIST_STALE_TIME_MS = 15_000;

export type AdminOsDocumentsData = {
  documents: OsDocumentListItem[];
  pagination: OsPagination;
};

export function useAdminOsDocuments(params: OsDocumentListParams = {}) {
  return useQuery<AdminOsDocumentsData>({
    queryKey: QUERY_KEYS.adminOsDocuments(params),
    queryFn: () => adminOsListDocuments(params),
    staleTime: OS_LIST_STALE_TIME_MS,
  });
}

export function useAdminOsCategories() {
  return useQuery<OsCategory[]>({
    queryKey: QUERY_KEYS.adminOsCategories,
    queryFn: async () => (await adminOsListCategories()).categories,
    staleTime: OS_LIST_STALE_TIME_MS,
  });
}

export function useCreateOsCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => adminOsCreateCategory(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsCategories,
      });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't create the category");
    },
  });
}
