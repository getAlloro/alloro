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

import {
  hasUnsafeBidiControl,
  normalizeForMatching,
} from "./copyNormalization";
import { matchesUnnegatedInNormalizedCopy } from "./claimNegation";

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
  // "position" carries a negative lookahead for the INFINITIVAL IDIOM. "A better
  // position to serve your patients" is ordinary English, not a placement
  // promise, and blocking it is a false positive — the failure mode that matters
  // most here, because a blocked disclaimer cannot ship at all. "Top position on
  // Google" is untouched: only "position TO <verb>" is exempted.
  /\b(?:higher|top|first|better|improved)\s+(?:google\s+|search\s+)?(?:(?:ranking|placement)s?\b|positions?\b(?!\s{1,8}to\s{1,8}[a-z]))/i,
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
 * The rank/placement claim FAMILY, enumerated by its parts rather than by
 * string. The narrower arrays above are built around a qualifier set
 * (higher|top|first|better|improved) that sits DIRECTLY on the rank noun, so
 * every promise whose qualifier is itself a multi-word page reference — "first
 * PAGE placement", "page one placement" — slips through the gap between the two
 * words. These patterns close that family.
 *
 * They are ADDITIVE. The existing arrays are left exactly as they are: their
 * qualifier set is deliberately narrow around the noun "position", and widening
 * it in place (to "prime position", "best position", "leading position") would
 * trade these misses for a crop of false positives on ordinary English, which
 * is the worse failure.
 *
 * KNOWN RESIDUALS — this inventory is NOT exhaustive, and cannot be. It was
 * attacked with a sweep of the family; three CATEGORIES still get through, and
 * are recorded rather than papered over. (Categories only here: the repo is
 * public, so the concrete strings live in the test fixtures, not in source.)
 *   - POSITION METAPHOR. A promise that names position through a figure of
 *     speech carries no rank noun for a lexical gate to match. Metaphors for
 *     position are an open set; enumerating them is whack-a-mole.
 *   - PARAPHRASE WITH NO CLAIM VOCABULARY. A placement promise can be written
 *     with no rank, placement, page, or visibility token in it at all. Nothing
 *     lexical can reach that; it needs a semantic model.
 *   - COMPARATIVE VISIBILITY, unqualified. Left open deliberately: it is
 *     surface-identical to honest copy about page structure, so blocking it
 *     would over-block a true statement. The SUPERLATIVE form is caught — it is
 *     unambiguously a competitive-position claim.
 * These are why the gate is a conservative FILTER, not a guarantee. Owner
 * approval, not this regex, is what stands between a boast and a publish.
 */

/** Multi-word page/position qualifiers: "first page", "page one", "position 1", "#1". */
const PAGE_POSITION_QUALIFIER =
  "(?:page\\s{0,2}-?\\s{0,2}(?:one|1)|(?:first|front|top)\\s{0,2}-?\\s{0,2}page|" +
  "position\\s{0,2}-?\\s{0,2}(?:one|1)|number\\s{0,2}-?\\s{0,2}(?:one|1)|#\\s{0,2}1)";

/** The engine/surface a placement promise names, sitting between qualifier and noun. */
const RANK_SURFACE = "(?:google|search|maps|map|local|organic|serp)";

/**
 * Nouns a position promise lands on. "position" is present here because the
 * qualifier that reaches it is always an explicit page/rank reference; it is
 * absent from PLACEMENT_ADJECTIVE_PATTERN below, where the looser adjectives
 * ("prime position") are ordinary English.
 */
const RANK_NOUN = "(?:ranking|placement|position|spot|listing|slot)s?";

/** Bare position adjectives. Kept separate from the multi-word qualifiers above. */
const BARE_RANK_QUALIFIER = "(?:higher|highest|top|first|best|leading)";

const BLOCKED_RANK_INVENTORY_PATTERNS = [
  // "first page placement", "page one placement", "#1 google ranking".
  // The opening guard is a LOOKBEHIND, not `\b`: the "#1" branch starts with a
  // non-word character, and `\b` never holds before it, so a leading `\b` would
  // silently drop every "#1 placement" from this pattern.
  new RegExp(
    `(?<![\\w#])${PAGE_POSITION_QUALIFIER}\\s{1,8}(?:${RANK_SURFACE}\\s{1,8}){0,2}${RANK_NOUN}\\b`,
    "i",
  ),
  // "top spot", "first slot" — the position nouns the higher|top|first set omits.
  // "listing" requires an explicit search surface: an unqualified "your first
  // listing" is ordinary onboarding copy, not a placement promise.
  new RegExp(`\\b${BARE_RANK_QUALIFIER}\\s{1,8}(?:${RANK_SURFACE}\\s{1,8}){0,2}(?:spot|slot)s?\\b`, "i"),
  new RegExp(`\\b${BARE_RANK_QUALIFIER}\\s{1,8}(?:${RANK_SURFACE}\\s{1,8}){1,2}listings?\\b`, "i"),
  // Superlative/absolute visibility: "maximum exposure on Google", "the most
  // visible practice in town".
  new RegExp(
    "\\b(?:maximum|maximal|max|total|complete|full|unmatched|unbeatable|guaranteed)\\s{1,8}" +
      `(?:${RANK_SURFACE}\\s{1,8}){0,2}(?:exposure|visibility|reach|presence)\\b`,
    "i",
  ),
  /\bthe\s{1,8}most\s{1,8}(?:visible|found|seen|searched)\b/i,
  // "own the map pack" — the dominate/own verbs against the pack nouns.
  new RegExp(
    "\\b(?:dominate|own|crush|conquer|rule|corner)\\s{1,8}(?:the\\s{1,8})?(?:local\\s{1,8})?" +
      "(?:map|snack|local|3|three)\\s{0,2}-?\\s{0,2}pack\\b",
    "i",
  ),
  // "found at the very top". Narrow to the FOUND/rank verb on purpose: bare "at
  // the top" is the answer-first recommendation's own honest wording ("answer
  // the question at the top of the page") and must never trip this gate.
  /\b(?:found|ranked|listed|placed|sitting|sits)\s{1,8}at\s{1,8}the\s{1,8}(?:very\s{1,8})?top\b/i,
  // Placement-promise adjectives the higher|top|first set misses. "position" is
  // deliberately NOT in this noun set — "prime position"/"best position" are
  // ordinary English, and blocking them would be a false positive.
  new RegExp(
    "\\b(?:premium|prime|preferred|priority|elevated|enhanced|featured|dominant|leading)" +
      `\\s{1,8}(?:${RANK_SURFACE}\\s{1,8}){0,2}(?:placement|ranking|listing|spot|slot)s?\\b`,
    "i",
  ),
  // A position promise carrying NO rank noun at all: "front page of Google".
  new RegExp(
    "\\b(?:(?:front|first)\\s{0,2}-?\\s{0,2}page|page\\s{0,2}-?\\s{0,2}(?:one|1)|top)\\s{1,8}of\\s{1,8}" +
      "(?:the\\s{1,8})?(?:google\\s{1,8}maps|google|search\\s{1,8}results|search|serps?|the\\s{1,8}results|results)\\b",
    "i",
  ),
  // Maps / local-pack placement, gated behind a promise verb so honest
  // educational copy about what a local pack IS still passes.
  new RegExp(
    "\\b(?:get|put|land|place|rank|appear|show\\s{1,8}up|feature)\\w*\\s{1,8}(?:you\\s{1,8}|your\\s{1,8}\\w{1,30}\\s{1,8})?" +
      "(?:in|into|on|at\\s{1,8}the\\s{1,8}top\\s{1,8}of)\\s{1,8}(?:the\\s{1,8})?" +
      "(?:google\\s{1,8}maps|map\\s{0,2}-?\\s{0,2}pack|local\\s{0,2}-?\\s{0,2}pack|snack\\s{0,2}-?\\s{0,2}pack|(?:3|three)\\s{0,2}-?\\s{0,2}pack)\\b",
    "i",
  ),
  // Placement stated as a position relative to competitors.
  new RegExp(
    "\\b(?:above|ahead\\s{1,8}of|outperform\\w*|beat|beats|beating)\\s{1,8}" +
      "(?:your\\s{1,8}|the\\s{1,8}|all\\s{1,8}|local\\s{1,8}|nearby\\s{1,8}|other\\s{1,8}){0,3}competitors?\\b",
    "i",
  ),
];


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
  {
    code: "page_position_claim",
    label: "promises a page-one, front-page, or premium placement",
    patterns: BLOCKED_RANK_INVENTORY_PATTERNS,
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

    // Reject before normalization or matching. Bidi overrides/isolates can
    // reorder what a reader sees; stripping them would inspect a different
    // logical-order string and can turn a visible claim into harmless text.
    if (hasUnsafeBidiControl(trimmed)) {
      return {
        isSafe: false,
        status: "blocked",
        reasonCodes: ["bidirectional_control"],
        reasons: ["Copy contains bidirectional formatting controls and cannot be matched safely."],
        byteLength,
        confidence: BLOCKED_CONFIDENCE,
      };
    }

    // Normalize ONCE, here, rather than per pattern: the gate runs ~40 patterns
    // and the fold is the same for all of them. `byteLength` stays measured on
    // the ORIGINAL — it describes the copy that will actually ship, not the
    // matcher's view of it.
    const normalized = normalizeForMatching(trimmed);

    for (const group of SAFETY_GROUPS) {
      if (group.patterns.some((pattern) => matchesUnnegatedInNormalizedCopy(normalized, pattern))) {
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
