/**
 * Hero Arc Substrate doctrine filter for growth opportunities.
 *
 * Feature 2 of the Path D rebuild (2026-05-22). The LLM-generated
 * `top_three_fixes` array from the referral_engine agent renders cleanly
 * for data-rich orgs (named referrer + dollar + action) but silently
 * degrades to generic consultant copy for data-thin orgs (e.g.,
 * "Optimize Google & Website Conversion (Digital Funnel Optimization)").
 *
 * Generic copy violates the doctrine: customer-facing surfaces must
 * either name a specific entity (referrer, dollar, count) or render
 * honest empty state. This filter is the defensive layer at the consumer
 * boundary -- it doesn't touch the LLM prompt or agent pipeline; it
 * decides what's worth showing the doctor.
 *
 * See memory/project_caroline_generic_copy_diagnosis.md for the
 * production verification (May 22 pilot-mode screenshots).
 */

import type {
  ReferralEngineData,
  TopFix,
} from "../components/PMS/ReferralMatrices";

const NUMBER_PATTERNS: RegExp[] = [
  /\$[\d,]+/, //                                       e.g. "$1,509"
  /\b\d+(\.\d+)?\s+(referrals?|patients?|months?|days?|weeks?)\b/i, // "26 referrals"
  /\b\d+(\.\d+)?%/, //                                 e.g. "27%"
];

// Source names shorter than this risk false-positive matches on common
// English words. The matrices' actual referrer/source names are typically
// well above this threshold ("Dental Care At Chancellor Crossing", "Google",
// "Dr. Thomas Holehouse"); the short-name floor protects against matching
// e.g. "Re" or "Dr" out of context.
const MIN_NAME_LENGTH = 4;

/**
 * Doctrine check: does this growth opportunity contain a named entity?
 *
 * Returns true if the fix references at least one of:
 *  - A specific dollar amount   ($1,509)
 *  - A specific count with unit (26 referrals, 6 months)
 *  - A percentage               (27%)
 *  - A referrer source name from the org's referral matrices
 *
 * If none of the above appear, the fix is generic and should be filtered
 * before render so the consumer falls through to honest empty state.
 */
export function fixHasNamedEntity(
  fix: TopFix | string,
  referralData?: ReferralEngineData | null,
): boolean {
  const text =
    typeof fix === "string"
      ? fix
      : `${fix.title ?? ""} ${fix.description ?? ""} ${fix.impact ?? ""}`;

  // (1) Specific number patterns
  if (NUMBER_PATTERNS.some((re) => re.test(text))) return true;

  // (2) Named source from the referral matrices
  if (referralData) {
    const lower = text.toLowerCase();
    const doctorRows = referralData.doctor_referral_matrix ?? [];
    const sourceRows = referralData.non_doctor_referral_matrix ?? [];

    for (const row of doctorRows) {
      const name = row?.referrer_name;
      if (
        name &&
        name.length >= MIN_NAME_LENGTH &&
        lower.includes(name.toLowerCase())
      ) {
        return true;
      }
    }

    for (const row of sourceRows) {
      const label = row?.source_label || row?.source_key;
      if (
        label &&
        label.length >= MIN_NAME_LENGTH &&
        lower.includes(label.toLowerCase())
      ) {
        return true;
      }
    }
  }

  return false;
}
