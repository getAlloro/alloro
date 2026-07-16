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

/**
 * Negation guard. A raw phrase regex false-positives on an honest disclaimer
 * that NEGATES the promise ("we make no google ranking promises", "structured
 * data does not guarantee a higher ranking"), so a match only counts when the
 * clause governing it is not negated.
 */
const RANK_PROMISE_NEGATORS =
  /\b(?:no|not|never|don'?t|doesn'?t|won'?t|without|cannot|can'?t|isn'?t|aren'?t|avoid)\b/i;

/**
 * Words that can open a new independent clause's SUBJECT. Pronouns, plus the
 * possessive/demonstrative determiners that head a subject NP ("your practice
 * ranks…"). Deliberately EXCLUDES the bare articles "the"/"a"/"an": those head
 * OBJECT list items far more often than subjects in this copy ("we do not
 * promise rankings, the top spot, or page one"), so admitting them would split
 * an honest coordinated object list.
 */
const NEW_SUBJECT =
  "(?:we|i|you|he|she|it|they|this|that|these|those|there|our|your|his|her|its|their|alloro|" +
  // Relative pronouns open a relative clause with its own verb. They are safe to
  // admit because, unlike a noun, a relative pronoun is never an item in a
  // coordinated object list, so they cannot split an honest disclaimer's list.
  "which|who|whom|whose|where|everyone|anyone|nobody)";

/**
 * Coordinators and negators across which negation CARRIES rather than stopping.
 * A separator followed by one of these is continuing the negated predicate
 * ("we won't rank you #1 — or get you to page one"; "no guarantees, no
 * promises"), not opening a new one. "nor" is included because it explicitly
 * propagates the negation it follows.
 */
const NEGATION_CARRYING = "(?:and|or|nor|yet|but|not|never|no|neither|without)";

/**
 * Bounded run of whitespace. Every `\s` run that sits next to a literal is
 * capped rather than written `\s*`: an unbounded run adjacent to a literal that
 * may fail backtracks once per start position, which is quadratic on a long
 * whitespace run. Eight is far more than real copy uses between two words.
 */
const GAP = "\\s{0,8}";

/**
 * Dash used as a clause separator: em/en/figure/horizontal-bar/minus, a double
 * hyphen, or a SPACED single hyphen. The spacing requirement is what keeps
 * "page-one" and "pain-free" from reading as a clause break.
 */
const DASH_SEPARATOR = `(?:${GAP}(?:\\u2014|\\u2013|\\u2015|\\u2012|\\u2212|--)${GAP}|\\s{1,8}-\\s{1,8})`;

/**
 * Non-dash symbols used to set off one block of copy from another: the pipe of
 * a title tag, a bullet, an arrow, a guillemet, a slash. Page metadata is one
 * of the surfaces this gate validates, and "A | B" there is two independent
 * fragments, never one verb phrase — so these behave like a dash.
 */
const SYMBOL_SEPARATOR = `${GAP}[|\\uff5c\\u00a6\\u2022\\u2023\\u25aa\\u25e6\\u2192\\u27f6\\u00bb\\u203a/]{1,8}${GAP}`;

/**
 * Comma, including the full-width and ideographic forms. A comma look-alike is
 * still a comma: copy that has been round-tripped through another locale must
 * not read as one unbroken clause.
 */
const COMMA = "[,\\uff0c\\u201a\\u3001]";

/** A line break, and a break that is a full paragraph break. */
const LINE_BREAK = "[\\n\\r\\u2028\\u2029]";
const PARAGRAPH_BREAK = `${LINE_BREAK}${GAP}${LINE_BREAK}`;

/** A list-item marker opening a new line — a new bullet is a new clause. */
const LIST_MARKER = `${LINE_BREAK}${GAP}(?:[-*\\u2022\\u2023\\u25aa\\u25e6\\u00b7>]{1,8}|\\d{1,9}[.)])${GAP}`;

/**
 * Clause boundaries that END the scope of a preceding negator.
 *
 * A negator governs its own clause and no further. The boundary set below is
 * the enumeration of ways a new clause can OPEN, grouped by what licenses the
 * split. It is a regex heuristic over grammar — deliberately conservative, and
 * NOT exhaustive (see the residuals named at the end of this comment).
 *
 * HARD — these close a clause outright, whatever follows:
 *   - Sentence/clause punctuation (. ! ? ; :) and the ellipsis.
 *   - A PARAGRAPH break or a new list item. A lone line break is NOT hard:
 *     generated copy is often soft-wrapped, and "we do not\nguarantee a higher
 *     ranking" is a single negated verb phrase.
 *   - An ADVERSATIVE, conjunctive adverb, or causal subordinator ("but",
 *     "however", "instead", "therefore", "because", …). These cannot share a
 *     preceding negated auxiliary: in "not X, but Y" the negation does not
 *     reach Y, and "not X because Y" asserts Y, so Y is judged on its own.
 *   - A LEADING subordinate clause ("While/Although X, Y") consumed through its
 *     closing comma: the negator lives in X, and the conjunction itself sits
 *     BEFORE the negator, so the closing comma — not the conjunction — is the
 *     boundary.
 *   - A LEADING verbless negated NP fragment ("No hidden fees, …") consumed
 *     through its closing comma. Determiner-"no" heading a subject-less
 *     fragment negates only its own noun phrase; with no verb for it to attach
 *     to, its scope cannot reach a following predication. Exempted when the
 *     next segment is itself negation-carrying, so "No guarantees, no promises"
 *     stays honest.
 *
 * SOFT — a separator only ends negation scope when what follows OPENS a new
 * predication rather than continuing the negated one:
 *   - A comma or an opening paren + a NEW SUBJECT. This is the comma splice /
 *     asyndetic coordination case.
 *   - A line break or tab + a NEW SUBJECT.
 *   - A coordinating conjunction ("and"/"or"/"yet"/"so"/"then"/"plus") + a NEW
 *     SUBJECT, which starts an independent clause with its own verb.
 *   - A dash, or a block separator (the pipe of a title tag, a bullet, an
 *     arrow, a slash), + anything that is not negation-carrying. These set off
 *     a new element, so the only way negation crosses one is an explicit
 *     coordinator sharing the auxiliary or an explicit re-negation.
 *
 * Deliberately EXCLUDED: bare "and"/"or"/"yet"/"nor" with NO new subject, and a
 * bare comma. Those coordinate verb phrases that SHARE the negated auxiliary,
 * where the negation genuinely does distribute — "we will not rank you #1 or
 * get you to page one" is honest, so is "we do not guarantee rankings, promise
 * page one, or boost your visibility", and so is the parenthetical "we do not,
 * and will not, guarantee a higher ranking". Splitting there would over-block
 * honest copy, which is a real failure, not a safe default.
 *
 * KNOWN RESIDUALS — this guard is NOT exhaustive. These are left open on
 * purpose: each is surface-identical to honest copy, so closing it here would
 * over-block a real disclaimer, and over-blocking is a real failure too.
 * Closing them needs a part-of-speech tagger, not a longer regex.
 *   - A clausal negator + comma + a claim headed by a PARTICIPLE rather than a
 *     subject ("we don't cut corners, guaranteed top spot"). Indistinguishable
 *     by surface form from an honest coordinated object list ("we do not offer
 *     refunds, guaranteed placements, or free audits"), which must pass. Note
 *     the verbless "No hidden fees, guaranteed top spot" IS caught — a
 *     determiner-"no" fragment has no verb for the negation to attach to.
 *   - A comma + an OPEN-CLASS subject — a proper noun or a common noun
 *     ("…, Smile Dental gets you to page one"; "…, customers rank #1"). Only
 *     closed-class subjects are enumerated: admitting nouns, or capitalized
 *     words, would split honest object lists ("we do not promise rankings,
 *     Google placements, or page one").
 * The gate is defence in depth, not a proof. It is the last line, not the only
 * one: copy that reaches it should already be honest.
 */
const NEGATION_SCOPE_BOUNDARY = new RegExp(
  [
    // Sentence / clause punctuation and the ellipsis.
    "[.!?;:\\u2026]",
    // A paragraph break, or a new list item, ends a clause outright. A LONE
    // line break deliberately does NOT: generated copy is often soft-wrapped,
    // and "we do not\nguarantee a higher ranking" is one negated verb phrase.
    PARAGRAPH_BREAK,
    LIST_MARKER,
    // A line break or tab that introduces a new subject.
    `[\\n\\r\\u2028\\u2029\\t]${GAP}${NEW_SUBJECT}\\b`,
    // A leading subordinate clause, consumed through its closing comma.
    `\\b(?:while|whilst|although|though|whereas)\\b[^,\\uff0c\\u201a\\u3001.;:!?\\n]*${COMMA}`,
    // A leading verbless negated NP fragment, consumed through its closing
    // comma, unless the next segment carries the negation onward. The opening
    // anchor is a LOOKBEHIND, not a consuming match: sentence punctuation is
    // its own boundary alternative above and would otherwise eat the anchor
    // before this alternative could use it.
    `(?:^|(?<=[.!?;:\\n]))${GAP}(?:no|without)\\b[^,\\uff0c\\u201a\\u3001.;:!?\\n]*${COMMA}${GAP}(?!${NEGATION_CARRYING}\\b)`,
    // An adversative, conjunctive adverb, or causal subordinator, mid-sentence.
    // A reason clause ("not X because Y") asserts Y; the negation does not
    // reach it.
    "\\b(?:but|however|nevertheless|nonetheless|while|whilst|although|though|whereas|" +
      "instead|rather|conversely|otherwise|regardless|therefore|thus|hence|meanwhile|" +
      "besides|additionally|furthermore|moreover|consequently|accordingly|still|anyway|" +
      "ultimately|because|since)\\b",
    // A coordinating conjunction that introduces a new subject.
    `\\b(?:and|or|yet|so|then|plus)\\s{1,8}${NEW_SUBJECT}\\b`,
    // A comma or opening paren that introduces a new subject.
    `(?:${COMMA}|\\()${GAP}${NEW_SUBJECT}\\b`,
    // A dash or a block separator, unless it introduces negation-carrying
    // material. The lookahead re-skips whitespace on purpose: the separator's
    // trailing \s* can backtrack, and without it "— or get you to page one"
    // would read as a new clause instead of a continuation of the negated
    // auxiliary.
    `(?:${DASH_SEPARATOR}|${SYMBOL_SEPARATOR})(?!${GAP}${NEGATION_CARRYING}\\b)`,
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
 * POST-MODIFYING NEGATION — the negator that sits AFTER the claim.
 *
 * The scope walk above only reads BACKWARD from a match, so it sees a negator
 * only when the negator precedes the phrase. English routinely puts the claim in
 * SUBJECT position and the negator in the predicate that follows it:
 *
 *   "Permanent results are not guaranteed."
 *   "Ranking #1 on Google is not something we promise."
 *
 * Both are the most honest sentences a practice can publish, and a backward-only
 * gate blocks them. A blocked disclaimer is silent and absolute — the copy simply
 * cannot ship — whereas a missed boast still meets owner approval before publish.
 * So this direction matters more than the inventory below it.
 *
 * The shape recognized is narrow ON PURPOSE, because a trailing negator that
 * modifies a DIFFERENT constituent must not launder the claim:
 *
 *   "We guarantee first page placement, not just traffic."   ← must still BLOCK
 *
 * Negation is only read forward when the claim is the SUBJECT of its own negated
 * finite predicate. Two conditions, both required:
 *
 *   1. Between the claim and the negator there is only SUBJECT TAIL — at most two
 *      prepositional phrases continuing the subject noun phrase ("on Google",
 *      "in Google Maps for your practice"). No comma, no dash, no clause
 *      punctuation, and no finite verb can be crossed, which is what excludes the
 *      corrective "…, not just traffic" (a comma stops the tail) and the
 *      concessive "Top placement is our goal but rankings are not guaranteed"
 *      (a copula stops the tail).
 *   2. The claim is not the OBJECT of an asserting verb. "We promise top
 *      placement is not a problem" asserts the placement; the negator lives in a
 *      complement clause and does not reach the matrix assertion.
 */

/** Prepositions that can open a PP continuing a subject noun phrase. */
const SUBJECT_TAIL_PREPOSITION = "(?:on|in|for|of|at|from|to|with|across|within|near|around)";

/** A tail word: must OPEN with an alphanumeric, so a bare dash is never a tail. */
const SUBJECT_TAIL_WORD = "[A-Za-z0-9#][A-Za-z0-9'\\u2019-]{0,29}";

/**
 * At most two prepositional phrases of at most four words. Every quantifier is
 * bounded: an anchored match with unbounded runs is what turned a 2ms scan into
 * a 2.6s one on a previous pass.
 */
const SUBJECT_TAIL = `(?:\\s{1,8}${SUBJECT_TAIL_PREPOSITION}(?:\\s{1,8}${SUBJECT_TAIL_WORD}){1,4}){0,2}`;

/** Adverbs that may sit inside the auxiliary complex without breaking it. */
const PREDICATE_ADVERB =
  "(?:ever|even|really|truly|always|simply|just|actually|necessarily|generally|" +
  "typically|usually|currently|yet|still|likely|therefore|however)";

/** Contracted negative auxiliaries: isn't, can't (ca+n't), won't (wo+n't), cannot. */
const NEGATIVE_AUXILIARY =
  "(?:is|are|was|were|do|does|did|has|have|had|could|would|should|must|might|need|dare|ca|wo|sha)" +
  "n[\\u2019']?t\\b|cannot\\b";

/** Auxiliaries that take an explicit negator after them. */
const POSITIVE_AUXILIARY =
  "(?:is|are|was|were|am|be|been|being|do|does|did|has|have|had|can|could|will|would|shall|should|may|might|must)";

/**
 * A negated finite predicate, anchored directly after the claim's subject tail.
 * "is not", "are never", "cannot", "isn't", "do not", "has not been", "is no".
 */
const POST_MODIFYING_NEGATION = new RegExp(
  `${SUBJECT_TAIL}\\s{1,8}(?:${NEGATIVE_AUXILIARY}|` +
    `${POSITIVE_AUXILIARY}\\b(?:\\s{1,8}${PREDICATE_ADVERB}\\b){0,3}\\s{1,8}(?:not|never|no)\\b)`,
  "iy",
);

/**
 * An asserting verb immediately before the claim makes the claim that verb's
 * OBJECT, so a negator inside the claim's own predicate cannot undo the
 * assertion. Bounded to the characters just before the match — enough to see the
 * verb, and O(1) per match rather than a slice of everything preceding.
 */
const ASSERTING_VERB_BEFORE_CLAIM =
  /\b(?:guarantee|guarantees|guaranteed|promise|promises|promised|ensure|ensures|ensured|assure|assures|assured|deliver|delivers|delivered|secure|secures|secured|get|gets|give|gives)\s{1,8}(?:you\s{1,8}|your\s{1,8})?(?:that\s{1,8})?$/i;

/** How far back to look for an asserting verb governing the claim. */
const ASSERTING_VERB_LOOKBACK = 40;

/**
 * True when a negator AFTER the claim governs the claim — i.e. the claim is the
 * subject of its own negated finite predicate, and is not the object of an
 * asserting verb.
 */
function isNegatedByFollowingPredicate(text: string, matchStart: number, matchEnd: number): boolean {
  const lookbackFrom = Math.max(0, matchStart - ASSERTING_VERB_LOOKBACK);
  if (ASSERTING_VERB_BEFORE_CLAIM.test(text.slice(lookbackFrom, matchStart))) {
    return false;
  }
  POST_MODIFYING_NEGATION.lastIndex = matchEnd;
  return POST_MODIFYING_NEGATION.test(text);
}

/**
 * True when `pattern` matches `text` in at least one clause that is NOT negated.
 * Negation is localized to the clause governing each match (see
 * NEGATION_SCOPE_BOUNDARY) and read in BOTH directions — backward to the clause's
 * negator, and forward to a negated predicate the claim is the subject of — so an
 * honest disclaimer passes while a promise laundered behind an honest clause, or
 * behind a trailing negator that modifies something else, is still blocked.
 */
export function matchesUnnegated(text: string, pattern: RegExp): boolean {
  const scan = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let match: RegExpExecArray | null;
  while ((match = scan.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    const clause = before.slice(lastNegationScopeBoundaryEnd(before));
    const isNegated =
      RANK_PROMISE_NEGATORS.test(clause) ||
      isNegatedByFollowingPredicate(text, match.index, match.index + match[0].length);
    if (!isNegated) {
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
