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
    vocab_directive: "",
    customer: "patient",
    customer_cap: "Patient",
    customers: "patients",
    org_noun: "practice",
    org_possessive: "practice's",
    revenue_noun: "production",
    data_product: "PMS data",
    data_product_cap: "PMS data",
    data_upload_event: "PMS upload",
    performance_report_name: "Referral Engine Health Report",
    source_noun: "referral source",
    source_noun_plural: "referral sources",
    volume_noun: "referral",
    volume_noun_plural: "referrals",
    revenue_per_volume: "production per referral",
    lead: "referral",
    leads: "referrals",
    lead_source: "referral source",
    referral_partner: "referring doctor",
    source_contact_noun: "referrer",
    provider_subject: "the doctor",
    provider_subject_cap: "The doctor",
    provider_possessive: "the doctor's",
    team_member_subject: "doctor or team member",
    industry: "dental and healthcare",
    service_event: "appointment",
    management_software: "PMS",
    data_file_origin: "a dental practice's exported PMS file",
    mapping_impact_warning:
      "the doctor's referral counts and revenue numbers will be wrong",
    row_unit: "referral",
    template_shape_description:
      "each row is one referral, already aggregated",
    template_source_rule:
      "Use only when the file is the doctor's own pre-rolled referral summary",
    procedure_shape_description:
      "each row is one billed procedure. Multiple rows per patient visit",
    customer_header: "Patient",
    referring_org_header: "Referring Practice",
    referring_person_header: "Referring User",
    status_filter_hint:
      'For dental procedure logs this is almost always ["Done"]. Other rows are filtered out before aggregation.',
    example_source_person: "Dr. Joe",
    example_source_business: "Heart of Texas Dentistry",
    example_duplicate_a: "Altman Dental",
    example_duplicate_b: "Altman Dentistry",
    example_dormant_source: "Southern Smiles",
    example_signal_source: "Cox Dental",
    example_reviewer_name: "Dr. Cox",
    example_template_source: "Cox Family Dentistry",
    example_template_type_external: "doctor",
    example_template_direct_source: "Self / Walk-in",
    example_procedure_name:
      "D0220 - intraoral - periapical first radiographic image",
    example_customer_value: "(198808) Reaves, Kevin",
    example_provider_value: "Diab, Zied",
    example_location_value: "Main Office",
    example_referring_org_value: "Fredericksburg Family Dentistry",
    example_referring_person_value: "Dr. Hayat Najafe, Dr. Mazin Farah",
    source_dedupe_specialist: "dental/medical referral source",
    same_source_examples:
      '"Dr. Joe Dentals" = "DR. JOE DENTALS"; "Dr. Aspen Dental" = "Dr. Aspenn Dental" = "Aspen Dentistry"; "Dr." = "Doctor"',
    different_source_examples:
      '"Neibauer Dental Care - Harrison Crossing" ≠ "Neibauer Dental Care - Central Park"; "Dr. Smith at ABC Dental" ≠ "Dr. Jones at ABC Dental"',
    doctor_indicator_rule:
      'If the group contains any name with doctor indicators (Dr., DDS, DMD, MD, etc.), set canonicalType to "doctor". Otherwise "self".',
    review_safe_detail_examples:
      "pain, procedures, appointments, billing, insurance, diagnoses, or referrals",
    private_detail_rule:
      "treatment specifics, diagnosis, procedures, appointment details, billing, insurance, records, or protected health information",
    forbidden_reply_phrases:
      '"your treatment", "your appointment", "your procedure", "your case", "your diagnosis", "your records", "your insurance", "your bill", "treated you", or "seeing you"',
    relationship_claim: "clinical relationship",
    contact_destination: "office",
    outcome_claim_scope: "medical, legal, or outcome",
    post_theme_examples:
      "communication, comfort, friendliness, convenience, trust, technology, team care, or office experience",
    post_sensitive_rule:
      "treatment specifics, diagnoses, procedures, appointments, billing, insurance, records, referrals, cases, or symptoms",
    forbidden_post_phrases:
      '"our patient", "as a patient", "your appointment", "your treatment", "your procedure", "your diagnosis", "your records", "your insurance", "your bill", "your case", "treated you", or "we treated"',
    post_broad_wording:
      '"patients and families", "visitors", "our team", "the office experience", "clear communication", and "comfortable care"',
    specialty_noun: "dental specialty",
    specialty_enum:
      '"general dentistry", "orthodontist", "endodontist", "periodontist", "oral surgeon", "prosthodontist", "pediatric dentist"',
    specialty_default: "orthodontist",
  },
  generic: {
    vocab_directive:
      'VOCABULARY — STRICT. This organization is a general local-service business, NOT a healthcare practice. In every human-readable string you output (titles, descriptions, summaries, notes, rationale, replies, posts), use this vocabulary: "customer(s)" not "patient(s)"; "lead(s)" not "referral(s)"; "revenue" not "production"; "business" not "practice"; "you" or "the owner" not "the doctor"; "partner" not "referring doctor"; "visit" not "appointment". Some INPUT and OUTPUT field NAMES use legacy healthcare terms (e.g. doctor_referral_matrix, practice_action_plan, production_total, self_referrals) — keep those field names EXACTLY as the schema specifies, but NEVER let those healthcare words appear in the prose you write. Translate every healthcare term from the source data into the business vocabulary above.',
    customer: "customer",
    customer_cap: "Customer",
    customers: "customers",
    org_noun: "business",
    org_possessive: "business's",
    revenue_noun: "revenue",
    data_product: "revenue data",
    data_product_cap: "Revenue data",
    data_upload_event: "revenue data upload",
    performance_report_name: "Revenue Performance Report",
    source_noun: "revenue source",
    source_noun_plural: "revenue sources",
    volume_noun: "record",
    volume_noun_plural: "records",
    revenue_per_volume: "revenue per record",
    lead: "lead",
    leads: "leads",
    lead_source: "lead source",
    referral_partner: "partner",
    source_contact_noun: "source contact",
    provider_subject: "you",
    provider_subject_cap: "You",
    provider_possessive: "your",
    team_member_subject: "owner or team member",
    industry: "local service",
    service_event: "visit",
    management_software: "customer or revenue-management software",
    data_file_origin: "a local-service business's exported revenue data file",
    mapping_impact_warning:
      "the business's source counts and revenue numbers will be wrong",
    row_unit: "record",
    template_shape_description:
      "each row is one revenue record or already aggregated source row",
    template_source_rule:
      "Use only when the file is the business's own pre-rolled source summary",
    procedure_shape_description:
      "each row is one customer visit, service job, sale, or transaction. Multiple rows per customer visit may share the same source",
    customer_header: "Customer",
    referring_org_header: "Source Channel",
    referring_person_header: "Source Contact",
    status_filter_hint:
      'For generic revenue data this is often ["Completed", "Done", "Paid", "Closed"]. Other rows are filtered out before aggregation.',
    example_source_person: "Northside Partner",
    example_source_business: "Downtown Fitness",
    example_duplicate_a: "Main Street Ads",
    example_duplicate_b: "Main St Ads",
    example_dormant_source: "Google Ads",
    example_signal_source: "Northside Partner",
    example_reviewer_name: "Casey from Northside",
    example_template_source: "Google Ads",
    example_template_type_external: "marketing",
    example_template_direct_source: "Direct / Walk-in",
    example_procedure_name: "Service call",
    example_customer_value: "(198808) Reaves, Kevin",
    example_provider_value: "Morgan Lee",
    example_location_value: "Main Branch",
    example_referring_org_value: "Google Ads",
    example_referring_person_value: "Spring campaign",
    source_dedupe_specialist: "revenue source",
    same_source_examples:
      '"Google" = "Google Search" = "Google Ads"; "Main Street Ads" = "Main St Ads"; "Website" = "Web" = "Business Website"',
    different_source_examples:
      '"Google" ≠ "Facebook" ≠ "Instagram"; "Downtown Branch" ≠ "North Branch"; "Main Street Ads" ≠ "Main Street Partners"',
    doctor_indicator_rule:
      'If the group contains partner or campaign indicators, set canonicalType to "doctor" as the legacy external-source enum. Otherwise "self". Never use the word "doctor" in the reason text for a generic organization.',
    review_safe_detail_examples:
      "private service details, payments, account details, job details, records, or source details",
    private_detail_rule:
      "private service details, account details, payment details, records, source details, or protected customer information",
    forbidden_reply_phrases:
      '"your account", "your payment", "your record", "your case", "we served you", "we handled your job", or "your private details"',
    relationship_claim: "private customer relationship",
    contact_destination: "business",
    outcome_claim_scope: "legal, regulated-service, or outcome",
    post_theme_examples:
      "responsiveness, clear communication, convenience, trust, quality, team support, or service experience",
    post_sensitive_rule:
      "private service details, account details, payment details, records, source details, cases, or protected customer information",
    forbidden_post_phrases:
      '"our customer", "as a customer", "your account", "your payment", "your record", "your case", "we served you", or "we handled your job"',
    post_broad_wording:
      '"customers", "visitors", "our team", "the service experience", "clear communication", and "reliable service"',
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
