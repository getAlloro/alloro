/**
 * Organization-type vocabulary (Code Constitution §4.2, §6.2).
 *
 * One source of truth for the words that change between a healthcare org and a
 * generic local-service-business org. The backend uses this to substitute
 * {{placeholders}} into agent prompt prose (see service.prompt-substituter.ts);
 * the frontend mirrors the user-facing label half in
 * frontend/src/constants/orgLabels.ts.
 *
 * `health` values reproduce today's wording exactly — an org with no type set
 * (NULL) resolves to `health`, so existing accounts are unchanged.
 */

export type OrgType = "health" | "generic";

/**
 * Normalize a raw organization_type column value to a concrete OrgType.
 * NULL/undefined and any legacy value default to `health`; the legacy `saas`
 * value is treated as `generic` (it is renamed to `generic` by migration
 * 20260623000000_backfill_organization_type).
 */
export function resolveOrgType(value: string | null | undefined): OrgType {
  return value === "generic" || value === "saas" ? "generic" : "health";
}

/**
 * Table A — prompt placeholders. Substituted into AI agent prose only, never
 * into JSON schema keys. Keys are grammatical roles, not health-specific nouns,
 * so one prompt line serves both verticals.
 */
export const PROMPT_PLACEHOLDERS: Record<OrgType, Record<string, string>> = {
  health: {
    customer: "patient",
    customers: "patients",
    org_noun: "practice",
    org_possessive: "practice's",
    revenue_noun: "production",
    lead: "referral",
    leads: "referrals",
    lead_source: "referral source",
    referral_partner: "referring doctor",
    provider_subject: "the doctor",
    provider_subject_cap: "The doctor",
    provider_possessive: "the doctor's",
    industry: "dental and healthcare",
    service_event: "appointment",
    specialty_noun: "dental specialty",
    specialty_enum:
      '"general dentistry", "orthodontist", "endodontist", "periodontist", "oral surgeon", "prosthodontist", "pediatric dentist"',
    specialty_default: "orthodontist",
  },
  generic: {
    customer: "customer",
    customers: "customers",
    org_noun: "business",
    org_possessive: "business's",
    revenue_noun: "revenue",
    lead: "lead",
    leads: "leads",
    lead_source: "lead source",
    referral_partner: "referral partner",
    provider_subject: "you",
    provider_subject_cap: "You",
    provider_possessive: "your",
    industry: "local service",
    service_event: "visit",
    specialty_noun: "business category",
    specialty_enum:
      'a lowercase business category such as "plumber", "hvac company", "law firm", "gym", "salon", or "accounting firm"',
    specialty_default: "local business",
  },
};

/** Resolve the prompt-placeholder map for an org type. */
export function resolveLabels(orgType: OrgType): Record<string, string> {
  return PROMPT_PLACEHOLDERS[orgType];
}
