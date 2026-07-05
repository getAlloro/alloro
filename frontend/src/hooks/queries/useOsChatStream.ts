import { useCallback, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  streamOsChatMessage,
  type OsChatCitation,
  type OsChatConversationDetail,
  type OsChatMessage,
} from "../../api/admin-os-chat";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * Owns one OS conversation's send lifecycle (plans/07042026-alloro-os-admin-port
 * P5 T3): an optimistic user turn + a live assistant turn seeded into the
 * conversation cache, the SSE stream accumulating deltas into that assistant
 * turn, finalize with server-built citations, rollback on failure/abort, and a
 * list invalidation on done so the sidebar's preview/time update. isStreaming +
 * status are ephemeral request state — useState is correct here, not React Query
 * (§15.1). The thread reads live from the same cache key the stream writes into.
 */

let uid = 0;
const tempId = (prefix: string): string =>
  `tmp-${prefix}-${Date.now()}-${uid++}`;

function emptyDetail(): OsChatConversationDetail {
  return { messages: [], context: [] };
}

/** Optimistic user turn + an empty assistant turn (the thinking placeholder). */
function seedTurn(
  queryClient: QueryClient,
  conversationId: string,
  userId: string,
  assistantId: string,
  content: string,
): void {
  queryClient.setQueryData<OsChatConversationDetail>(
    QUERY_KEYS.adminOsConversation(conversationId),
    (prev) => {
      const base = prev ?? emptyDetail();
      const now = new Date().toISOString();
      const userMessage: OsChatMessage = {
        id: userId,
        conversation_id: conversationId,
        role: "user",
        content,
        citations: [],
        created_at: now,
      };
      const assistantMessage: OsChatMessage = {
        id: assistantId,
        conversation_id: conversationId,
        role: "assistant",
        content: "",
        citations: [],
        created_at: now,
      };
      return {
        ...base,
        messages: [...base.messages, userMessage, assistantMessage],
      };
    },
  );
}

function appendDelta(
  queryClient: QueryClient,
  conversationId: string,
  assistantId: string,
  delta: string,
): void {
  queryClient.setQueryData<OsChatConversationDetail>(
    QUERY_KEYS.adminOsConversation(conversationId),
    (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.map((message) =>
          message.id === assistantId
            ? { ...message, content: message.content + delta }
            : message,
        ),
      };
    },
  );
}

function finalizeTurn(
  queryClient: QueryClient,
  conversationId: string,
  assistantId: string,
  messageId: string,
  citations: OsChatCitation[],
): void {
  queryClient.setQueryData<OsChatConversationDetail>(
    QUERY_KEYS.adminOsConversation(conversationId),
    (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.map((message) =>
          message.id === assistantId
            ? { ...message, id: messageId || message.id, citations }
            : message,
        ),
      };
    },
  );
}

/** Remove both optimistic turns — the send failed or was cancelled. */
function rollbackTurn(
  queryClient: QueryClient,
  conversationId: string,
  userId: string,
  assistantId: string,
): void {
  queryClient.setQueryData<OsChatConversationDetail>(
    QUERY_KEYS.adminOsConversation(conversationId),
    (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        messages: prev.messages.filter(
          (message) => message.id !== userId && message.id !== assistantId,
        ),
      };
    },
  );
}

export function useOsChatStream(conversationId: string | null) {
  const queryClient = useQueryClient();
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const send = useCallback(
    async (rawContent: string) => {
      const content = rawContent.trim();
      if (!conversationId || !content || isStreaming) return;
      const userId = tempId("user");
      const assistantId = tempId("assistant");
      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);
      setStatus(null);
      seedTurn(queryClient, conversationId, userId, assistantId, content);
      try {
        await streamOsChatMessage(conversationId, content, {
          signal: controller.signal,
          onStatus: (next) => setStatus(next),
          onDelta: (delta) =>
            appendDelta(queryClient, conversationId, assistantId, delta),
          onDone: (evt) =>
            finalizeTurn(
              queryClient,
              conversationId,
              assistantId,
              evt.message_id,
              evt.citations,
            ),
        });
        void queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.adminOsConversations,
        });
      } catch (error) {
        rollbackTurn(queryClient, conversationId, userId, assistantId);
        if (!controller.signal.aborted) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not reach the assistant.",
          );
        }
      } finally {
        setIsStreaming(false);
        setStatus(null);
        abortRef.current = null;
      }
    },
    [conversationId, isStreaming, queryClient],
  );

  return { send, cancel, isStreaming, status };
}
