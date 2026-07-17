import {
  COMMA,
  DASH_SEPARATOR,
  GAP,
  lastNegationScopeBoundaryEnd,
  LINE_BREAK,
  NEW_SUBJECT,
} from "./claimNegationBoundary";

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
 * RULE D — a determiner negator whose NP is the SUBJECT OF A FINITE VERB.
 *
 * Rules A–C ask how far the negator sits from the claim, because a determiner
 * negator heading a VERBLESS fragment cannot reach a following predication. But
 * once its NP takes a finite verb, the negator is clausal and scopes over the
 * whole predicate however long the subject is:
 *
 *   "No dentist can guarantee results."      "No treatment is guaranteed to be pain-free."
 *   "No practice guarantees top placement."  "No agency can guarantee a higher ranking."
 *
 * Every one of these is the plainest honest sentence in the disclaimer space, and
 * every one BLOCKED — the word-distance test saw two words ("dentist can") where
 * it allows one, and no linking preposition, so it read a real clausal negation
 * as a fragment. Measured as a class, not a string: ten of ten natural
 * "no <subject> <verb> <claim>" disclaimers blocked before this rule.
 *
 * The verb set is deliberately CLOSED to auxiliaries, modals, copulas and the
 * promise verbs. Widening it toward "any verb" would launder a fragment whose
 * second word merely looks verbal.
 *
 * The subject words the rule may skip carry a NEW_SUBJECT lookahead, and it is
 * load-bearing: without it "No one doubts we guarantee top placement" PASSED —
 * a MEASURED laundering caught by this round's own guard fixture. The skip
 * hopped over the real finite verb ("doubts") and landed on the claim's verb.
 * A new subject pronoun means the claim sits in a COMPLEMENT clause with its own
 * subject, so the negation scopes over the matrix verb and never reaches it.
 */
const FINITE_VERB_AFTER_NEGATED_SUBJECT = new RegExp(
  `^\\s{1,8}(?:(?!${NEW_SUBJECT}\\b)\\w{1,20}\\s{1,8}){0,3}(?:` +
    "is|are|was|were|be|been|am|has|have|had|do|does|did|" +
    "can|could|will|would|shall|should|may|might|must|" +
    "guarantees?|promises?|ensures?|assures?|delivers?|offers?|provides?|claims?|ranks?" +
    ")\\b",
  "i",
);

/**
 * Widest window Rule D reads — three subject words plus the verb, with room to
 * spare. Bounded so the test stays O(1) per negator rather than O(clause).
 */
const FINITE_VERB_WINDOW = 128;

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
 * Ordinary negators still need a governing relationship. A copular denial
 * cannot silently carry across a coordinator into a separate positive finite
 * predicate:
 *
 *   "This is not complicated and guarantees top placement."
 *
 * The `is not complicated` predicate is complete before `guarantees`; the
 * negation does not reach the promise. This is different from a shared negative
 * auxiliary ("we do not guarantee rankings or promise page one"), where both
 * bare verb phrases genuinely remain under `do not`.
 */
const COPULAR_NEGATOR_TOKENS = new Set(["isn't", "isnt", "aren't", "arent"]);
const COPULAR_AUXILIARY_BEFORE_NEGATOR =
  /\b(?:am|is|are|was|were|be|been|being)(?:\s{1,8}(?:really|simply|actually|necessarily|generally|typically|usually|currently|still|always|ever|even)){0,3}\s{1,8}$/i;
const COPULAR_COMPLEMENT_AFTER_NEGATOR = /^\s{1,8}be\b/i;
/** Bounded non-negating modifiers around a coordinated finite predicate. */
const POSITIVE_PREDICATE_MODIFIER =
  "(?:(?!(?:no|not|never|without|cannot|can'?t|won'?t|don'?t|doesn'?t|" +
  "isn'?t|aren'?t|hardly|scarcely|barely)\\b)[a-z][a-z'-]{0,23}\\s{1,8})";
const PREDICATE_NEGATOR =
  "(?:no|not|never|without|cannot|can'?t|won'?t|don'?t|doesn'?t|" +
  "isn'?t|aren'?t|hardly|scarcely|barely)";
const COORDINATED_FINITE_PREDICATE = new RegExp(
  `\\b(?:and|or|yet)\\s{1,8}(?:${POSITIVE_PREDICATE_MODIFIER}){0,3}(?:` +
    `(?:will|would|can|could|may|might|shall|should|must)\\s{1,8}` +
    `(?:${POSITIVE_PREDICATE_MODIFIER}){0,3}[a-z][a-z'-]{1,23}\\b|` +
    `(?:am|is|are|was|were|has|have|had|do|does|did|` +
    `[a-z][a-z'-]{1,23}(?:s|ed))\\b` +
    `)(?!\\s{1,8}(?:${POSITIVE_PREDICATE_MODIFIER}){0,3}${PREDICATE_NEGATOR}\\b)`,
  "i",
);
const COORDINATED_AVOID_PREDICATE = new RegExp(
  `\\b(?:and|or|yet)\\s{1,8}(?:${POSITIVE_PREDICATE_MODIFIER}){0,3}` +
    `[a-z][a-z'-]{1,23}\\b` +
    `(?!\\s{1,8}(?:${POSITIVE_PREDICATE_MODIFIER}){0,3}${PREDICATE_NEGATOR}\\b)`,
  "i",
);

/**
 * True when an ordinary (non-determiner) negator governs this matched claim.
 * Clause boundaries have already localized the input. Within that clause,
 * copular and `avoid` predicates stop before a separately coordinated positive
 * claim; negative do/modal auxiliaries continue to distribute normally.
 */
function ordinaryNegatorGovernsClaim(
  token: string,
  clause: string,
  matchIndex: number,
  negatorEnd: number,
  claim: string,
): boolean {
  const throughClaim = clause.slice(negatorEnd) + claim;
  if (token === "avoid") {
    return !COORDINATED_AVOID_PREDICATE.test(throughClaim);
  }
  const beforeNegator = clause.slice(0, matchIndex);
  const hasCopularFrame =
    COPULAR_NEGATOR_TOKENS.has(token) ||
    ((token === "not" || token === "never") && COPULAR_AUXILIARY_BEFORE_NEGATOR.test(beforeNegator)) ||
    COPULAR_COMPLEMENT_AFTER_NEGATOR.test(clause.slice(negatorEnd));
  return !hasCopularFrame || !COORDINATED_FINITE_PREDICATE.test(throughClaim);
}

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
function hasGoverningNegator(clause: string, claim: string): boolean {
  const scan = new RegExp(RANK_PROMISE_NEGATORS.source, RANK_PROMISE_NEGATORS.flags);
  let linkIndex: number | null = null;
  // Hoisted: the claim does not change across negators, so slicing it per
  // negator made a clause of many negators pay for the same substring N times.
  let claimHead: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = scan.exec(clause)) !== null) {
    const token = match[0].toLowerCase().replace(/’/g, "'");
    const end = match.index + match[0].length;
    const isCompoundBound = COMPOUND_BOUND_NEGATOR.test(clause.slice(end, end + COMPOUND_WINDOW));
    const idiom = IDIOM_BOUND_NEGATOR[token];
    const isIdiomBound = idiom !== undefined && idiom.test(clause.slice(end, end + IDIOM_HEAD_WINDOW));
    if (!isCompoundBound && !isIdiomBound) {
      if (!DETERMINER_NEGATORS.has(token)) {
        if (ordinaryNegatorGovernsClaim(token, clause, match.index, end, claim)) {
          return true;
        }
      } else {
        if (countWordsFrom(clause, end, MAX_UNLINKED_WORDS_TO_CLAIM) <= MAX_UNLINKED_WORDS_TO_CLAIM) {
          return true;
        }
        // RULE D — the NP takes a finite verb, so the negation is clausal and
        // reaches the predicate however long the subject is.
        //
        // The CLAIM is appended to the region scanned, because a claim pattern can
        // begin AT the finite verb it needs: in "no SEO work | GUARANTEES a higher
        // ranking" the verb is the first word of the match, leaving a verbless "no
        // SEO work" behind it. Scanning only the text before the match made the
        // same grammar pass or block depending on which pattern happened to match
        // first — "no practice guarantees top placement" passed while "no SEO work
        // guarantees a higher ranking" blocked.
        if (claimHead === null) {
          claimHead = claim.slice(0, FINITE_VERB_WINDOW);
        }
        if (FINITE_VERB_AFTER_NEGATED_SUBJECT.test(clause.slice(end, end + FINITE_VERB_WINDOW) + claimHead)) {
          return true;
        }
        if (linkIndex === null) {
          linkIndex = lastComplementLinkIndex(clause);
        }
        if (linkIndex >= end) {
          return true;
        }
      }
    }
    if (match.index === scan.lastIndex) {
      scan.lastIndex++;
    }
  }
  return false;
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
 * POST-CLAIM DENIAL FRAGMENT — the ELLIPTICAL denial.
 *
 * POST_MODIFYING_NEGATION above only recognizes a negated FINITE predicate whose
 * subject is the claim ("Permanent results ARE not guaranteed"). Headlines,
 * captions, FAQ answers and disclaimer lines routinely elide the copula and set
 * the denial off with punctuation instead:
 *
 *   "Top placement? Not guaranteed."      "Higher rankings: not guaranteed."
 *   "Permanent results — never promised." "First page placement (not a given)."
 *
 * Every one of these is the claim followed by its own denial, and every one of
 * them BLOCKED, because the finite-predicate model cannot cross the punctuation
 * and finds no auxiliary on the far side. This is the silent over-block
 * direction: the practice cannot publish the most honest line it has.
 *
 * The fragment is bounded on all four sides, because a trailing fragment that
 * denies something OTHER than the claim must not launder it:
 *
 *   "Top placement? Not just traffic."   ← a CORRECTIVE. Must still BLOCK.
 *   "Top placement? No problem."         ← an IDIOM that asserts. Must BLOCK.
 *
 * What separates a denial from a corrective is the HEAD the negator lands on,
 * not the negator and not the punctuation — both of those are identical across
 * the two. So the head is a closed set of DENIAL vocabulary (the "guaranteed"
 * participle family, the "guarantee"/"given" noun family), and a head outside it
 * is not read as a denial at all. "traffic" and "problem" are not in it, which is
 * what keeps the correctives blocked without a rule aimed at their strings.
 *
 * The asserting-verb guard is REUSED unchanged: "We guarantee top placement. Not
 * guaranteed." keeps blocking, because a verb that asserts the claim outranks any
 * fragment that follows it.
 *
 * KNOWN RESIDUALS — narrow on purpose, and NOT exhaustive. Measured by this
 * round's own adversary pass, and left open with the reason, not papered over.
 *   - RE-ASSERTION IN A FOLLOWING SENTENCE. The fragment is read correctly, and a
 *     SEPARATE sentence after it takes the claim back. Catching that means
 *     judging whether the next sentence reverses the denial, which is semantic:
 *     every lexical proxy tried over-blocked honest copy, because a sentence that
 *     merely CONTINUES a disclaimer is surface-identical to one that reverses it.
 *     These are MISSES — a missed boast still meets owner approval before publish
 *     — so the miss is taken over the over-block, on purpose. (Category only: the
 *     repo is public, so this residual's concrete shapes stay out of source.) The
 *     tightly-bound comma form of the same idea IS closed, above.
 *   - The denial head is a LEXICAL inventory. A denial written on a head nobody
 *     listed ("Top placement? Not on the table.") still blocks. That is an
 *     over-block, and it is the honest cost of keeping "not just traffic"
 *     blocked without a part-of-speech tagger: the two are surface-identical
 *     apart from the head word. The inventory covers the denial vocabulary this
 *     copy actually uses; it can be widened as real copy shows up.
 *   - "just"/"only" are deliberately EXCLUDED from the adverb set. They mark a
 *     correction ("not just traffic"), never a denial, so admitting them would
 *     open exactly the laundering shape this fragment must not admit.
 */

/** Punctuation that can set a denial fragment off from the claim it denies. */
const DENIAL_FRAGMENT_BOUNDARY =
  `(?:${GAP}[.!?;:\\u2026]${GAP}|${DASH_SEPARATOR}|${GAP}${COMMA}${GAP}|${GAP}\\(${GAP}|${LINE_BREAK}${GAP})`;

/** The negators that can head an elliptical denial. */
const DENIAL_NEGATOR = "(?:not|never|no)";

/**
 * Adverbs that may sit between the negator and its head. "just" and "only" are
 * absent BY DESIGN — they mark a corrective, not a denial.
 */
const DENIAL_ADVERB =
  "(?:ever|always|necessarily|generally|typically|usually|currently|strictly|" +
  "absolutely|entirely|fully|remotely|really|truly|automatically)";

/** The participle/adjective family a denial lands on. */
const DENIAL_ADJECTIVE =
  "(?:guaranteed|promised|assured|ensured|granted|implied|certain|typical|" +
  "permanent|automatic|instant|immediate|inevitable|predictable|controllable|" +
  "possible|definite|fixed|forever|owed)";

/** The noun family a denial lands on, with or without its determiner. */
const DENIAL_NOUN = "(?:guarantees?|promises?|certainty|certainties|given|sure\\s{1,8}thing|lock)";
const DENIAL_DETERMINER = "(?:an?|our|any|the)";

/** "not something we promise", "not something anyone can guarantee". */
const DENIAL_SOMETHING =
  "something\\s{1,8}(?:we|you|anyone|any\\s{1,8}\\w{1,20})\\s{1,8}(?:can\\s{1,8})?" +
  "(?:promise|guarantee|control|offer|sell|claim)s?";

const DENIAL_HEAD =
  `(?:(?:${DENIAL_ADVERB}\\s{1,8}){0,2}${DENIAL_ADJECTIVE}` +
  `|(?:${DENIAL_DETERMINER}\\s{1,8})?${DENIAL_NOUN}` +
  `|${DENIAL_SOMETHING})`;

/**
 * A bounded tail continuing the denial — a PP ("by anyone", "at all", "in any
 * way") or a trailing adverb ("ever"). Bounded like every other run here.
 */
const DENIAL_TAIL =
  `(?:\\s{1,8}(?:by|for|at|in|to|with|on|of|from)\\s{1,8}(?:\\w{1,20}\\s{1,8}){0,3}\\w{1,20}` +
  `|\\s{1,8}${DENIAL_ADVERB})?`;

/**
 * Material that CONTINUES a denial past a comma ("not guaranteed, and never
 * promised"; "not guaranteed, ever").
 *
 * NEGATION_CARRYING is deliberately NOT reused here even though it is the same
 * idea in the backward direction: it contains "but"/"yet", and after a denial
 * fragment an adversative REVERSES rather than continues — "not a promise, but a
 * fact" asserts the claim. The backward set can afford them; this one cannot.
 */
const DENIAL_CONTINUATION = "(?:and|or|nor|not|never|no|neither|nothing|ever|period|at\\s{1,8}all)";

/**
 * The fragment must END at a clause end. A head that runs on into a finite
 * clause is a different sentence doing different work, and is not read here.
 *
 * A COMMA only ends the fragment when what follows CONTINUES the denial. This is
 * load-bearing, and it was a MEASURED laundering in this round's own adversary
 * pass: with a bare comma accepted, "<claim>. Not a promise, a fact." passed —
 * the denial noun satisfied the fragment and the phrase after the comma quietly
 * reversed it. Requiring the continuation is what separates "not guaranteed,
 * ever" (a denial) from "not a promise, a fact" (an assertion wearing one).
 */
const DENIAL_CLAUSE_END =
  `(?=\\s{0,8}(?:[.!?;:)\\u2026]|$|${COMMA}${GAP}${DENIAL_CONTINUATION}\\b))`;

const POST_CLAIM_DENIAL_FRAGMENT = new RegExp(
  `${SUBJECT_TAIL}${DENIAL_FRAGMENT_BOUNDARY}${DENIAL_NEGATOR}\\b\\s{1,8}${DENIAL_HEAD}${DENIAL_TAIL}${DENIAL_CLAUSE_END}`,
  "iy",
);

/**
 * A cheap NECESSARY CONDITION for the fragment, tested on a bounded window
 * before the pattern above is attempted.
 *
 * The full pattern is anchored, so it never scans forward — but it carries nested
 * bounded quantifiers (the subject tail) and fails only after exploring them, and
 * it is attempted once per matched claim. Most claims are followed by ordinary
 * prose, so most of that work buys nothing. Every fragment must contain a
 * boundary character followed by a denial negator, and no honest disclaimer can
 * match the full pattern without first passing this one, so a fragment the
 * precheck rejects could not have matched anyway.
 */
const DENIAL_FRAGMENT_NEARBY = /[.!?;:,(\n…—–―‒-]\s{0,8}(?:not|never|no)\b/i;

/**
 * How far past the claim the precheck reads. Must cover the widest subject tail
 * the full pattern allows plus its boundary and negator, or the precheck could
 * reject a fragment the pattern would have matched — a silent over-block.
 */
const DENIAL_FRAGMENT_WINDOW = 320;

/**
 * True when a negator AFTER the claim governs the claim — i.e. the claim is the
 * subject of its own negated finite predicate, or is denied by an elliptical
 * denial fragment set off from it by punctuation. In both directions the claim
 * must not be the object of an asserting verb, and the negation must actually
 * DENY rather than idiomatically assert.
 */
function isNegatedByFollowingPredicate(text: string, matchStart: number, matchEnd: number): boolean {
  const lookbackFrom = Math.max(0, matchStart - ASSERTING_VERB_LOOKBACK);
  if (ASSERTING_VERB_BEFORE_CLAIM.test(text.slice(lookbackFrom, matchStart))) {
    return false;
  }
  POST_MODIFYING_NEGATION.lastIndex = matchEnd;
  const negation = POST_MODIFYING_NEGATION.exec(text);
  if (negation !== null) {
    return !NON_DENYING_PREDICATE_TAIL.test(text.slice(matchEnd + negation[0].length));
  }
  if (!DENIAL_FRAGMENT_NEARBY.test(text.slice(matchEnd, matchEnd + DENIAL_FRAGMENT_WINDOW))) {
    return false;
  }
  POST_CLAIM_DENIAL_FRAGMENT.lastIndex = matchEnd;
  return POST_CLAIM_DENIAL_FRAGMENT.test(text);
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
      hasGoverningNegator(clause, match[0]) ||
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
