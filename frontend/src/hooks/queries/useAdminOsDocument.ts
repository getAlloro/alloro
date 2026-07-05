import { useQuery } from "@tanstack/react-query";
import {
  adminOsGetDocument,
  adminOsGetDraft,
  type OsDocumentDraft,
  type OsDocumentListItem,
  type OsDocumentVersion,
} from "../../api/admin-os";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * Single-document detail (enriched row + live version) and the autosave draft
 * (plans/07042026-alloro-os-admin-port P3 T1). §15.1: server state stays in
 * React Query — the edit page seeds its editor once from the draft payload.
 */

export type AdminOsDocumentDetail = {
  document: OsDocumentListItem;
  version: OsDocumentVersion | null;
};

/** Poll cadence while the ingest pipeline runs, so the status dot turns green
 *  (or red) without a manual refresh (P4 T5). Stops the moment status settles. */
const OS_PROCESSING_POLL_MS = 4000;

export function useAdminOsDocument(documentId: string | null) {
  return useQuery<AdminOsDocumentDetail>({
    queryKey: QUERY_KEYS.adminOsDocument(documentId),
    queryFn: () => adminOsGetDocument(documentId as string),
    enabled: Boolean(documentId),
    // While indexing, refetch every ~4s so the read view reflects indexed /
    // processing_failed as soon as the worker lands; idle otherwise.
    refetchInterval: (query) =>
      query.state.data?.document.status === "processing"
        ? OS_PROCESSING_POLL_MS
        : false,
  });
}

export function useAdminOsDraft(documentId: string | null, enabled = true) {
  return useQuery<OsDocumentDraft>({
    queryKey: QUERY_KEYS.adminOsDraft(documentId),
    queryFn: async () => (await adminOsGetDraft(documentId as string)).draft,
    enabled: Boolean(documentId) && enabled,
    // The editor owns the text after seeding; never refetch underneath it.
    staleTime: Infinity,
    gcTime: 0,
  });
}
