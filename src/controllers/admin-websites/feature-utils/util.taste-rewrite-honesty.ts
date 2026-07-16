/**
 * B2 CRO-lift rewrite — the rewrite honesty gate (Value #6).
 *
 * B2 generates page-section copy with an LLM. The spine's `enforceHonesty`
 * (util.taste-profile-honesty) catches banned *keywords* — rank/visibility
 * promises, guarantees, invented dollar/multiplier metrics. But an LLM rewrite
 * can slip a SUBTLE over-claim that is not a banned keyword: an unprovable
 * superlative ("the gentlest dentist," "best in town"), an implied promise
 * ("you'll love it," "we'll make you smile"), or an absolute comfort/outcome
 * claim ("painless," "completely safe"). Those get rubber-stamped by an owner
 * who does not scrutinize — the exact failure this layer exists to stop.
 *
 * So B2's gate is STRICTER than the spine's, by design (Corey's guardrail,
 * 2026-07-15): it composes `enforceHonesty` with a purpose-built subtle-
 * over-claim scanner. A rewrite must pass BOTH to be storable/approvable, and
 * is re-checked before it publishes. This is deliberately conservative —
 * over-blocking only costs the owner a rewrite they can regenerate;
 * under-blocking publishes an over-claim in the owner's name. Value #6 errs to
 * caution.
 *
 * This layer is B2-LOCAL on purpose: it does NOT mutate the spine's shared
 * `enforceHonesty` (that would destabilize #160's contract + tests). If the
 * subtle-over-claim patterns prove general across surfaces, folding them into
 * the shared util is a fast-follow (spec `plans/07152026-cro-lift-rewrite`,
 * adjacent/backlog).
 *
 * Pure + dependency-free (beyond the spine's `enforceHonesty`): a text scanner,
 * deterministically testable with plain strings.
 */

import { enforceHonesty, type HonestyResult } from "./util.taste-profile-honesty";

/**
 * Strip HTML to the human-readable text a visitor would actually see, so the
 * scanners run on prose, not markup. Removes script/style bodies, unwraps tags,
 * decodes the handful of entities that matter for word boundaries, and collapses
 * whitespace. Not a security sanitizer — a text extractor for honesty scanning.
 */
export function htmlToText(html: string): string {
  return (html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Unprovable superlatives / competitive-placement brags in the brand's own
// voice — "best," "finest," "#1," "top-rated," "premier." These are not caught
// by enforceHonesty's rank-adjacent-to-a-number rule ("best dentist in town"
// has no number), so they are B2's job. Kept tight to real over-claim words —
// common honest words ("great care," "good") are intentionally NOT here to
// avoid false positives.
const SUPERLATIVE_PATTERNS: RegExp[] = [
  /\bbest\b/i,
  /\bfinest\b/i,
  /\bgreatest\b/i,
  /\btop[- ]?rated\b/i,
  /\bhighest[- ]?rated\b/i,
  /\bpremier\b/i,
  /\bunmatched\b/i,
  /\bunbeatable\b/i,
  /\bunrivall?ed\b/i,
  /\bsecond to none\b/i,
  /\bworld[- ]?class\b/i,
  /\bleading\b/i,
  /\bthe only\b/i,
  /\bmost (?:trusted|experienced|advanced|caring|skilled|reliable|affordable)\b/i,
];

// Implied promises / outcome guarantees addressed to the reader — "you'll
// love it," "we'll make you smile," "rest assured." (Bare "guarantee/promise"
// is already caught by enforceHonesty; these are the softer forms.)
const IMPLIED_PROMISE_PATTERNS: RegExp[] = [
  /\byou'?ll\b/i,
  /\byou will\b/i,
  /\bwe'?ll (?:make|get|give|ensure|help you|have you)\b/i,
  /\bwe will (?:make|get|give|ensure|help you|have you)\b/i,
  /\bwe promise\b/i,
  /\brest assured\b/i,
  /\byou (?:can be|are) (?:sure|certain|guaranteed)\b/i,
  /\bguaranteed to\b/i,
];

// Absolute comfort / outcome / perfection claims — "painless," "completely
// safe," "100%," "gentlest," "always ... never." Unprovable absolutes about a
// medical/service experience.
const ABSOLUTE_CLAIM_PATTERNS: RegExp[] = [
  /\bpain[- ]?less\b/i,
  /\bpain[- ]?free\b/i,
  /\bgentlest\b/i,
  /\bcompletely (?:safe|painless|comfortable|relaxed)\b/i,
  /\btotally (?:safe|painless|comfortable)\b/i,
  /\b100\s?%/,
  /\bevery single\b/i,
  /\bflawless\b/i,
  /\bperfect (?:smile|results?|care|experience|visit)\b/i,
  /\balways (?:comfortable|gentle|on time|pain[- ]?free)\b/i,
  /\bnever (?:hurts?|painful|a wait|wait)\b/i,
];

// Negation guard — an honest disclaimer that names a banned phrase only to deny
// it must pass ("we make no promises," "not the cheapest"). Mirrors the spine
// util's NEGATORS so the two gates behave consistently.
const NEGATORS =
  /\b(?:no|not|never|don'?t|doesn'?t|won'?t|without|cannot|can'?t|isn'?t|aren'?t|avoid)\b/i;

/**
 * A match is "negated" when its clause (back to the previous clause break)
 * contains a negator. Identical approach to the spine util's isNegated so a
 * disclaimer that denies an over-claim is not itself blocked.
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
 * Scan already-extracted TEXT (not HTML) for subtle over-claims that
 * `enforceHonesty` does not catch. Returns every category it trips so an audit
 * can explain the rejection precisely.
 */
export function scanSubtleOverclaim(text: string): HonestyResult {
  const value = (text ?? "").trim();
  const reasonCodes: string[] = [];

  if (anyUnnegatedMatch(SUPERLATIVE_PATTERNS, value)) {
    reasonCodes.push("unprovable_superlative");
  }
  if (anyUnnegatedMatch(IMPLIED_PROMISE_PATTERNS, value)) {
    reasonCodes.push("implied_promise");
  }
  if (anyUnnegatedMatch(ABSOLUTE_CLAIM_PATTERNS, value)) {
    reasonCodes.push("absolute_outcome_claim");
  }

  return { ok: reasonCodes.length === 0, reasonCodes };
}

/**
 * The B2 rewrite gate: a rewritten section (HTML) is allowed only if its
 * visible text passes BOTH the spine's `enforceHonesty` (banned keywords) AND
 * B2's `scanSubtleOverclaim` (subtle over-claims). Returns the union of reason
 * codes from both scanners so the audit is complete.
 *
 * Runs at generation (before a rewrite becomes an approvable recommendation)
 * and again at execution (before it publishes) — defense in depth.
 */
export function gateRewrite(html: string): HonestyResult {
  const text = htmlToText(html);
  const base = enforceHonesty(text);
  const subtle = scanSubtleOverclaim(text);
  const reasonCodes = [...base.reasonCodes, ...subtle.reasonCodes];
  return { ok: reasonCodes.length === 0, reasonCodes };
}
