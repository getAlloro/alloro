import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  adminOsListTrash,
  adminOsPurgeDocument,
  adminOsRestoreFromTrash,
  type OsDocumentListItem,
  type OsPagination,
} from "../../api/admin-os";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * Trash surface: archived list, restore (→ processing + re-ingest), and the
 * queued permanent purge (plans/07042026-alloro-os-admin-port P3 T1/T6).
 */

export type AdminOsTrashData = {
  documents: OsDocumentListItem[];
  pagination: OsPagination;
};

export function useAdminOsTrash(params: { page?: number; limit?: number } = {}) {
  return useQuery<AdminOsTrashData>({
    queryKey: QUERY_KEYS.adminOsTrash(params),
    queryFn: () => adminOsListTrash(params),
  });
}

function useInvalidateOsTrash() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminOsTrashAll });
    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.adminOsDocumentsAll,
    });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminOsFolders });
  };
}

export function useRestoreOsFromTrash() {
  const invalidate = useInvalidateOsTrash();
  return useMutation({
    mutationFn: (documentId: string) => adminOsRestoreFromTrash(documentId),
    onSuccess: (result) => {
      invalidate();
      toast.success(`Restored "${result.document.title}"`);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't restore the document");
    },
  });
}

export function usePurgeOsDocument() {
  const invalidate = useInvalidateOsTrash();
  return useMutation({
    mutationFn: (documentId: string) => adminOsPurgeDocument(documentId),
    onSuccess: () => {
      invalidate();
      toast.success("Permanent delete queued");
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't delete the document");
    },
  });
}
