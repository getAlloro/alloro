import { apiGet, apiPost, apiPut, apiDelete, adminFetch } from "../index";
import type {
  MindSkill,
  MindSkillNeuron,
  SkillAnalytics,
  WorkCreationType,
  TriggerType,
  PipelineMode,
  SkillStatus,
  SkillBuilderMessage,
  ResolvedFields,
  SkillBuilderResponse,
} from "./types";

// ─── Skills ─────────────────────────────────────────────────────

export async function listSkills(mindId: string): Promise<MindSkill[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/skills` });
  return res.success ? res.data : [];
}

export async function getSkill(
  mindId: string,
  skillId: string,
): Promise<MindSkill | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}`,
  });
  return res.success ? res.data : null;
}

export async function createSkill(
  mindId: string,
  name: string,
  definition: string,
  outputSchema: object | null,
): Promise<MindSkill | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills`,
    passedData: { name, definition, outputSchema },
  });
  return res.success ? res.data : null;
}

export async function updateSkill(
  mindId: string,
  skillId: string,
  fields: {
    name?: string;
    definition?: string;
    outputSchema?: object | null;
    work_creation_type?: WorkCreationType | null;
    artifact_attachment_type?: WorkCreationType | null;
    output_count?: number;
    trigger_type?: TriggerType;
    trigger_config?: { day?: string; time?: string; timezone?: string };
    pipeline_mode?: PipelineMode;
    publish_channel_id?: string | null;
    status?: SkillStatus;
  },
): Promise<MindSkill | null> {
  const res = await apiPut({
    path: `/admin/minds/${mindId}/skills/${skillId}`,
    passedData: fields,
  });
  return res.success ? res.data : null;
}

export async function deleteSkill(
  mindId: string,
  skillId: string,
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/skills/${skillId}`,
  });
  return !!res.success;
}

export async function generateSkillNeuron(
  mindId: string,
  skillId: string,
): Promise<MindSkillNeuron | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/generate`,
  });
  return res.success ? res.data : null;
}

export async function getSkillNeuron(
  mindId: string,
  skillId: string,
): Promise<MindSkillNeuron | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/neuron`,
  });
  return res.success ? res.data : null;
}

export async function getSkillAnalytics(
  mindId: string,
  skillId: string,
): Promise<SkillAnalytics> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/analytics`,
  });
  return res.success
    ? res.data
    : { totalCalls: 0, callsToday: 0, dailyCounts: [] };
}

export async function regenerateStaleNeurons(
  mindId: string,
): Promise<{ regeneratedCount: number; failedCount: number; errors: string[] }> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/regenerate-stale`,
  });
  return res.success
    ? res.data
    : { regeneratedCount: 0, failedCount: 0, errors: [] };
}

export async function suggestSkillDefinition(
  mindId: string,
  hint: string,
): Promise<{ definition: string; outputSchema: object | null } | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/suggest`,
    passedData: { hint },
  });
  return res.success ? res.data : null;
}

// ─── Skill Builder ──────────────────────────────────────────────

export async function skillBuilderChat(
  mindId: string,
  message: string,
  messages: SkillBuilderMessage[],
  resolvedFields: ResolvedFields,
): Promise<SkillBuilderResponse | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skill-builder/chat`,
    passedData: { message, messages, resolvedFields },
  });
  return res.success ? res.data : null;
}

export async function sendSkillBuilderChatStream(
  mindId: string,
  message: string,
  messages: SkillBuilderMessage[],
  resolvedFields: ResolvedFields,
): Promise<Response> {
  const api = import.meta.env.VITE_API_URL ?? "/api";

  // Streaming/SSE response — shared authed wrapper keeps the raw Response.
  return adminFetch(`${api}/admin/minds/${mindId}/skill-builder/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, messages, resolvedFields }),
  });
}
