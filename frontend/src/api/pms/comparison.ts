import { apiPost } from "../index";

// =====================================================================
// REFERRAL MONTH COMPARISON
// =====================================================================

export interface ComparisonSourceLine {
  name: string;
  referrals: number;
  production: number;
}

export interface ComparisonMonthSummary {
  month: string;
  totalReferrals: number;
  doctorReferrals: number;
  selfReferrals: number;
  production: number;
  topSources: ComparisonSourceLine[];
}

export interface ComparisonInsightsResponse {
  success: boolean;
  data?: {
    insight: string;
    monthA: ComparisonMonthSummary;
    monthB: ComparisonMonthSummary;
  };
  error?: string;
  message?: string;
}

/**
 * Generate a Claude Haiku paragraph comparing two months of referral data.
 * Organization is resolved server-side from the JWT; only the location and the
 * two month keys are sent.
 */
export async function generateComparisonInsights(
  locationId: number | null,
  monthA: string,
  monthB: string
): Promise<ComparisonInsightsResponse> {
  return apiPost({
    path: "/pms/comparison-insights",
    passedData: { locationId, monthA, monthB },
  }) as Promise<ComparisonInsightsResponse>;
}
