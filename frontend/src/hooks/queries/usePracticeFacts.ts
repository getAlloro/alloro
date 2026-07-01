/**
 * Practice Facts — source-traceable provenance for GEO/SEO generation.
 *
 * Extraction runs as a background job (POST .../seo/facts enqueues the
 * extractPracticeFacts BullMQ worker — see SeoController.extractPageFacts /
 * extractPostFacts). There is no per-job status endpoint exposed for this
 * worker (unlike bulk-generate's /seo/bulk-generate/:jobId/status), so this
 * polls the existing list endpoint on a bounded backoff schedule rather than
 * a status route that doesn't exist. A single fixed delay was tried first
 * but real LLM latency (~15-20s observed) is well past a "low single-digit
 * seconds" assumption, so a lone 6s refetch left the UI stuck on "No facts
 * extracted yet" until a manual reload — polling until data appears (or the
 * bound is hit) is what actually matches observed behavior.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../../lib/queryClient";
import { showErrorToast, showSuccessToast } from "../../lib/toast";
import { getErrorMessage } from "../../lib/errorMessage";
import {
  extractPageFacts,
  extractPostFacts,
  listPageFacts,
  listPostFacts,
  type PracticeFact,
} from "../../api/websites";

// Bounded backoff schedule (~41s total) — stops early as soon as facts show
// up, so this is a ceiling on wait time, not a fixed delay.
const POLL_DELAYS_MS = [4000, 4000, 4000, 4000, 5000, 5000, 5000, 5000, 5000];

async function pollUntilFactsAppear<TArgs extends unknown[]>(
  fetchFacts: (...args: TArgs) => Promise<PracticeFact[]>,
  args: TArgs
): Promise<PracticeFact[] | null> {
  for (const delay of POLL_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const facts = await fetchFacts(...args);
      if (facts.length > 0) return facts;
    } catch {
      // A single transient failure (network blip, momentary 5xx) must not
      // abort the whole poll — keep trying on the remaining schedule and
      // let the caller's final invalidateQueries be the fallback.
    }
  }
  return null;
}

export function usePageFacts(projectId: string, pageId: string) {
  return useQuery<PracticeFact[]>({
    queryKey: QUERY_KEYS.adminPageFacts(projectId, pageId),
    queryFn: async () => (await listPageFacts(projectId, pageId)).data,
    enabled: !!projectId && !!pageId,
  });
}

export function usePostFacts(projectId: string, postId: string) {
  return useQuery<PracticeFact[]>({
    queryKey: QUERY_KEYS.adminPostFacts(projectId, postId),
    queryFn: async () => (await listPostFacts(projectId, postId)).data,
    enabled: !!projectId && !!postId,
  });
}

export function useExtractPageFacts(projectId: string, pageId: string) {
  const qc = useQueryClient();
  const queryKey = QUERY_KEYS.adminPageFacts(projectId, pageId);

  return useMutation({
    mutationFn: (pageContent: string) => extractPageFacts(projectId, pageId, pageContent),
    onSuccess: async () => {
      showSuccessToast("Extracting practice facts", "Source-traceable facts will appear shortly.");
      const facts = await pollUntilFactsAppear(
        async (pid: string, pgId: string) => (await listPageFacts(pid, pgId)).data,
        [projectId, pageId]
      );
      if (facts) qc.setQueryData(queryKey, facts);
      else qc.invalidateQueries({ queryKey });
    },
    onError: (err: unknown) => {
      showErrorToast("Fact extraction failed", getErrorMessage(err) || "Please try again.");
    },
  });
}

export function useExtractPostFacts(projectId: string, postId: string) {
  const qc = useQueryClient();
  const queryKey = QUERY_KEYS.adminPostFacts(projectId, postId);

  return useMutation({
    mutationFn: () => extractPostFacts(projectId, postId),
    onSuccess: async () => {
      showSuccessToast("Extracting practice facts", "Source-traceable facts will appear shortly.");
      const facts = await pollUntilFactsAppear(
        async (pid: string, pId: string) => (await listPostFacts(pid, pId)).data,
        [projectId, postId]
      );
      if (facts) qc.setQueryData(queryKey, facts);
      else qc.invalidateQueries({ queryKey });
    },
    onError: (err: unknown) => {
      showErrorToast("Fact extraction failed", getErrorMessage(err) || "Please try again.");
    },
  });
}
