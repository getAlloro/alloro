import { useQuery } from "@tanstack/react-query";
import { fetchPmsKeyData, type PmsKeyDataResponse } from "../../api/pms";
import { QUERY_KEYS } from "../../lib/queryClient";
import {
  derivePmsFocusPeriod,
  type PmsFocusPeriod,
  type PmsFocusPeriodCopy,
} from "../../utils/pmsFocusPeriod";

type PmsKeyData = NonNullable<PmsKeyDataResponse["data"]>;

async function fetchPmsFocusKeyData(
  locationId: number | null,
): Promise<PmsKeyData | null> {
  // orgId is no longer sent — the server derives the tenant from the JWT (§5.5).
  const response = await fetchPmsKeyData({ locationId });
  if (!response?.success || !response.data) return null;
  return response.data;
}

export function usePmsFocusPeriod(
  orgId: number | null,
  locationId: number | null,
  copy?: PmsFocusPeriodCopy,
): {
  period: PmsFocusPeriod;
  /** Server-computed: PMS data was edited/deleted after the last completed run. */
  insightsStale: boolean;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const query = useQuery<PmsKeyData | null>({
    queryKey: QUERY_KEYS.pmsFocusPeriod(orgId, locationId),
    queryFn: () => fetchPmsFocusKeyData(locationId),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const currentDate = new Date();
  const period = derivePmsFocusPeriod(query.data?.months, currentDate, copy);

  return {
    period,
    insightsStale: Boolean(query.data?.stats?.insightsStale),
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
  };
}
