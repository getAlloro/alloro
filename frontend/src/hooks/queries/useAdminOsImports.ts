import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  adminOsGetDocumentImport,
  adminOsImportFiles,
  type OsDocumentImport,
  type OsImportResult,
} from "../../api/admin-os";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * OS file import (plans/07042026-alloro-os-admin-port P6 T4, §15.1). The batch
 * upload mutation refreshes the library lists so started documents appear; each
 * import row's status is then polled per-file until it settles
 * (converted/failed). Errors surface via react-hot-toast (§16.3).
 */

// Poll cadence while a file converts (pending) — stops once it settles.
const OS_IMPORT_POLL_MS = 2500;

function invalidateOsLists(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({
    queryKey: QUERY_KEYS.adminOsDocumentsAll,
  });
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminOsFolders });
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminOsCategories });
}

export function useImportOsFiles() {
  const queryClient = useQueryClient();
  return useMutation<
    OsImportResult,
    unknown,
    { files: File[]; category?: string | null; folderId?: string | null }
  >({
    mutationFn: (input) => adminOsImportFiles(input),
    onSuccess: () => invalidateOsLists(queryClient),
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't start the import");
    },
  });
}

/**
 * Poll one document's import provenance row (status + warnings). Enabled only
 * while `active` and the id is set; refetches every ~2.5s until the status
 * leaves `pending`. When a row settles to `converted`, the caller refreshes the
 * library so the row's document status flips too.
 */
export function useAdminOsDocumentImport(
  documentId: string | null,
  active: boolean,
) {
  return useQuery<OsDocumentImport | null>({
    queryKey: QUERY_KEYS.adminOsDocumentImport(documentId),
    queryFn: async () =>
      (await adminOsGetDocumentImport(documentId as string)).import,
    enabled: Boolean(documentId) && active,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? OS_IMPORT_POLL_MS : false,
  });
}
