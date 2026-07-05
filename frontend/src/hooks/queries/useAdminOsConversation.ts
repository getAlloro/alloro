import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  adminOsAttachContext,
  adminOsDetachContext,
  adminOsGetConversation,
  type OsChatConversationDetail,
} from "../../api/admin-os-chat";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * One OS chat conversation — its transcript + attached context — plus the
 * @-context attach/detach mutations (plans/07042026-alloro-os-admin-port P5 T3).
 * The stream hook writes tokens into this same cache key, so the thread renders
 * live as they arrive. Disabled until a conversation id exists.
 */

export function useAdminOsConversation(conversationId: string | null) {
  return useQuery<OsChatConversationDetail>({
    queryKey: QUERY_KEYS.adminOsConversation(conversationId),
    queryFn: () => adminOsGetConversation(conversationId as string),
    enabled: Boolean(conversationId),
  });
}

export function useAttachOsContext(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      adminOsAttachContext(conversationId, documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsConversation(conversationId),
      });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't attach the document");
    },
  });
}

export function useDetachOsContext(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      adminOsDetachContext(conversationId, documentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsConversation(conversationId),
      });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't detach the document");
    },
  });
}
