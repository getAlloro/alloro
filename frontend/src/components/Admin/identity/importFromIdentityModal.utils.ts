/**
 * ImportFromIdentityModal — pure utilities
 *
 * Extracted verbatim from ImportFromIdentityModal.tsx (no behavior change).
 * These helpers carry no React/hook state: they summarize/merge per-entry
 * import results and poll a single job to completion.
 */

import {
  fetchPostImportStatus,
  type PostImportEntryResult,
  type PostImportProgress,
  type PostImportResultSummary,
} from "../../../api/websites";

export const EMPTY_SUMMARY: PostImportResultSummary = {
  total: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  results: [],
};

export function summarizeFromResults(
  results: PostImportEntryResult[],
): PostImportResultSummary {
  return {
    total: results.length,
    created: results.filter((r) => r.status === "created").length,
    updated: results.filter((r) => r.status === "updated").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

export function mergeProgress(
  a: PostImportProgress,
  b: PostImportProgress,
): PostImportProgress {
  const map = new Map<string, PostImportEntryResult>();
  for (const r of a.results || []) map.set(r.key, r);
  for (const r of b.results || []) map.set(r.key, r);
  return {
    total: (a.total || 0) + (b.total || 0),
    completed: (a.completed || 0) + (b.completed || 0),
    results: Array.from(map.values()),
  };
}

export function mergeSummary(
  a: PostImportResultSummary | null,
  b: PostImportResultSummary | null,
): PostImportResultSummary | null {
  if (!a && !b) return null;
  const left = a || EMPTY_SUMMARY;
  const right = b || EMPTY_SUMMARY;
  const map = new Map<string, PostImportEntryResult>();
  for (const r of left.results) map.set(r.key, r);
  for (const r of right.results) map.set(r.key, r);
  return summarizeFromResults(Array.from(map.values()));
}

export async function pollUntilDone(
  projectId: string,
  jobId: string,
  intervalMs: number,
): Promise<{
  state: string;
  summary: PostImportResultSummary | null;
}> {
  // Cap at 5 minutes for a single retry so a stuck job doesn't hang the UI.
  const start = Date.now();
  while (Date.now() - start < 5 * 60_000) {
    const res = await fetchPostImportStatus(projectId, jobId);
    if (res.data.state === "completed" || res.data.state === "failed") {
      return { state: res.data.state, summary: res.data.summary };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { state: "stuck", summary: null };
}
