import { apiGet, apiPost, apiPut, apiDelete } from "../index";
import type { Mind, MindWithVersion, MindVersion, MindStatus, SyncRun } from "./types";

// ─── Mind CRUD ───────────────────────────────────────────────────

export async function listMinds(): Promise<Mind[]> {
  const res = await apiGet({ path: "/admin/minds" });
  return res.success ? res.data : [];
}

export async function getMind(mindId: string): Promise<MindWithVersion | null> {
  const res = await apiGet({ path: `/admin/minds/${mindId}` });
  return res.success ? res.data : null;
}

export async function createMind(name: string, personalityPrompt: string): Promise<Mind | null> {
  const res = await apiPost({
    path: "/admin/minds",
    passedData: { name, personality_prompt: personalityPrompt },
  });
  return res.success ? res.data : null;
}

export async function updateMind(
  mindId: string,
  updates: {
    name?: string;
    personality_prompt?: string;
    available_work_types?: string[];
    available_publish_targets?: string[];
    rejection_categories?: string[];
  }
): Promise<Mind | null> {
  const res = await apiPut({
    path: `/admin/minds/${mindId}`,
    passedData: updates,
  });
  return res.success ? res.data : null;
}

export async function updateBrain(
  mindId: string,
  brainMarkdown: string
): Promise<{ version: MindVersion; warning?: string } | null> {
  const res = await apiPut({
    path: `/admin/minds/${mindId}/brain`,
    passedData: { brain_markdown: brainMarkdown },
  });
  return res.success ? res.data : null;
}

export async function listVersions(mindId: string): Promise<MindVersion[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/versions` });
  return res.success ? res.data : [];
}

export async function publishVersion(mindId: string, versionId: string): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/versions/${versionId}/publish`,
  });
  return !!res.success;
}

export async function deleteMind(mindId: string): Promise<boolean> {
  const res = await apiDelete({ path: `/admin/minds/${mindId}` });
  return !!res.success;
}

// ─── Status ──────────────────────────────────────────────────────

export async function listSyncRunsByBatch(
  mindId: string,
  batchId: string
): Promise<SyncRun[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/batches/${batchId}/sync-runs`,
  });
  return res.success ? res.data : [];
}

export async function getMindStatus(mindId: string): Promise<MindStatus> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/status` });
  return res.success
    ? res.data
    : {
        canStartScrape: false,
        canCompile: false,
        scrapeBlockingReasons: [],
        compileBlockingReasons: [],
        openBatchId: null,
        activeSyncRunId: null,
        activeSyncRunType: null,
        latestScrapeRunId: null,
      };
}
