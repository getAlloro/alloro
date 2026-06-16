import { apiGet, apiPost, apiPatch, apiDelete, adminFetch } from "../index";
import type { MindMessage, MindConversation } from "./types";

// ─── Chat ────────────────────────────────────────────────────────

export async function sendChatMessage(
  mindId: string,
  message: string,
  conversationId?: string
): Promise<{ conversationId: string; reply: string } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/chat`,
    passedData: { message, conversationId },
  });
  return res.success ? res.data : null;
}

export async function sendChatMessageStream(
  mindId: string,
  message: string,
  conversationId?: string
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  // Streaming/SSE response — go through the shared authed wrapper (it attaches the
  // JWT via getCommonHeaders and returns the raw Response so we keep stream control).
  return adminFetch(`${api}/admin/minds/${mindId}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversationId }),
  });
}

export async function getConversation(
  mindId: string,
  conversationId: string
): Promise<MindMessage[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/conversations/${conversationId}`,
  });
  return res.success ? res.data : [];
}

export async function listConversations(mindId: string): Promise<MindConversation[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/conversations` });
  return res.success ? res.data : [];
}

export async function renameConversation(mindId: string, conversationId: string, title: string): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/conversations/${conversationId}`,
    passedData: { title },
  });
  return !!res.success;
}

export async function deleteConversation(mindId: string, conversationId: string): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/conversations/${conversationId}`,
  });
  return !!res.success;
}
