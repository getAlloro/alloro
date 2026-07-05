import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  adminOsCreateComment,
  adminOsDeleteComment,
  adminOsGetComments,
  adminOsUpdateComment,
  type OsCommentThreadView,
} from "../../api/admin-os";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * Threaded document comments for the read-rail (plans/07042026-alloro-os-admin-
 * port P7 T2). Triad analog (§12.1): api/admin-os.ts → these hooks →
 * QUERY_KEYS. The query owns the thread (live version + roots + one reply
 * level); create/edit/delete mutate then invalidate the same key so the rail
 * refreshes. Edit/delete are author-only — the SERVER is the gate (§5.4); a
 * 403 surfaces here as a toast (§16.3). No task fields anywhere.
 */

export function useAdminOsComments(documentId: string | null) {
  return useQuery<OsCommentThreadView>({
    queryKey: QUERY_KEYS.adminOsComments(documentId),
    queryFn: () => adminOsGetComments(documentId as string),
    enabled: Boolean(documentId),
  });
}

function useInvalidateComments(documentId: string) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.adminOsComments(documentId),
    });
}

/** Add a comment or a reply, then refresh the thread. */
export function useCreateOsComment(documentId: string) {
  const invalidate = useInvalidateComments(documentId);
  return useMutation({
    mutationFn: (input: { bodyMd: string; parentCommentId?: string | null }) =>
      adminOsCreateComment(documentId, {
        body_md: input.bodyMd,
        parent_comment_id: input.parentCommentId ?? null,
      }),
    onSuccess: invalidate,
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't post the comment");
    },
  });
}

/** Edit a comment's body (author-only server-side), then refresh. */
export function useEditOsComment(documentId: string) {
  const invalidate = useInvalidateComments(documentId);
  return useMutation({
    mutationFn: (variables: { commentId: string; bodyMd: string }) =>
      adminOsUpdateComment(variables.commentId, variables.bodyMd),
    onSuccess: invalidate,
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't save the edit");
    },
  });
}

/** Tombstone a comment (author-only server-side), then refresh. */
export function useDeleteOsComment(documentId: string) {
  const invalidate = useInvalidateComments(documentId);
  return useMutation({
    mutationFn: (commentId: string) => adminOsDeleteComment(commentId),
    onSuccess: invalidate,
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't delete the comment");
    },
  });
}
