import { apiGet, apiPost, apiDelete, adminFetch, unwrap } from "./index";

/**
 * Admin OS chat — API module (plans/07042026-alloro-os-admin-port, P5 T3).
 * Conversation + context CRUD ride the shared client in api/index.ts (§12.1,
 * §14.2) and unwrap the §8.1 envelope; the ONE sanctioned non-envelope path is
 * the SSE message stream, which reaches for the shared authed `adminFetch`
 * wrapper (JWT via getCommonHeaders — the §14.2 exception mirroring
 * api/minds/chat.ts, §17.5 single JWT path) and returns the raw Response so we
 * keep stream control. Analogs: admin-os.ts (CRUD) + api/minds/chat.ts (stream).
 */

const api = import.meta.env.VITE_API_URL ?? "/api";

export type OsChatRole = "user" | "assistant";

/**
 * A citation on an assistant message — the retrieval-hit projection, built
 * server-side (never from model output). chunk_index is null for a whole-
 * document (manual attachment) citation; heading_path is the human label.
 */
export type OsChatCitation = {
  document_id: string;
  version_no: number;
  chunk_index: number | null;
  heading_path: string | null;
};

export type OsChatMessage = {
  id: string;
  conversation_id: string;
  role: OsChatRole;
  content: string;
  citations: OsChatCitation[];
  created_at: string;
};

export type OsChatConversation = {
  id: string;
  user_id: number;
  title: string | null;
  created_at: string;
  /** Newest message time, falling back to created_at — drives ordering + time. */
  last_activity_at: string;
  message_count: number;
  last_message_preview: string | null;
};

/** Grounding context pinned to a conversation — resolved to a title client-side. */
export type OsChatContextDocument = {
  conversation_id: string;
  document_id: string;
  origin: "manual" | "ai";
};

export type OsChatConversationDetail = {
  messages: OsChatMessage[];
  context: OsChatContextDocument[];
};

// ── Conversations ────────────────────────────────────────────────────────────

export async function adminOsListConversations(): Promise<OsChatConversation[]> {
  const data = unwrap<{ conversations: OsChatConversation[] }>(
    await apiGet({ path: "/admin/os/chat/conversations" }),
  );
  return data.conversations;
}

export async function adminOsCreateConversation(
  title?: string,
): Promise<OsChatConversation> {
  const data = unwrap<{ conversation: OsChatConversation }>(
    await apiPost({
      path: "/admin/os/chat/conversations",
      passedData: title ? { title } : {},
    }),
  );
  return data.conversation;
}

export async function adminOsGetConversation(
  conversationId: string,
): Promise<OsChatConversationDetail> {
  return unwrap(
    await apiGet({ path: `/admin/os/chat/conversations/${conversationId}` }),
  );
}

export async function adminOsDeleteConversation(
  conversationId: string,
): Promise<{ deleted: true }> {
  return unwrap(
    await apiDelete({ path: `/admin/os/chat/conversations/${conversationId}` }),
  );
}

// ── Attached context ─────────────────────────────────────────────────────────

export async function adminOsAttachContext(
  conversationId: string,
  documentId: string,
): Promise<{ attached: true }> {
  return unwrap(
    await apiPost({
      path: `/admin/os/chat/conversations/${conversationId}/context/${documentId}`,
    }),
  );
}

export async function adminOsDetachContext(
  conversationId: string,
  documentId: string,
): Promise<{ detached: true }> {
  return unwrap(
    await apiDelete({
      path: `/admin/os/chat/conversations/${conversationId}/context/${documentId}`,
    }),
  );
}

// ── Streaming send (SSE) ─────────────────────────────────────────────────────

export type OsChatStreamDone = {
  message_id: string;
  citations: OsChatCitation[];
};

export type OsChatStreamHandlers = {
  onStatus?: (status: string) => void;
  onDelta: (delta: string) => void;
  onDone: (evt: OsChatStreamDone) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};

/**
 * POST /chat/conversations/:id/messages responds `text/event-stream`, NOT the
 * JSON envelope. Body field is `message`. The stream is optional
 * `data: {"status":…}` progress lines, then many `data: {"delta":…}` lines,
 * then one `data: {"done":true,"message_id","citations"}`; a mid-stream failure
 * arrives as `data: {"error":…,"message":…}`. Buffered line parse handles events
 * split across read chunks. Aborting via `signal` cancels cleanly. Errors reject
 * (or fire onError) so the caller can roll back the optimistic turn (§16.1/§16.2).
 */
export async function streamOsChatMessage(
  conversationId: string,
  content: string,
  { onStatus, onDelta, onDone, onError, signal }: OsChatStreamHandlers,
): Promise<void> {
  const res = await adminFetch(
    `${api}/admin/os/chat/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: content }),
      signal,
    },
  );
  if (!res.ok || !res.body) {
    const message = "The assistant could not be reached. Please try again.";
    onError?.(message);
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last (possibly partial) line in the buffer until its newline.
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      const evt = JSON.parse(payload) as {
        status?: string;
        delta?: string;
        done?: boolean;
        message_id?: string;
        citations?: OsChatCitation[];
        error?: string;
        message?: string;
      };
      if (evt.error) {
        // Human message carries the SSE busy/failed copy; fall back to the code.
        const message = String(evt.message ?? evt.error);
        onError?.(message);
        throw new Error(message);
      }
      if (evt.status) {
        onStatus?.(evt.status);
      } else if (evt.done) {
        onDone({
          message_id: String(evt.message_id ?? ""),
          citations: evt.citations ?? [],
        });
      } else if (evt.delta !== undefined) {
        onDelta(evt.delta);
      }
    }
  }
}
