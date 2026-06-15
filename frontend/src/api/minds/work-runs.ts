import { apiGet, apiPost, apiPut, apiDelete } from "../index";
import type { SkillWorkRun, PublishChannel } from "./types";

// ─── Work Runs ──────────────────────────────────────────────────

export async function triggerManualRun(
  mindId: string,
  skillId: string,
): Promise<SkillWorkRun | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/run`,
  });
  return res?.id ? res : null;
}

export async function listWorkRuns(
  mindId: string,
  skillId: string,
  limit = 50,
  offset = 0,
): Promise<SkillWorkRun[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/work-runs?limit=${limit}&offset=${offset}`,
  });
  return Array.isArray(res) ? res : [];
}

export async function getWorkRun(
  mindId: string,
  skillId: string,
  workRunId: string,
): Promise<SkillWorkRun | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/skills/${skillId}/work-runs/${workRunId}`,
  });
  return res?.id ? res : null;
}

export async function approveWorkRun(
  mindId: string,
  skillId: string,
  workRunId: string,
): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/work-runs/${workRunId}/approve`,
  });
  return !!res.success;
}

export async function rejectWorkRun(
  mindId: string,
  skillId: string,
  workRunId: string,
  rejectionCategory?: string,
  rejectionReason?: string,
): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/skills/${skillId}/work-runs/${workRunId}/reject`,
    passedData: {
      rejection_category: rejectionCategory,
      rejection_reason: rejectionReason,
    },
  });
  return !!res.success;
}

export async function deleteWorkRun(
  mindId: string,
  skillId: string,
  workRunId: string,
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/skills/${skillId}/work-runs/${workRunId}`,
  });
  return !!res.success;
}

// ─── Publish Channels ────────────────────────────────────────────

export async function listPublishChannels(): Promise<PublishChannel[]> {
  const res = await apiGet({
    path: `/admin/minds/publish-channels`,
  });
  return Array.isArray(res) ? res : [];
}

export async function createPublishChannel(
  data: { name: string; webhook_url: string; description?: string },
): Promise<PublishChannel | null> {
  const res = await apiPost({
    path: `/admin/minds/publish-channels`,
    passedData: data,
  });
  return res?.id ? res : null;
}

export async function updatePublishChannel(
  channelId: string,
  data: { name?: string; webhook_url?: string; description?: string; status?: string },
): Promise<PublishChannel | null> {
  const res = await apiPut({
    path: `/admin/minds/publish-channels/${channelId}`,
    passedData: data,
  });
  return res?.id ? res : null;
}

export async function deletePublishChannel(
  channelId: string,
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/publish-channels/${channelId}`,
  });
  return !!res.success;
}
