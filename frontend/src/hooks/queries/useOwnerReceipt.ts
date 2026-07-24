import { useQuery } from "@tanstack/react-query";
import {
  getOwnerReceipt,
  type OwnerReceipt,
  type OwnerReceiptWindows,
} from "../../api/ownerReceipt";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * The owner-facing Owner Receipt for one org over two dated windows. Mirrors
 * useProofReceipt (§14.3 — data-fetching in a hook, §15.1 — server state via
 * React Query). `enabled` lets a caller defer the fetch until it is actually
 * shown; the query is also disabled until an org id and both windows exist.
 */
export function useOwnerReceipt(
  orgId: number | null,
  windows: OwnerReceiptWindows | null,
  locationId: number | null,
  options?: { enabled?: boolean; page?: number; limit?: number },
) {
  const hasWindows =
    windows !== null &&
    !!windows.preStart &&
    !!windows.preEnd &&
    !!windows.postStart &&
    !!windows.postEnd;

  const query = useQuery<OwnerReceipt>({
    queryKey: QUERY_KEYS.ownerReceipt(
      orgId,
      windows?.preStart ?? "",
      windows?.preEnd ?? "",
      windows?.postStart ?? "",
      windows?.postEnd ?? "",
      locationId,
      options?.page,
      options?.limit,
    ),
    queryFn: () =>
      getOwnerReceipt(windows!, locationId, {
        page: options?.page,
        limit: options?.limit,
      }),
    enabled: orgId !== null && hasWindows && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });

  return {
    receipt: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
  };
}
