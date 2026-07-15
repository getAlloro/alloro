export interface GbpContentSafetyResult {
  isSafe: boolean;
  status: "safe" | "needs_review" | "blocked";
  reasonCodes: string[];
  reasons: string[];
  byteLength: number;
  confidence: number;
}

const MAX_GOOGLE_REPLY_BYTES = 4096;
const MAX_REVIEW_REPLY_CHARS = 900;

const BLOCKED_PATIENT_CONFIRMATION = [
  /\bour patient\b/i,
  /\bas a patient\b/i,
  /\byour appointment\b/i,
  /\byour treatment\b/i,
  /\byour procedure\b/i,
  /\byour diagnosis\b/i,
  /\byour records?\b/i,
  /\byour insurance\b/i,
  /\byour bill\b/i,
  /\byour case\b/i,
  /\btreated you\b/i,
  /\bseeing you\b/i,
];

const BLOCKED_CLAIMS = [
  /\bguarantee\b/i,
  /\bguaranteed\b/i,
  /\bcure\b/i,
  /\bpain[- ]?free\b/i,
  /\bpermanent results?\b/i,
  /\bmedical advice\b/i,
];

const NEEDS_REVIEW_PATTERNS = [
  /\bsorry\b/i,
  /\bconcern/i,
  /\bfrustrat/i,
  /\bupset\b/i,
  /\bdisappoint/i,
  /\bcall\b/i,
  /\bcontact\b/i,
  /\bresolve\b/i,
];

/**
 * Rank / placement / visibility / "freshness" / "will rank" phrase patterns
 * for the get-found honesty gate (Alloro Funnel Engine Slice 1a). These EXTEND
 * the existing content-safety scanners rather than replacing them:
 *   - the bounded-regex → status mechanism is this service's own shape (see
 *     BLOCKED_CLAIMS above and validateReviewReply below),
 *   - the rank vocabulary ("rank #1", "first page of google", "top of google",
 *     "guaranteed ranking", "boost your ranking") is lifted from
 *     websiteContact-services/contentPatternService.ts SPAM_KEYWORDS, but
 *     re-expressed as BOUNDED PHRASE regexes so a lone honest token never trips
 *     (e.g. "we will see you" must PASS; only "will rank"/"will appear at the
 *     top" fail).
 *
 * The gate blocks ranking / placement / visibility PROMISES via these bounded
 * phrase regexes (plus the broader BLOCKED_RANK_PROMISE_PATTERNS below), each
 * checked with matchesUnnegated so an honest NEGATED disclaimer still passes —
 * e.g. "we make no google ranking promises" is not a promise and must PASS,
 * even though it contains the "google ranking" phrase.
 *
 * Every unnegated match is a hard block: Alloro (Value #6) makes no rank/
 * placement/visibility promise. Copy may only claim improved eligibility/
 * structure/trust.
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
 * Broad ranking/placement/visibility PROMISE catcher (Alloro Funnel Engine
 * Slice 1a). The narrower arrays above miss the most common promises an LLM
 * emits — "rank higher on Google", "outrank your competitors", "get you to
 * page one", "dominate local search", "climb the google results", "get more
 * google traffic", "show up higher in search", "be #1 on Google",
 * "number 1 on google". These bounded phrase regexes close those leaks. They
 * are checked with the negation guard (matchesUnnegated) so an honest negated
 * disclaimer — "we make no google ranking promises" — still PASSES.
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
 * Negation guard for the honesty gate. A raw phrase regex would false-positive
 * on an honest disclaimer that NEGATES the promise (e.g. "we make no google
 * ranking promises", "structured data does not guarantee a higher ranking").
 * matchesUnnegated only reports a match when the matched clause (the text since
 * the last sentence break) is NOT negated, so disclaimers pass while promises
 * are blocked.
 */
const RANK_PROMISE_NEGATORS = /\b(?:no|not|never|don'?t|doesn'?t|won'?t|without|cannot|can'?t|isn'?t|aren'?t|avoid)\b/i;

function matchesUnnegated(text: string, pattern: RegExp): boolean {
  const g = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    const before = text.slice(0, m.index);
    const lastBreak = Math.max(
      before.lastIndexOf("."),
      before.lastIndexOf("!"),
      before.lastIndexOf("?"),
      before.lastIndexOf(";"),
    );
    const clause = before.slice(lastBreak + 1);
    if (!RANK_PROMISE_NEGATORS.test(clause)) {
      return true;
    }
    if (m.index === g.lastIndex) {
      g.lastIndex++;
    }
  }
  return false;
}

export class GbpContentSafetyService {
  static validateReviewReply(content: string): GbpContentSafetyResult {
    const reasons: string[] = [];
    const reasonCodes: string[] = [];
    const trimmed = content.trim();
    const byteLength = Buffer.byteLength(trimmed, "utf8");

    if (!trimmed) {
      reasonCodes.push("required");
      reasons.push("Reply content is required.");
    }
    if (byteLength > MAX_GOOGLE_REPLY_BYTES) {
      reasonCodes.push("google_byte_limit");
      reasons.push("Reply exceeds Google's 4096-byte limit.");
    }
    if (trimmed.length > MAX_REVIEW_REPLY_CHARS) {
      reasonCodes.push("reply_character_limit");
      reasons.push("Reply exceeds Alloro's 900-character review reply limit.");
    }

    for (const pattern of BLOCKED_PATIENT_CONFIRMATION) {
      if (pattern.test(trimmed)) {
        reasonCodes.push("private_detail_confirmation");
        reasons.push("Reply appears to confirm patient relationship or private details.");
        break;
      }
    }

    for (const pattern of BLOCKED_CLAIMS) {
      if (pattern.test(trimmed)) {
        reasonCodes.push("medical_or_outcome_claim");
        reasons.push("Reply appears to make a medical or outcome claim.");
        break;
      }
    }

    if (reasonCodes.length > 0) {
      return {
        isSafe: false,
        status: "blocked",
        reasonCodes,
        reasons,
        byteLength,
        confidence: 95,
      };
    }

    const needsReview = NEEDS_REVIEW_PATTERNS.some((pattern) => pattern.test(trimmed));
    if (needsReview) {
      return {
        isSafe: true,
        status: "needs_review",
        reasonCodes: ["sensitive_or_service_recovery_language"],
        reasons: [
          "Reply is publishable but includes sensitive or service-recovery language. Preview before deploying.",
        ],
        byteLength,
        confidence: 70,
      };
    }

    return {
      isSafe: true,
      status: "safe",
      reasonCodes: [],
      reasons: [],
      byteLength,
      confidence: 90,
    };
  }

  /**
   * Honesty gate for generated get-found copy (schema descriptions, answer-first
   * blocks, page metadata) — Alloro Funnel Engine Slice 1a.
   *
   * EXTENDS this service: it reuses BLOCKED_CLAIMS (guarantee/cure/pain-free/…)
   * and adds the bounded rank/placement/visibility/"freshness"/"will rank"
   * phrase patterns declared above. Any match BLOCKS the copy (isSafe=false) so
   * the recommendation that produced it fails — Alloro makes no rank/placement/
   * visibility promise (Value #6). Returns the same GbpContentSafetyResult shape
   * as validateReviewReply so callers handle one result type.
   *
   * Deliberately conservative: only bounded phrases fail. Honest copy such as
   * "we will see you at your appointment" or "we improve your schema" passes.
   */
  static validateGeneratedCopy(content: string): GbpContentSafetyResult {
    const trimmed = (content || "").trim();
    const byteLength = Buffer.byteLength(trimmed, "utf8");
    const reasons: string[] = [];
    const reasonCodes: string[] = [];

    const groups: Array<{ code: string; label: string; patterns: RegExp[] }> = [
      { code: "rank_or_placement_claim", label: "makes a search ranking or placement claim", patterns: BLOCKED_RANK_PLACEMENT_PATTERNS },
      { code: "rank_promise_claim", label: "promises a higher ranking, more traffic, or search dominance", patterns: BLOCKED_RANK_PROMISE_PATTERNS },
      { code: "visibility_claim", label: "promises search visibility", patterns: BLOCKED_VISIBILITY_PATTERNS },
      { code: "freshness_ranking_claim", label: "claims posting/freshness improves ranking", patterns: BLOCKED_FRESHNESS_PATTERNS },
      { code: "will_rank_claim", label: "predicts the page will rank or appear higher", patterns: BLOCKED_WILL_RANK_PATTERNS },
      { code: "medical_or_outcome_claim", label: "makes a guarantee/cure/outcome claim", patterns: BLOCKED_CLAIMS },
    ];

    for (const group of groups) {
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
        confidence: 95,
      };
    }

    return {
      isSafe: true,
      status: "safe",
      reasonCodes: [],
      reasons: [],
      byteLength,
      confidence: 90,
    };
  }
}
