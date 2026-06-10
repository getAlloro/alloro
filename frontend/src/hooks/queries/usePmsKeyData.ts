import { useQuery } from "@tanstack/react-query";
import { fetchPmsKeyData, type PmsKeyDataResponse } from "../../api/pms";

/**
 * usePmsKeyData — shared TanStack Query hook for the PMS key-data payload
 * (12-month `months[]` series + ranked `sources[]`).
 *
 * Extracted from the inline copy that previously lived in
 * `components/dashboard/focus/PMSCard.tsx` so the simplified Practice Hub's
 * ProductionPanel and stat-card row share ONE network request (same
 * queryKey → React Query dedupes).
 *
 * Spec: plans/06092026-practice-hub-simplification/spec.html (T3)
 */
export type PmsKeyData = NonNullable<PmsKeyDataResponse["data"]>;

async function fetchPmsKeyDataInner(
  orgId: number | null,
  locationId: number | null,
): Promise<PmsKeyData | null> {
  const response = await fetchPmsKeyData(orgId ?? undefined, locationId);
  if (!response?.success || !response.data) {
    if (response?.error || response?.message) {
      throw new Error(
        response.error || response.message || "Failed to load PMS data",
      );
    }
    return null;
  }
  return response.data;
}

export function usePmsKeyData(orgId: number | null, locationId: number | null) {
  return useQuery<PmsKeyData | null>({
    queryKey: ["pmsKeyData", orgId, locationId],
    queryFn: () => fetchPmsKeyDataInner(orgId, locationId),
    enabled: !!orgId && locationId != null,
    staleTime: 5 * 60 * 1000,
  });
}
