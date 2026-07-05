import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  adminOsCreateConversation,
  adminOsDeleteConversation,
  adminOsListConversations,
  type OsChatConversation,
} from "../../api/admin-os-chat";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * OS chat conversation list + create/delete mutations
 * (plans/07042026-alloro-os-admin-port P5 T3). Triad analog (§12.1):
 * api/admin-os-chat.ts → these hooks → QUERY_KEYS. Server state stays in React
 * Query (§15.1); mutations invalidate the list on success and toast on failure
 * (§16.3).
 */

const OS_CHAT_LIST_STALE_TIME_MS = 10_000;

export function useAdminOsConversations() {
  return useQuery<OsChatConversation[]>({
    queryKey: QUERY_KEYS.adminOsConversations,
    queryFn: adminOsListConversations,
    staleTime: OS_CHAT_LIST_STALE_TIME_MS,
  });
}

export function useCreateOsConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => adminOsCreateConversation(title),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsConversations,
      });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't start a conversation");
    },
  });
}

export function useDeleteOsConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      adminOsDeleteConversation(conversationId),
    onSuccess: (_data, conversationId) => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOsConversations,
      });
      queryClient.removeQueries({
        queryKey: QUERY_KEYS.adminOsConversation(conversationId),
      });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Couldn't delete the conversation");
    },
  });
}
