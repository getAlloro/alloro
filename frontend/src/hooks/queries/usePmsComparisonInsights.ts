import { useMutation } from "@tanstack/react-query";
import {
  generateComparisonInsights,
  type ComparisonInsightsResponse,
} from "../../api/pms";

type ComparisonInsightsData = NonNullable<ComparisonInsightsResponse["data"]>;

export interface GenerateComparisonInsightsVars {
  monthA: string;
  monthB: string;
}

/**
 * Mutation: generate a Claude Haiku paragraph comparing two months of referral
 * data. The shared API client returns the { success, data, error } envelope and
 * never throws, so we throw here on a failure shape to give React Query proper
 * isError/error semantics for the modal's inline error state.
 */
export function useGenerateComparisonInsights(locationId: number | null) {
  return useMutation<
    ComparisonInsightsData,
    Error,
    GenerateComparisonInsightsVars
  >({
    mutationFn: async ({ monthA, monthB }) => {
      const res = await generateComparisonInsights(locationId, monthA, monthB);
      if (!res.success || !res.data) {
        throw new Error(
          res.message || res.error || "Couldn't generate comparison insights."
        );
      }
      return res.data;
    },
  });
}
