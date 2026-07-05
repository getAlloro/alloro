import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  adminOsDiffVersions,
  adminOsListVersions,
  adminOsRestoreVersion,
  type OsDocumentVersion,
  type OsPagination,
  type OsVersionDiff,
} from "../../api/admin-os";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * Version history, line-diff, and non-destructive restore
 * (plans/07042026-alloro-os-admin-port P3 T1/T5). Diff sides address a
 * version number or the literal "draft" token (P2 contract).
 */

export type AdminOsVersionsData = {
  versions: OsDocumentVersion[];
  pagination: OsPagination;
};

export function useAdminOsVersions(documentId: string | null, enabled = true) {
  return useQuery<AdminOsVersionsData>({
    queryKey: QUERY_KEYS.adminOsVersions(documentId),
    queryFn: () => adminOsListVersions(documentId as string),
    enabled: Boolean(documentId) && enabled,
  });
}

export function useAdminOsVersionDiff(
  documentId: string | null,
  from: number | "draft" | null,
  to: number | "draft" | null,
) {
  return useQuery<OsVersionDiff>({
    queryKey: QUERY_KEYS.adminOsVersionDiff(
      documentId,
      String(from),
      String(to),
    ),
    queryFn: () =>
      adminOsDiffVersions(
        documentId as string,
        from as number | "draft",
        to as number | "draft",
      ),
    enabled: Boolean(documentId) && from !== null && to !== null,
  });
}

export function useRestoreOsVersion(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionNo: number) =>
      adminOsRestoreVersion(documentId, versionNo),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsDocument(documentId),
      });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsDocumentsAll,
      });
      toast.success(`Restored as v${result.version.version_no}`);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't restore the version");
    },
  });
}
