import { apiGet, apiPost, apiPatch, apiDelete, adminFetch } from "../index";
import type {
  ParentingSession,
  ParentingSessionDetails,
  SyncProposal,
} from "./types";

// ─── Parenting ──────────────────────────────────────────────────

export async function createParentingSession(
  mindId: string
): Promise<{ session: ParentingSession; greeting: string } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/parenting/sessions`,
  });
  return res.success ? res.data : null;
}

export async function listParentingSessions(
  mindId: string
): Promise<ParentingSession[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/parenting/sessions`,
  });
  return res.success ? res.data : [];
}

export async function getParentingSession(
  mindId: string,
  sessionId: string
): Promise<ParentingSessionDetails | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}`,
  });
  return res.success ? res.data : null;
}

export async function sendParentingChatStream(
  mindId: string,
  sessionId: string,
  message: string
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  // Streaming/SSE response — shared authed wrapper keeps the raw Response.
  return adminFetch(
    `${api}/admin/minds/${mindId}/parenting/sessions/${sessionId}/chat/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }
  );
}

export async function triggerParentingReadingStream(
  mindId: string,
  sessionId: string
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  // Streaming/SSE response — shared authed wrapper keeps the raw Response.
  return adminFetch(
    `${api}/admin/minds/${mindId}/parenting/sessions/${sessionId}/trigger-reading/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function updateParentingSession(
  mindId: string,
  sessionId: string,
  data: { title: string }
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}`,
    passedData: data,
  });
  return !!res.success;
}

export async function getParentingProposals(
  mindId: string,
  sessionId: string
): Promise<SyncProposal[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}/proposals`,
  });
  return res.success ? res.data : [];
}

export async function updateParentingProposal(
  mindId: string,
  sessionId: string,
  proposalId: string,
  status: "approved" | "rejected" | "pending"
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}/proposals/${proposalId}`,
    passedData: { status },
  });
  return !!res.success;
}

export async function startParentingCompile(
  mindId: string,
  sessionId: string
): Promise<{ runId: string; autoCompleted?: boolean } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}/compile`,
  });
  return res.success ? res.data : null;
}

export interface ParentingCompileStatus {
  sessionStatus?: string;
  run?: { status?: string } | null;
}

export async function getParentingCompileStatus(
  mindId: string,
  sessionId: string
): Promise<ParentingCompileStatus | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}/compile-status`,
  });
  return res.success ? (res.data as ParentingCompileStatus) : null;
}

export async function deleteParentingSession(
  mindId: string,
  sessionId: string
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}`,
  });
  return !!res.success;
}

export async function abandonParentingSession(
  mindId: string,
  sessionId: string
): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/parenting/sessions/${sessionId}/abandon`,
  });
  return !!res.success;
}
