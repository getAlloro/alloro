/**
 * Taste Profile — Tier-2 honesty gate (Value #6).
 *
 * Pure, dependency-free text scanners that decide whether a candidate claim is
 * allowed into a persisted Taste Profile. Two independent checks:
 *
 *   1. isRealSource()  — a claim survives only if it carries a real source
 *      reference (review id / GBP field / page URL / intake ref). No source →
 *      dropped. This is the "every line traces to a real source" discipline.
 *
 *   2. enforceHonesty() — the claim's TEXT must not make a rank/visibility
 *      promise, a guarantee, or an invented dollar/multiplier metric (the one
 *      thing we explicitly do NOT copy from Owner.com). Banned language →
 *      rejected.
 *
 * Reuses the regex-scanner APPROACH proven in
 * `gbp-automation/feature-services/GbpContentSafetyService.ts`
 * (`validateReviewReply`) — the guarantee/cure/pain-free patterns are lifted
 * from its BLOCKED_CLAIMS set. A separate scanner (not that method) because
 * GbpContentSafetyService validates outbound Google review REPLIES
 * (patient-relationship confirmation, 4096-byte Google limits, service-recovery
 * review states) — none of which apply to a source-linked profile claim. The
 * task brief referenced a `validateGeneratedCopy` on that class; it does not
 * exist in the repo (only `validateReviewReply` does), so this purpose-built
 * gate stands in its place. See the composition service for how it is applied.
 */

export interface HonestyResult {
  ok: boolean;
  /** Machine-readable reasons a claim was rejected (empty when ok). */
  reasonCodes: string[];
}

/** Source strings that are structurally present but carry no real provenance. */
const PLACEHOLDER_SOURCES = new Set([
  "",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "tbd",
]);

/**
 * A claim is source-linked only if its source is a non-empty, non-placeholder
 * reference. Anything else means we cannot trace the line to a real receipt, so
 * the claim must be dropped (never fabricated into a source).
 */
export function isRealSource(source: string | null | undefined): boolean {
  if (typeof source !== "string") return false;
  const trimmed = source.trim();
  if (trimmed.length === 0) return false;
  return !PLACEHOLDER_SOURCES.has(trimmed.toLowerCase());
}

// Guarantees / outcome + medical promises — lifted from
// GbpContentSafetyService.BLOCKED_CLAIMS, plus "promise" and "risk-free".
const GUARANTEE_PATTERNS: RegExp[] = [
  /\bguarantee(d|s)?\b/i,
  /\bpromise(d|s)?\b/i,
  /\brisk[- ]?free\b/i,
  /\bcure(d|s)?\b/i,
  /\bpain[- ]?free\b/i,
  /\bpermanent results?\b/i,
];

// Rank / visibility / "get found" language — banned anywhere in the profile
// or the copy it feeds (spec "NOT this": no rank/visibility/guarantee language).
const RANK_VISIBILITY_PATTERNS: RegExp[] = [
  /\brank(ed|ing|ings|s)?\b/i,
  /\boutrank\b/i,
  /\bnumber one\b/i,
  /\btop[- ]?ranked\b/i,
  /\btop of (google|search|the (page|results))\b/i,
  /\bfirst page\b/i,
  /\bpage one\b/i,
  /\bshow up (first|higher|at the top)\b/i,
  /\bget found\b/i,
  /\b(more|higher|better) visibility\b/i,
  /\bdominate (search|google|the (market|rankings?))\b/i,
  /\b#\s*1\b/,
];

// Invented metrics — fabricated dollar figures and multiplier claims (the
// Owner.com pattern the spec explicitly forbids copying), plus manufactured
// "N new patients/clients" counts.
const FABRICATED_METRIC_PATTERNS: RegExp[] = [
  /\$\s?\d/, // any dollar figure
  /\b\d+(\.\d+)?\s?x\b/i, // "3.4x", "10 x"
  /\b\d+\+?\s+(new\s+)?(patients?|clients?|customers?|leads?|bookings?|appointments?)\b/i,
];

function anyMatch(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Scan a claim's (or generated-copy) text for banned language. Returns every
 * category it trips so the audit can explain the rejection precisely.
 */
export function enforceHonesty(text: string): HonestyResult {
  const value = (text ?? "").trim();
  const reasonCodes: string[] = [];

  if (anyMatch(GUARANTEE_PATTERNS, value)) {
    reasonCodes.push("guarantee_or_outcome_claim");
  }
  if (anyMatch(RANK_VISIBILITY_PATTERNS, value)) {
    reasonCodes.push("rank_or_visibility_promise");
  }
  if (anyMatch(FABRICATED_METRIC_PATTERNS, value)) {
    reasonCodes.push("invented_metric");
  }

  return { ok: reasonCodes.length === 0, reasonCodes };
}
