/**
 * Taste Profile — Tier-2 honesty gate (Value #6).
 *
 * Pure, dependency-free text scanners that decide whether a candidate claim is
 * allowed into a persisted Taste Profile. Two independent checks:
 *
 *   1. isRealSource()  — a claim survives only if it carries a real source
 *      reference (review id / GBP field / page URL / intake ref). No source, a
 *      placeholder token, or a labeled source with an empty payload (e.g.
 *      `page_content: ""`) → dropped. This is the "every line traces to a real
 *      source" discipline.
 *
 *   2. enforceHonesty() — the claim's TEXT must not make a rank/visibility
 *      promise, a guarantee, or an invented dollar/multiplier metric (the one
 *      thing we explicitly do NOT copy from Owner.com). Banned language →
 *      rejected. A negation guard lets honest disclaimers ("we make no ranking
 *      promises", "does not guarantee a higher ranking") pass — a banned phrase
 *      preceded in its clause by no/not/never/without/etc. is not blocked.
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

/**
 * Source strings that are structurally present but carry no real provenance.
 * Includes hollow placeholder tokens a caller might pass in lieu of a receipt.
 */
const PLACEHOLDER_SOURCES = new Set([
  "",
  "-",
  "...",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "tbd",
  "todo",
  "source",
  "0",
  "xxx",
]);

/**
 * A claim is source-linked only if its source is a non-empty, non-placeholder
 * reference whose meaningful payload is not empty. Anything else means we
 * cannot trace the line to a real receipt, so the claim must be dropped (never
 * fabricated into a source).
 *
 * A "labeled" source has the `field: payload` shape the adapter builds (e.g.
 * `page_content: "…"`). When the payload after the label — with quotes and
 * whitespace stripped — is empty, the source is hollow and rejected.
 */
export function isRealSource(source: string | null | undefined): boolean {
  if (typeof source !== "string") return false;
  const trimmed = source.trim();
  if (trimmed.length === 0) return false;
  if (PLACEHOLDER_SOURCES.has(trimmed.toLowerCase())) return false;

  // Reject a labeled source whose payload after the field label is empty,
  // e.g. `page_content: ""` — structurally present, but no real excerpt.
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx !== -1) {
    const payload = trimmed.slice(colonIdx + 1).replace(/["'\s]/g, "");
    if (payload.length === 0) return false;
  }

  return true;
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
//
// The rank word alone is NOT blocked (an honest sourced review quote — "ranked
// among the best by patients" — must pass). "rank" is banned only when it is
// adjacent to a number / # / "first" context (a competitive placement claim).
// The map / map-pack / local-pack alternatives catch Google-Maps ranking
// promises; the No.1 / number-1 / #1 alternatives catch the "we'll make you
// number one" brag in any spelling.
const RANK_VISIBILITY_PATTERNS: RegExp[] = [
  /\brank(ed|ing)?\s*(?:#|no\.?|number|\d|first)/i,
  /#\s*\d/,
  /\boutrank\b/i,
  /\bno\.?\s*1\b/i,
  /\bnumber\s*(?:one|1)\b/i,
  /\btop of (?:the )?(?:google|search|maps?|the (?:page|results|map))\b/i,
  /\bmap pack\b/i,
  /\blocal pack\b/i,
  /\bfirst page\b/i,
  /\bpage one\b/i,
  /\bshow up (first|higher|at the top)\b/i,
  /\bget found\b/i,
  /\b(more|higher|better) visibility\b/i,
  /\bdominate (search|google|the (market|rankings?))\b/i,
];

// Invented metrics — fabricated dollar figures and multiplier claims (the
// Owner.com pattern the spec explicitly forbids copying), plus manufactured
// "N new patients/clients" counts and spelled/verb metric brags
// ("doubled my patient count", "10 times more calls", "dozens of new patients").
// Money is caught as the word "dollars" / "N grand" as well as the "$" figure.
const FABRICATED_METRIC_PATTERNS: RegExp[] = [
  /\$\s?\d/, // any dollar figure
  /\b\d+(\.\d+)?\s?x\b/i, // "3.4x", "10 x"
  /\b\d+\+?\s+(new\s+)?(patients?|clients?|customers?|leads?|bookings?|appointments?)\b/i,
  /\b(?:doubled|tripled|\d+\s*(?:times|x)|dozens of|hundreds of|scores of)\s+.*\b(?:patients?|calls?|leads?|new)\b/i,
  /\bdollars\b/i,
  /\b\d[\d,]*\s*grand\b/i,
];

const NEGATORS =
  /\b(?:no|not|never|don'?t|doesn'?t|won'?t|without|cannot|can'?t|isn'?t|aren'?t|avoid)\b/i;

/**
 * A match is "negated" when its clause (the text back to the previous sentence
 * or clause break) contains a negator — so an honest disclaimer that names a
 * banned phrase only to deny it is not blocked.
 */
function isNegated(text: string, idx: number): boolean {
  const before = text.slice(0, idx);
  const lastBreak = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
    before.lastIndexOf(";"),
    before.lastIndexOf(",")
  );
  const clause = before.slice(lastBreak + 1);
  return NEGATORS.test(clause);
}

/** True when any pattern matches an un-negated span of the text. */
function anyUnnegatedMatch(patterns: RegExp[], text: string): boolean {
  for (const re of patterns) {
    const g = new RegExp(
      re.source,
      re.flags.includes("g") ? re.flags : re.flags + "g"
    );
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      if (!isNegated(text, m.index)) return true;
      if (m.index === g.lastIndex) g.lastIndex++;
    }
  }
  return false;
}

/**
 * Scan a claim's (or generated-copy) text for banned language. Returns every
 * category it trips so the audit can explain the rejection precisely.
 */
export function enforceHonesty(text: string): HonestyResult {
  const value = (text ?? "").trim();
  const reasonCodes: string[] = [];

  if (anyUnnegatedMatch(GUARANTEE_PATTERNS, value)) {
    reasonCodes.push("guarantee_or_outcome_claim");
  }
  if (anyUnnegatedMatch(RANK_VISIBILITY_PATTERNS, value)) {
    reasonCodes.push("rank_or_visibility_promise");
  }
  if (anyUnnegatedMatch(FABRICATED_METRIC_PATTERNS, value)) {
    reasonCodes.push("invented_metric");
  }

  return { ok: reasonCodes.length === 0, reasonCodes };
}
