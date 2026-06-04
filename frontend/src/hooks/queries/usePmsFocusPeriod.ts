import { useQuery } from "@tanstack/react-query";
import { fetchPmsKeyData, type PmsKeyDataResponse } from "../../api/pms";
import { QUERY_KEYS } from "../../lib/queryClient";
import {
  derivePmsFocusPeriod,
  type PmsFocusPeriod,
} from "../../utils/pmsFocusPeriod";

type PmsKeyData = NonNullable<PmsKeyDataResponse["data"]>;

async function fetchPmsFocusKeyData(
  orgId: number,
  locationId: number | null,
): Promise<PmsKeyData | null> {
  const response = await fetchPmsKeyData(orgId, locationId);
  if (!response?.success || !response.data) return null;
  return response.data;
}

export function usePmsFocusPeriod(
  orgId: number | null,
  locationId: number | null,
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
    queryFn: () => fetchPmsFocusKeyData(orgId!, locationId),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const currentDate = new Date();
  const period = derivePmsFocusPeriod(query.data?.months, currentDate);

  return {
    period,
    insightsStale: Boolean(query.data?.stats?.insightsStale),
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
  };
}
