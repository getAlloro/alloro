import { apiGet, apiPost, apiPatch, apiDelete } from "../index";
import type {
  MindSource,
  DiscoveryBatch,
  DiscoveredPost,
  SyncRun,
  SyncRunDetails,
  SyncProposal,
} from "./types";

// ─── Sources ─────────────────────────────────────────────────────

export async function listSources(mindId: string): Promise<MindSource[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/sources` });
  return res.success ? res.data : [];
}

export async function createSource(
  mindId: string,
  url: string,
  name?: string
): Promise<MindSource | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/sources`,
    passedData: { url, name },
  });
  return res.success ? res.data : null;
}

export async function deleteSource(mindId: string, sourceId: string): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/sources/${sourceId}`,
  });
  return !!res.success;
}

export async function toggleSource(
  mindId: string,
  sourceId: string,
  isActive: boolean
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/sources/${sourceId}`,
    passedData: { is_active: isActive },
  });
  return !!res.success;
}

// ─── Discovery ───────────────────────────────────────────────────

export async function getDiscoveryBatch(
  mindId: string
): Promise<{ batch: DiscoveryBatch | null; posts: DiscoveredPost[] }> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/discovery-batch` });
  return res.success ? res.data : { batch: null, posts: [] };
}

export async function updatePostStatus(
  mindId: string,
  postId: string,
  status: "pending" | "approved" | "ignored"
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/discovered-posts/${postId}`,
    passedData: { status },
  });
  return !!res.success;
}

export async function triggerDiscovery(mindId: string): Promise<boolean> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/discovery/run`,
  });
  return !!res.success;
}

export async function deleteDiscoveryBatch(
  mindId: string,
  batchId: string
): Promise<boolean> {
  const res = await apiDelete({
    path: `/admin/minds/${mindId}/discovery-batch/${batchId}`,
  });
  return !!res.success;
}

// ─── Sync Runs ───────────────────────────────────────────────────

export async function startScrapeCompare(mindId: string): Promise<string | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/sync-runs/scrape-compare`,
  });
  return res.success ? res.data.runId : null;
}

export async function startCompilePublish(mindId: string): Promise<string | null> {
  const res = await apiPost({
    path: `/admin/minds/${mindId}/sync-runs/compile`,
  });
  return res.success ? res.data.runId : null;
}

export async function listSyncRuns(mindId: string): Promise<SyncRun[]> {
  const res = await apiGet({ path: `/admin/minds/${mindId}/sync-runs` });
  return res.success ? res.data : [];
}

export async function getSyncRun(mindId: string, runId: string): Promise<SyncRunDetails | null> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/sync-runs/${runId}`,
  });
  return res.success ? res.data : null;
}

export async function getRunProposals(mindId: string, runId: string): Promise<SyncProposal[]> {
  const res = await apiGet({
    path: `/admin/minds/${mindId}/sync-runs/${runId}/proposals`,
  });
  return res.success ? res.data : [];
}

// ─── Proposals ───────────────────────────────────────────────────

export async function updateProposalStatus(
  mindId: string,
  proposalId: string,
  status: "approved" | "rejected" | "pending"
): Promise<boolean> {
  const res = await apiPatch({
    path: `/admin/minds/${mindId}/proposals/${proposalId}`,
    passedData: { status },
  });
  return !!res.success;
}
