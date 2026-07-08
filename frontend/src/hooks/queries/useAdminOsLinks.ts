import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  adminOsCreateLink,
  adminOsGetLinks,
  adminOsUpdateLinkStatus,
  type OsLinksView,
} from "../../api/admin-os";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * Related-document links for the read-rail (plans/07042026-alloro-os-admin-port
 * P4 T5). Triad analog (§12.1): api/admin-os.ts → these hooks → QUERY_KEYS.
 * The query owns the three buckets (accepted out-links, backlinks, suggestions);
 * the mutations accept/reject/create then invalidate the same key so the rail
 * reflects the change. Errors surface via react-hot-toast (§16.3).
 */

export function useAdminOsLinks(documentId: string | null) {
  return useQuery<OsLinksView>({
    queryKey: QUERY_KEYS.adminOsLinks(documentId),
    queryFn: () => adminOsGetLinks(documentId as string),
    enabled: Boolean(documentId),
  });
}

/** Accept or reject a suggested link, then refresh the rail. */
export function useUpdateOsLinkStatus(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: {
      linkId: string;
      status: "accepted" | "rejected";
    }) => adminOsUpdateLinkStatus(variables.linkId, variables.status),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsLinks(documentId),
      });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't update the link");
    },
  });
}

/** Manually link this document to another (created accepted). */
export function useCreateOsLink(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetDocumentId: string) =>
      adminOsCreateLink(documentId, targetDocumentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsLinks(documentId),
      });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't add the link");
    },
  });
}
