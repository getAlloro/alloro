/**
 * Organization-type display labels (Code Constitution §4.2, §12.2).
 *
 * Frontend mirror of the backend label intent (src/config/orgLabels.ts). The
 * `useLabels()` hook resolves the active org type from the auth context and
 * returns this map; components read labels from it instead of hardcoding
 * healthcare-specific strings.
 *
 * `health` values reproduce today's wording exactly — an org with no type set
 * resolves to `health`, so existing accounts are unchanged.
 */

export type OrgType = "health" | "generic";

/**
 * Normalize a raw organization_type value to a concrete OrgType.
 * NULL/undefined/legacy default to `health`; legacy `saas` maps to `generic`.
 */
export function resolveOrgType(value: string | null | undefined): OrgType {
  return value === "generic" || value === "saas" ? "generic" : "health";
}

export interface OrgLabels {
  // Navigation / hub titles
  hubHome: string;
  hubReferrals: string;
  journey: string;
  journeyInsights: string;
  engine: string;
  practiceRanking: string;
  // PMS / dashboard metric labels
  selfReferrals: string;
  doctorReferrals: string;
  totalReferrals: string;
  production: string;
  referralsShort: string;
  referralSources: string;
  referralSourceSingular: string;
  referralType: string;
  referralMix: string;
  referralTrends: string;
  referralVelocity: string;
  doctorShort: string;
  // Prose nouns (for sentences built in the UI)
  customer: string;
  customers: string;
  orgNoun: string;
  revenueNoun: string;
  serviceEvent: string;
}

export const ORG_LABELS: Record<OrgType, OrgLabels> = {
  health: {
    hubHome: "Practice Hub",
    hubReferrals: "Referrals Hub",
    journey: "Patient Journey",
    journeyInsights: "Patient Journey Insights",
    engine: "Referral Engine",
    practiceRanking: "Practice Ranking",
    selfReferrals: "Self Referrals",
    doctorReferrals: "Doctor Referrals",
    totalReferrals: "Total Referrals",
    production: "Production",
    referralsShort: "Referrals",
    referralSources: "Referral Sources",
    referralSourceSingular: "Referral Source",
    referralType: "Referral Type",
    referralMix: "Referral mix",
    referralTrends: "Referral Trends",
    referralVelocity: "Referral velocity",
    doctorShort: "Doctor",
    customer: "patient",
    customers: "patients",
    orgNoun: "practice",
    revenueNoun: "production",
    serviceEvent: "appointment",
  },
  generic: {
    hubHome: "Business Hub",
    hubReferrals: "Revenue Hub",
    journey: "Customer Journey",
    journeyInsights: "Customer Journey Insights",
    engine: "Lead Engine",
    practiceRanking: "Business Ranking",
    selfReferrals: "Direct Leads",
    doctorReferrals: "Partner Leads",
    totalReferrals: "Total Leads",
    production: "Revenue",
    referralsShort: "Leads",
    referralSources: "Lead Sources",
    referralSourceSingular: "Lead Source",
    referralType: "Lead Type",
    referralMix: "Lead mix",
    referralTrends: "Lead Trends",
    referralVelocity: "Lead velocity",
    doctorShort: "Partner",
    customer: "customer",
    customers: "customers",
    orgNoun: "business",
    revenueNoun: "revenue",
    serviceEvent: "visit",
  },
};
