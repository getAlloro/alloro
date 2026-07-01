/**
 * Page auto-apply status — detects whether GEO generation created a newer
 * draft page version than the one currently loaded in the editor (see
 * applyGeoToPage in service.seo-generation.ts: GEO auto-apply always writes
 * a NEW draft version row, never bumps the live row in place). Reuses the
 * existing page-versions endpoint (fetchPageVersions) rather than adding a
 * new backend route — the version list already carries everything needed
 * (status, version number, created_at) to know a newer draft exists.
 */
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "../../lib/queryClient";
import { fetchPageVersions, type PageVersionSummary } from "../../api/websites";

export interface PageAutoApplyStatus {
  hasNewerDraft: boolean;
  latestDraft: PageVersionSummary | null;
}

export function usePageAutoApplyStatus(
  projectId: string,
  pageId: string,
  currentVersion: number,
) {
  return useQuery<PageAutoApplyStatus>({
    queryKey: QUERY_KEYS.adminPageVersions(projectId, pageId),
    queryFn: async () => {
      const res = await fetchPageVersions(projectId, pageId);
      const drafts = res.data.versions
        .filter((v) => v.status === "draft" && v.version > currentVersion)
        .sort((a, b) => b.version - a.version);
      return { hasNewerDraft: drafts.length > 0, latestDraft: drafts[0] ?? null };
    },
    enabled: !!projectId && !!pageId,
  });
}
