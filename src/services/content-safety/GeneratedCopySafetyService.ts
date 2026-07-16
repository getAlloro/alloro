/**
 * Generated-copy safety gate — neutral, domain-agnostic (§6.2 top-level shared
 * service).
 *
 * This is the honesty gate for ANY generated owner-facing copy: it blocks
 * ranking / placement / visibility / "freshness" promises and guarantee/cure/
 * outcome claims, because Alloro makes no rank, placement, or visibility
 * promise (Value #6). Copy may only claim improved eligibility, structure, or
 * trust.
 *
 * It lives here — not inside a controller domain — because it is consumed by
 * BOTH `controllers/gbp-automation/` (which reuses OUTCOME_CLAIM_PATTERNS and
 * the result shape for its review-reply gate) and `services/ai-seo-audit/`
 * (which calls validateGeneratedCopy from the get-found checker). A service
 * under `controllers/<domain>/feature-services/` may not be imported by another
 * domain (§7.1: Routes → Controllers → Services → Models); shared logic belongs
 * in `src/services/`.
 */

export interface ContentSafetyResult {
  isSafe: boolean;
  status: "safe" | "needs_review" | "blocked";
  reasonCodes: string[];
  reasons: string[];
  byteLength: number;
  confidence: number;
}

const SAFE_CONFIDENCE = 90;
const BLOCKED_CONFIDENCE = 95;

/**
 * Generic guarantee / cure / outcome claims. Shared: the GBP review-reply gate
 * applies these to human-approved replies, and validateGeneratedCopy applies
 * them to generated copy.
 */
export const OUTCOME_CLAIM_PATTERNS = [
  /\bguarantee\b/i,
  /\bguaranteed\b/i,
  /\bcure\b/i,
  /\bpain[- ]?free\b/i,
  /\bpermanent results?\b/i,
  /\bmedical advice\b/i,
];

/**
 * Rank / placement / visibility / "freshness" / "will rank" phrase patterns.
 * Expressed as BOUNDED PHRASE regexes so a lone honest token never trips the
 * gate (e.g. "we will see you" must PASS; only "will rank" / "will appear at
 * the top" fail).
 */
const BLOCKED_RANK_PLACEMENT_PATTERNS = [
  /\brank(?:ed|ing|s)?\s*#?\s*1\b/i,
  /\b#\s*1\s+(?:on|in|for)\s+google\b/i,
  /\b(?:number one|first)\s+(?:on|in|for)\s+google\b/i,
  /\btop of (?:google|search|the search results|search results)\b/i,
  /\bfirst page of google\b/i,
  /\bpage (?:one|1) of (?:google|search)\b/i,
  /\bhigher (?:google )?(?:ranking|rankings|placement)\b/i,
  /\bboost your (?:ranking|rankings|seo|search ranking)\b/i,
  /\bguaranteed (?:ranking|rankings|placement|first page|top spot|results?)\b/i,
  /\bgoogle rankings?\b/i,
];

const BLOCKED_VISIBILITY_PATTERNS = [
  /\bboost your (?:google )?visibility\b/i,
  /\bimprove your (?:google |search )?visibility\b/i,
  /\bincrease your visibility (?:on|in) (?:google|search)\b/i,
  /\bget (?:you |your (?:practice|business|site) )?(?:seen|found) first (?:on|in) google\b/i,
];

const BLOCKED_FRESHNESS_PATTERNS = [
  /\bfreshness signal\b/i,
  /\bkeeps? (?:your )?(?:listing|profile|page|ranking) fresh\b/i,
  /\bfresh(?:er)? (?:content|posts?) (?:helps?|boosts?|improves?|raises?) (?:your )?(?:rank|ranking|rankings|placement|visibility)\b/i,
  /\bposting (?:regularly|often) (?:helps?|boosts?|improves?) (?:your )?(?:rank|ranking|rankings|placement)\b/i,
];

const BLOCKED_WILL_RANK_PATTERNS = [
  /\bwill\s+rank\b/i,
  /\bwill\s+appear\s+(?:higher|at the top|first|on the first page)\b/i,
  /\bwill\s+show up\s+(?:higher|first|at the top|on the first page)\b/i,
  /\bwill\s+be\s+(?:#?\s*1|number one|found first|at the top)\b/i,
  /\bwill\s+(?:get|put|move) (?:you|your (?:practice|business|site)) (?:to )?(?:the )?top\b/i,
];

/**
 * Broad ranking/placement/visibility PROMISE catcher. The narrower arrays above
 * miss the most common promises an LLM emits — "rank higher on Google",
 * "outrank your competitors", "get you to page one", "dominate local search",
 * "climb the google results", "show up higher in search", "be #1 on Google".
 */
const BLOCKED_RANK_PROMISE_PATTERNS = [
  /\brank\w*\s+(?:you\s+|your\s+\w+\s+)?(?:higher|first|top|#?\s*1\b|number\s*(?:one|1)\b|on\s+(?:the\s+first\s+page|google|page\s*(?:one|1)))/i,
  /\bout\s*-?\s*rank/i,
  /\b(?:higher|top|first|better|improved)\s+(?:google\s+|search\s+)?(?:ranking|placement|position)s?\b/i,
  /\b(?:get\s+(?:you\s+)?to|reach|hit|land\s+on|be\s+on|onto|climb\s+to|to)\s+page\s*(?:one|1)\b/i,
  /\bpage\s*(?:one|1)\s+of\s+(?:google|search|the\s+results|results)\b/i,
  /\b(?:dominate|own|crush|conquer)\s+(?:the\s+)?(?:local\s+)?(?:search|google|rankings?|results|competition|market)\b/i,
  /\bclimb\s+(?:the\s+)?(?:google\s+|search\s+)?(?:results|rankings?|ranks|ladder)\b/i,
  /\b(?:more|increase\w*|boost\w*|grow|drive|maximize|skyrocket)\s+(?:your\s+)?(?:google\s+|search\s+|website\s+|online\s+|organic\s+)?(?:traffic|visibility|rankings?|impressions)\b/i,
  /\bshow\s+up\s+(?:higher|first|#?\s*1|on\s+(?:the\s+first\s+page|page\s*(?:one|1)))/i,
  /#\s*1\s+(?:on|in|for)\s+(?:google|search)/i,
  /\bnumber\s*(?:one|1)\s+(?:on|in|for)\s+(?:google|search)/i,
  /\b(?:top|first\s+page)\s+of\s+(?:google|search|the\s+search\s+results)/i,
  /\bguarantee\w*\s+(?:you\s+)?(?:a\s+|your\s+)?(?:ranking|placement|first\s+page|top\s+(?:spot|placement|ranking)|#?\s*1|results|visibility|higher\s+ranking)/i,
  /\bwill\s+rank\b/i,
  /\bboost\w*\s+(?:your\s+)?(?:google\s+)?(?:ranking|visibility|placement|traffic)/i,
  /\bfreshness\s+signal/i,
];

/**
 * Negation guard. A raw phrase regex false-positives on an honest disclaimer
 * that NEGATES the promise ("we make no google ranking promises", "structured
 * data does not guarantee a higher ranking"), so a match only counts when the
 * clause governing it is not negated.
 */
const RANK_PROMISE_NEGATORS =
  /\b(?:no|not|never|don'?t|doesn'?t|won'?t|without|cannot|can'?t|isn'?t|aren'?t|avoid)\b/i;

/**
 * Clause boundaries that END the scope of a preceding negator.
 *
 * A negator only governs its own clause. Grammatically:
 *   - Sentence/clause punctuation (. ! ? ; :) ends negation scope.
 *   - An ADVERSATIVE or subordinating conjunction ("but", "however", "though",
 *     "while", …) cancels it — in "not X, but Y", the negation does not reach Y,
 *     so a claim in Y is judged on its own.
 *   - A LEADING subordinate clause ("While/Although/Though X, Y") is closed by
 *     its comma: the negation lives in X and does not reach the main clause Y.
 *     The conjunction itself sits BEFORE the negator, so the conjunction alone
 *     cannot end the scope — the closing comma is the boundary.
 *   - A coordinating conjunction ("and"/"or"/"yet") followed by a NEW SUBJECT
 *     starts a new independent clause with its own verb, so negation does not
 *     carry.
 *
 * Deliberately EXCLUDED: bare "and"/"or"/"yet" with NO new subject. Those
 * coordinate verb phrases that SHARE the negated auxiliary, where the negation
 * genuinely does distribute — "we will not rank you #1 or get you to page one"
 * is honest, and "we have not yet guaranteed a higher ranking" is honest.
 * Splitting there would false-positive on honest copy.
 */
const NEGATION_SCOPE_BOUNDARY = new RegExp(
  [
    // Sentence / clause punctuation.
    "[.!?;:]",
    // A leading subordinate clause, consumed through its closing comma.
    "\\b(?:while|whilst|although|though|whereas)\\b[^,.;:!?]*,",
    // An adversative or subordinating conjunction, mid-sentence.
    "\\b(?:but|however|nevertheless|nonetheless|while|whilst|although|though|whereas)\\b",
    // A coordinating conjunction that introduces a new subject.
    "\\b(?:and|or|yet)\\s+(?:we|i|you|it|this|that|they|our|your)\\b",
  ].join("|"),
  "gi",
);

/**
 * Index just past the last negation-scope boundary in `before`, or 0 if none.
 * The returned slice is the clause that governs the matched phrase.
 */
function lastNegationScopeBoundaryEnd(before: string): number {
  const boundary = new RegExp(NEGATION_SCOPE_BOUNDARY.source, NEGATION_SCOPE_BOUNDARY.flags);
  let end = 0;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(before)) !== null) {
    end = match.index + match[0].length;
    if (match.index === boundary.lastIndex) {
      boundary.lastIndex++;
    }
  }
  return end;
}

/**
 * True when `pattern` matches `text` in at least one clause that is NOT negated.
 * Negation is localized to the clause governing each match (see
 * NEGATION_SCOPE_BOUNDARY), so an honest disclaimer passes while a promise
 * laundered behind an honest clause is still blocked.
 */
export function matchesUnnegated(text: string, pattern: RegExp): boolean {
  const scan = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let match: RegExpExecArray | null;
  while ((match = scan.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    const clause = before.slice(lastNegationScopeBoundaryEnd(before));
    if (!RANK_PROMISE_NEGATORS.test(clause)) {
      return true;
    }
    if (match.index === scan.lastIndex) {
      scan.lastIndex++;
    }
  }
  return false;
}

const SAFETY_GROUPS: Array<{ code: string; label: string; patterns: RegExp[] }> = [
  {
    code: "rank_or_placement_claim",
    label: "makes a search ranking or placement claim",
    patterns: BLOCKED_RANK_PLACEMENT_PATTERNS,
  },
  {
    code: "rank_promise_claim",
    label: "promises a higher ranking, more traffic, or search dominance",
    patterns: BLOCKED_RANK_PROMISE_PATTERNS,
  },
  { code: "visibility_claim", label: "promises search visibility", patterns: BLOCKED_VISIBILITY_PATTERNS },
  {
    code: "freshness_ranking_claim",
    label: "claims posting/freshness improves ranking",
    patterns: BLOCKED_FRESHNESS_PATTERNS,
  },
  {
    code: "will_rank_claim",
    label: "predicts the page will rank or appear higher",
    patterns: BLOCKED_WILL_RANK_PATTERNS,
  },
  {
    code: "medical_or_outcome_claim",
    label: "makes a guarantee/cure/outcome claim",
    patterns: OUTCOME_CLAIM_PATTERNS,
  },
];

export class GeneratedCopySafetyService {
  /**
   * Honesty gate for generated owner-facing copy (schema descriptions,
   * answer-first blocks, page metadata).
   *
   * Any unnegated match BLOCKS the copy (isSafe=false) so the recommendation
   * that produced it fails. Deliberately conservative: only bounded phrases
   * fail, so honest copy such as "we will see you at your appointment" or "we
   * improve your schema" passes.
   */
  static validateGeneratedCopy(content: string): ContentSafetyResult {
    const trimmed = (content || "").trim();
    const byteLength = Buffer.byteLength(trimmed, "utf8");
    const reasons: string[] = [];
    const reasonCodes: string[] = [];

    for (const group of SAFETY_GROUPS) {
      if (group.patterns.some((pattern) => matchesUnnegated(trimmed, pattern))) {
        reasonCodes.push(group.code);
        reasons.push(`Copy ${group.label} — Alloro cannot promise this (Value #6).`);
      }
    }

    if (reasonCodes.length > 0) {
      return {
        isSafe: false,
        status: "blocked",
        reasonCodes,
        reasons,
        byteLength,
        confidence: BLOCKED_CONFIDENCE,
      };
    }

    return {
      isSafe: true,
      status: "safe",
      reasonCodes: [],
      reasons: [],
      byteLength,
      confidence: SAFE_CONFIDENCE,
    };
  }
}
