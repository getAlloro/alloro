/**
 * The negation model for the honesty gate — the part that decides whether a
 * matched claim is NEGATED (§6.2 top-level shared service).
 *
 * Extracted from GeneratedCopySafetyService so each file has ONE responsibility
 * (§2.1) and neither passes the ~800-line ceiling (§2.4): that service owns the
 * inventory of WHAT counts as a claim, and this file owns WHETHER a matched
 * claim is denied. They change for different reasons — a new claim phrase is
 * lexical, a new negation shape is grammatical.
 *
 * The whole file exists to serve one asymmetry: a missed boast still meets owner
 * approval before publish, but a wrongly-blocked disclaimer is silent and
 * absolute — the copy simply cannot ship, and nothing downstream catches it. So
 * every rule here is deliberately narrow, and every residual is a MISS rather
 * than an over-block. This is a conservative filter over grammar, not a proof.
 */

/**
 * Negation guard. A raw phrase regex false-positives on an honest disclaimer
 * that NEGATES the promise ("we make no google ranking promises", "structured
 * data does not guarantee a higher ranking"), so a match only counts when the
 * clause governing it is not negated.
 *
 * The token inventory is UNCHANGED from the round that verified it. What changed
 * is that finding a token is no longer the whole test — see hasGoverningNegator.
 */
const RANK_PROMISE_NEGATORS =
  /\b(?:no|not|never|don'?t|doesn'?t|won'?t|without|cannot|can'?t|isn'?t|aren'?t|avoid)\b/gi;

/**
 * A NEGATOR THAT NEGATES NOTHING.
 *
 * Finding a negator token in the clause was the whole negation test, so a token
 * that governs no predicate laundered whatever followed it: `"No-hassle
 * guaranteed top placement"` passed because the clause contained `no`. The token
 * is real; its scope is not the claim. Three shapes, each a class rather than a
 * string, and each is a way a negator can be bound to something that is not a
 * predicate:
 *
 *   A. COMPOUND-BOUND. A negator joined by a hyphen into a compound modifier —
 *      the negator belongs to the compound, not to a clause. Structural, so it
 *      covers the whole compound space rather than an inventory of compounds.
 *   B. IDIOM-BOUND. A negator whose head makes a fixed adverbial or intensifier.
 *      Many of these ("without fail", "no doubt", "can't beat") do not merely
 *      fail to negate — they ASSERT, which makes reading them as negation
 *      exactly backwards. Lexical, so it is an inventory and NOT exhaustive.
 *   C. FRAGMENT-BOUND. A determiner `no`/`without` whose noun is juxtaposed
 *      against the claim with no preposition linking them — a verbless NP
 *      fragment ("No hassle | guaranteed top placement"), whose scope cannot
 *      reach a following predication.
 *
 * Each rule DEMOTES ONE OCCURRENCE, never the clause: a clause carrying both a
 * false negator and a real one is still negated ("There is no doubt that we
 * cannot guarantee rankings" passes on `cannot`).
 *
 * KNOWN RESIDUALS — not exhaustive, and left open deliberately.
 *   - UNHYPHENATED SINGLE-NOUN FRAGMENT. A determiner-"no" with exactly ONE noun
 *     between it and the claim is surface-identical to a determiner-"no" with
 *     one ADJECTIVE between it and the claim — "no <noun> <claim>" versus "no
 *     <participle> <claim>". The first launders; the second is an honest
 *     disclaimer that must pass. Telling a noun from a participial adjective
 *     needs a POS tagger, not a longer regex, and every lexical proxy tried
 *     (suffix shape, a closed adjective list) blocks honest copy carrying an
 *     adjective nobody listed. That is the silent failure, so the miss is taken
 *     instead. The HYPHENATED form — how this compound is almost always
 *     written — is caught by Rule A.
 *   - IDIOM INVENTORY. Rule B is lexical, so it covers the idioms named in it
 *     and no others. English has an open set of them.
 *   - Both are misses, not over-blocks: a missed boast still meets owner
 *     approval before publish, which is the direction this gate errs in.
 */

/** RULE A — a hyphen binding the negator into a compound modifier. */
const COMPOUND_BOUND_NEGATOR = /^-[A-Za-z]/;

/**
 * RULE B — heads that make a negator idiomatic rather than clausal. Keyed by the
 * negator, because the head set is what distinguishes "without delay" (an
 * adverb of time) from "without a guarantee" (real negation).
 */
const IDIOM_BOUND_NEGATOR: Record<string, RegExp> = {
  // "other", and a bare "less"/"fewer"/"later", are NOT here, and the omission is
  // load-bearing. Each was tried and each BLOCKED honest copy: "no other
  // guarantees about your google ranking" and "no less binding a promise about
  // your google ranking" are disclaimers, and demoting their negator silently
  // blocked them. Only the comparative-THAN forms ("no less than") are the fixed
  // quantifier idiom; the bare adjective forms negate normally.
  no: /^\s{1,8}(?:doubt|question|wonder|matter|problem|worries|sweat|brainer|nonsense|strings\b|contest\b|end\b|end\s{1,8}of|less\s{1,8}than\b|fewer\s{1,8}than\b|later\s{1,8}than\b)/i,
  // "only" is NOT here, for the same reason "other" is absent above. `not only`
  // negates EXCLUSIVITY, and it really does scope over what follows: "Good
  // dentistry is not only about your google rankings" is honest copy that makes
  // no ranking promise, and demoting its negator blocked it. The boast reading
  // ("we not only guarantee top placement") is the rarer phrasing, so the miss
  // is taken rather than the over-block.
  not: /^\s{1,8}(?:to\s{1,8}mention\b|to\s{1,8}worry\b)/i,
  never: /^\s{1,8}(?:mind\b|fear\b|been\s{1,8}easier\b|easier\b|better\b)/i,
  without: /^\s{1,8}(?:delay|fail|question|doubt|exception|hesitation|reservation|equal|peer|rival|parallel|precedent|compare|match\b|further\s{1,8}ado|missing\s{1,8}a\s{1,8}beat|a\s{1,8}(?:doubt|hitch|question))/i,
  cannot: /^\s{1,8}(?:be\s{1,8}beat|beat\b|miss\b|lose\b|go\s{1,8}wrong|wait\b)/i,
  "can't": /^\s{1,8}(?:be\s{1,8}beat|beat\b|miss\b|lose\b|go\s{1,8}wrong|wait\b)/i,
  cant: /^\s{1,8}(?:be\s{1,8}beat|beat\b|miss\b|lose\b|go\s{1,8}wrong|wait\b)/i,
  "don't": /^\s{1,8}(?:miss\b|wait\b|hesitate\b|worry\b)/i,
  dont: /^\s{1,8}(?:miss\b|wait\b|hesitate\b|worry\b)/i,
};

/**
 * RULE C — a preposition or complementizer linking the negated noun to the
 * claim. Its PRESENCE is what proves the claim is the negated noun's complement
 * ("no promises ABOUT your google ranking", "no control OVER your google
 * ranking") rather than a separate fragment juxtaposed against it ("no hassle |
 * guaranteed top placement"). Honest disclaimers overwhelmingly carry one, which
 * is what keeps this rule from over-blocking them.
 */
const NEGATOR_COMPLEMENT_LINK =
  /\b(?:about|of|on|over|for|regarding|concerning|as|to|in|that|toward|towards|around|upon|with|from|whatsoever|beyond)\b/i;

/**
 * How many words may sit between a determiner `no`/`without` and the claim while
 * the negator still reaches it WITHOUT a linking preposition. One allows the
 * participial adjective of "no GUARANTEED higher ranking"; two would admit the
 * "No hassle guaranteed top placement" fragment this rule exists to catch.
 */
const MAX_UNLINKED_WORDS_TO_CLAIM = 1;

/** Negators that can head a verbless NP fragment, and so need Rule C. */
const DETERMINER_NEGATORS = new Set(["no", "without"]);

/**
 * Widest window an IDIOM_BOUND_NEGATOR head can occupy — its leading whitespace
 * run plus its longest phrase, with room to spare so the `\b` that closes each
 * head always has the following character to look at. Bounded so the idiom test
 * is O(1) per negator rather than O(clause).
 */
const IDIOM_HEAD_WINDOW = 64;

/** Enough characters to see the hyphen and the letter Rule A needs. */
const COMPOUND_WINDOW = 2;

/**
 * Index where the LAST complement link in `clause` starts, or -1. Computed once
 * per clause: a link "inside the span after negator N" is exactly a link
 * starting at or after N's end, because the span always runs to the clause end.
 * Scanning per negator instead made a clause of many negators quadratic.
 */
function lastComplementLinkIndex(clause: string): number {
  const scan = new RegExp(NEGATOR_COMPLEMENT_LINK.source, "gi");
  let index = -1;
  let match: RegExpExecArray | null;
  while ((match = scan.exec(clause)) !== null) {
    index = match.index;
    if (match.index === scan.lastIndex) {
      scan.lastIndex++;
    }
  }
  return index;
}

/**
 * Number of whitespace-separated words in `clause` from `start` on, counted only
 * as far as `limit`. Early-exit so a long clause costs no more than a short one.
 */
function countWordsFrom(clause: string, start: number, limit: number): number {
  let words = 0;
  let index = start;
  while (index < clause.length) {
    while (index < clause.length && /\s/.test(clause[index])) {
      index++;
    }
    if (index >= clause.length) {
      break;
    }
    words++;
    if (words > limit) {
      return words;
    }
    while (index < clause.length && !/\s/.test(clause[index])) {
      index++;
    }
  }
  return words;
}

/**
 * True when `clause` carries a negator that actually governs the claim sitting
 * immediately after it. Replaces the old "clause contains a negator token" flag,
 * which any negator anywhere in the clause could trip.
 *
 * Every per-negator test is O(1) — a bounded window for Rules A and B, an
 * early-exiting word count and one precomputed link index for Rule C — so the
 * walk stays linear in the clause however many negators it holds.
 */
function hasGoverningNegator(clause: string): boolean {
  const scan = new RegExp(RANK_PROMISE_NEGATORS.source, RANK_PROMISE_NEGATORS.flags);
  let linkIndex: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = scan.exec(clause)) !== null) {
    const token = match[0].toLowerCase().replace(/’/g, "'");
    const end = match.index + match[0].length;
    const isCompoundBound = COMPOUND_BOUND_NEGATOR.test(clause.slice(end, end + COMPOUND_WINDOW));
    const idiom = IDIOM_BOUND_NEGATOR[token];
    const isIdiomBound = idiom !== undefined && idiom.test(clause.slice(end, end + IDIOM_HEAD_WINDOW));
    if (!isCompoundBound && !isIdiomBound) {
      if (!DETERMINER_NEGATORS.has(token)) {
        return true;
      }
      if (countWordsFrom(clause, end, MAX_UNLINKED_WORDS_TO_CLAIM) <= MAX_UNLINKED_WORDS_TO_CLAIM) {
        return true;
      }
      if (linkIndex === null) {
        linkIndex = lastComplementLinkIndex(clause);
      }
      if (linkIndex >= end) {
        return true;
      }
    }
    if (match.index === scan.lastIndex) {
      scan.lastIndex++;
    }
  }
  return false;
}

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
 * The FORWARD direction's "negator that negates nothing" — the mirror of the
 * backward rules above. `"Ranking #1 on Google has never been easier"` and `"Top
 * placement is no problem"` satisfy the forward guard exactly: the claim IS the
 * subject and the predicate IS negated. The guard is right about the grammar and
 * wrong about the meaning — both idioms ASSERT the claim is easy rather than
 * denying it is promised.
 *
 * Two shapes, each kept narrow in the direction that protects disclaimers:
 *   - `never` + `been` + a bare comparative. `not`/`no` are untouched, so "A
 *     higher ranking has not been promised" and "Top placement is not more
 *     important than trust" keep passing.
 *   - The "no problem" family, closed by a PREPOSITIONAL PHRASE or the clause
 *     end — never by an arbitrary continuation. "Top placement is no problem for
 *     us" is the idiom and the most natural way to write the boast; "First page
 *     placement is not a problem we can solve" is a genuine denial. What
 *     separates them is that a PP ("for us", "at all", "for a practice like
 *     yours") continues the idiom, while a finite clause ("we can solve") makes
 *     it a real predicate. Requiring one of those two endings — rather than
 *     allowing anything to follow — is what keeps the denial passing.
 */
const IDIOM_TRAILING_PHRASE = "(?:\\s{1,8}(?:for|at|to|with|in)\\s{1,8}(?:\\w{1,20}\\s{1,8}){0,4}\\w{1,20})?";

const NON_DENYING_PREDICATE_TAIL = new RegExp(
  "^\\s{1,8}(?:" +
    "been\\s{1,8}(?:easier|simpler|faster|better|closer|cheaper|quicker|stronger|clearer)\\b" +
    `|(?:an?\\s{1,8})?(?:problem|issue|trouble|sweat|big\\s{1,8}deal)${IDIOM_TRAILING_PHRASE}` +
    "(?=\\s{0,8}(?:[.!?;:,]|$))" +
    ")",
  "i",
);

/**
 * True when a negator AFTER the claim governs the claim — i.e. the claim is the
 * subject of its own negated finite predicate, is not the object of an asserting
 * verb, and the negated predicate actually DENIES rather than idiomatically
 * asserting.
 */
function isNegatedByFollowingPredicate(text: string, matchStart: number, matchEnd: number): boolean {
  const lookbackFrom = Math.max(0, matchStart - ASSERTING_VERB_LOOKBACK);
  if (ASSERTING_VERB_BEFORE_CLAIM.test(text.slice(lookbackFrom, matchStart))) {
    return false;
  }
  POST_MODIFYING_NEGATION.lastIndex = matchEnd;
  const negation = POST_MODIFYING_NEGATION.exec(text);
  if (negation === null) {
    return false;
  }
  return !NON_DENYING_PREDICATE_TAIL.test(text.slice(matchEnd + negation[0].length));
}

/**
 * True when `pattern` matches `text` in at least one clause that is NOT negated.
 * Negation is localized to the clause governing each match (see
 * NEGATION_SCOPE_BOUNDARY) and read in BOTH directions — backward to a clause
 * negator that GOVERNS the claim (see hasGoverningNegator), and forward to a
 * negated predicate the claim is the subject of — so an honest disclaimer passes
 * while a promise laundered behind an honest clause, behind a trailing negator
 * that modifies something else, or behind a negator that negates nothing, is
 * still blocked.
 *
 * CONTRACT: `text` must already have been through `normalizeForMatching`. Every
 * pattern here is ASCII, and unnormalized copy defeats ASCII patterns by
 * encoding alone — the name says so because passing raw copy is a silent bypass,
 * not an error.
 */
export function matchesUnnegatedInNormalizedCopy(text: string, pattern: RegExp): boolean {
  const scan = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let match: RegExpExecArray | null;
  while ((match = scan.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    const clause = before.slice(lastNegationScopeBoundaryEnd(before));
    const isNegated =
      hasGoverningNegator(clause) ||
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
