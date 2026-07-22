import { useQuery } from "@tanstack/react-query";
import { fetchProofReceipt } from "../../api/proofReceipt";
import { QUERY_KEYS } from "../../lib/queryClient";
import type { ProofReceipt } from "../../types/proofReceipt";

/**
 * The owner-facing "what Alloro did for you" receipt. Mirrors useTopAction
 * (§14.3 — data-fetching in a hook, §15.1 — server state via React Query).
 * `enabled` lets a caller defer the fetch until it is actually shown.
 */
export function useProofReceipt(
  orgId: number | null,
  locationId: number | null,
  options?: { enabled?: boolean },
) {
  const query = useQuery<ProofReceipt>({
    queryKey: QUERY_KEYS.proofReceipt(orgId, locationId),
    queryFn: () => fetchProofReceipt(orgId!, locationId),
    enabled: orgId !== null && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
  return {
    receipt: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
  };
}
