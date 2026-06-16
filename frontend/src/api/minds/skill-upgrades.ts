import { apiGet, apiPost, apiPatch, apiDelete, adminFetch } from "../index";
import type {
  SkillUpgradeSession,
  SkillUpgradeSessionDetails,
  SyncProposal,
} from "./types";

// ─── Skill Upgrade Sessions ─────────────────────────────────────

export async function createSkillUpgradeSession(
  mindId: string,
  skillId: string
): Promise<{ session: SkillUpgradeSession; greeting: string } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions`,
  });
  return res.success ? res.data : null;
}

export async function listSkillUpgradeSessions(
  mindId: string,
  skillId: string
): Promise<SkillUpgradeSession[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions`,
  });
  return res.success ? res.data : [];
}

export async function getSkillUpgradeSession(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<SkillUpgradeSessionDetails | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}`,
  });
  return res.success ? res.data : null;
}

export async function sendSkillUpgradeChatStream(
  mindId: string,
  skillId: string,
  sessionId: string,
  message: string
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  // Streaming/SSE response — shared authed wrapper keeps the raw Response.
  return adminFetch(
    `${api}/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/chat/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }
  );
}

export async function triggerSkillUpgradeReadingStream(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  // Streaming/SSE response — shared authed wrapper keeps the raw Response.
  return adminFetch(
    `${api}/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/trigger-reading/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function getSkillUpgradeProposals(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<SyncProposal[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/proposals`,
  });
  return res.success ? res.data : [];
}

export async function updateSkillUpgradeProposal(
  mindId: string,
  skillId: string,
  sessionId: string,
  proposalId: string,
  status: "approved" | "rejected" | "pending"
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/proposals/${proposalId}`,
    passedData: { status },
  });
  return !!res.success;
}

export async function startSkillUpgradeCompile(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<{ success: boolean } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/compile`,
  });
  return res.success ? res.data : null;
}

export interface SkillUpgradeCompileStatus {
  status?: string;
}

export async function getSkillUpgradeCompileStatus(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<SkillUpgradeCompileStatus | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/compile-status`,
  });
  return res.success ? (res.data as SkillUpgradeCompileStatus) : null;
}

export async function deleteSkillUpgradeSession(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}`,
  });
  return !!res.success;
}

export async function abandonSkillUpgradeSession(
  mindId: string,
  skillId: string,
  sessionId: string
): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}/abandon`,
  });
  return !!res.success;
}

export async function updateSkillUpgradeSession(
  mindId: string,
  skillId: string,
  sessionId: string,
  data: { title: string }
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/skills/${skillId}/upgrade/sessions/${sessionId}`,
    passedData: data,
  });
  return !!res.success;
}
