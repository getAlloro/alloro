import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  adminOsArchiveDocument,
  adminOsCreateDocument,
  adminOsPublishDocument,
  adminOsReindexDocument,
  adminOsRenameDocument,
  adminOsUpdateDocumentMeta,
  type OsUpdateMetaPatch,
} from "../../api/admin-os";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * Document mutations with granular invalidation (plans/07042026-alloro-os-
 * admin-port P3 T1, §15.1). Errors surface via react-hot-toast (§16.3) except
 * publish, whose conflict handling (OS_VERSION_CONFLICT → reload offer) lives
 * in OsPublishModal.
 */

/** Invalidate the list surfaces a document row appears on. */
function invalidateOsLists(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({
    queryKey: QUERY_KEYS.adminOsDocumentsAll,
  });
  void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.adminOsFolders });
  void queryClient.invalidateQueries({
    queryKey: QUERY_KEYS.adminOsCategories,
  });
}

export function useCreateOsDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; folder_id?: string | null }) =>
      adminOsCreateDocument(input),
    onSuccess: () => invalidateOsLists(queryClient),
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't create the document");
    },
  });
}

export function useRenameOsDocument(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => adminOsRenameDocument(documentId, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsDocument(documentId),
      });
      invalidateOsLists(queryClient);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't rename the document");
    },
  });
}

/** Soft-archive into the trash; usable from any surface (id is the variable). */
export function useArchiveOsDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => adminOsArchiveDocument(documentId),
    onSuccess: (_data, documentId) => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsDocument(documentId),
      });
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsTrashAll,
      });
      invalidateOsLists(queryClient);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't move the document to trash");
    },
  });
}

/** folder/owner/category/tags patch — also the target of both dnd views. */
export function useUpdateOsDocumentMeta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { documentId: string; patch: OsUpdateMetaPatch }) =>
      adminOsUpdateDocumentMeta(variables.documentId, variables.patch),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsDocument(variables.documentId),
      });
      invalidateOsLists(queryClient);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't update the document");
    },
  });
}

/**
 * Publish v(N+1) from the draft. No default toast: OsPublishModal owns the
 * error UX so a 409 OS_VERSION_CONFLICT can offer a reload instead.
 */
export function usePublishOsDocument(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      base_version: number;
      summary?: string | null;
      note?: string | null;
    }) => adminOsPublishDocument(documentId, input),
    onSuccess: () => {
      // Prefix key: also refreshes the draft, versions, and diff facets.
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsDocument(documentId),
      });
      invalidateOsLists(queryClient);
    },
  });
}

export function useReindexOsDocument(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adminOsReindexDocument(documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsDocument(documentId),
      });
      invalidateOsLists(queryClient);
      toast.success("Reindex queued");
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't queue the reindex");
    },
  });
}
