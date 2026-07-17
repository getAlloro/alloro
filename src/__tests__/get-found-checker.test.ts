import { describe, it, expect } from "vitest";
import {
  scoreSchemaCompleteness,
  LOCAL_BUSINESS_FIELDS,
} from "../services/ai-seo-audit/schemaCompletenessScoring";
import {
  runGetFoundChecker,
  INTERNAL_AEO_INCOMPLETE_SIGNAL,
} from "../services/ai-seo-audit/getFoundChecker";
import { lintAnswerFirstStructure } from "../services/ai-seo-audit/answerFirstStructureLint";
import { GeneratedCopySafetyService } from "../services/content-safety/GeneratedCopySafetyService";

/**
 * Alloro Funnel Engine — Slice 1a (get-found) proofs. Locks the three behaviors
 * the spec's Test section requires: the completeness missing-field set, the
 * honesty lint's block/pass boundary, and that "AEO-incomplete" gates nothing
 * and never surfaces in owner-facing copy.
 */

// A LocalBusiness entry carrying only @type/name/address/telephone — everything
// else in LOCAL_BUSINESS_FIELDS is deliberately absent.
const INCOMPLETE_LOCAL_BUSINESS = {
  "@context": "https://schema.org",
  "@type": "Dentist",
  name: "Bright Smiles Dental",
  address: {
    "@type": "PostalAddress",
    streetAddress: "123 Main St",
    addressLocality: "Austin",
    addressRegion: "TX",
    postalCode: "78701",
  },
  telephone: "+1-512-555-0100",
};

const EXPECTED_MISSING = ["areaServed", "geo", "image", "openingHours", "priceRange", "sameAs", "url"];

function pageWithSchema(schema: object, body = ""): string {
  return `<!doctype html><html><head>
    <script type="application/ld+json">${JSON.stringify(schema)}</script>
    </head><body>${body}</body></html>`;
}

describe("scoreSchemaCompleteness — missing-field set", () => {
  it("returns exactly the fields absent from an incomplete LocalBusiness", () => {
    const result = scoreSchemaCompleteness([INCOMPLETE_LOCAL_BUSINESS]);

    expect(result.hasGradableEntity).toBe(true);
    expect(result.missingFields).toEqual(EXPECTED_MISSING);
    // Present fields are the four we supplied.
    expect(result.entities[0].presentFields.sort()).toEqual(
      ["@type", "address", "name", "telephone"].sort(),
    );
    // aeoIncomplete is set (internal signal) but is just a boolean, not a gate.
    expect(result.aeoIncomplete).toBe(true);
  });

  it("grades only real schema.org fields (no invented field ever appears)", () => {
    const result = scoreSchemaCompleteness([INCOMPLETE_LOCAL_BUSINESS]);
    for (const field of [...result.entities[0].presentFields, ...result.entities[0].missingFields]) {
      expect(LOCAL_BUSINESS_FIELDS).toContain(field);
    }
  });

  it("reports no gradable entity for schema with no business/service/FAQ type", () => {
    const result = scoreSchemaCompleteness([{ "@type": "WebSite", name: "x" }]);
    expect(result.hasGradableEntity).toBe(false);
    expect(result.missingFields).toEqual([]);
  });
});

/**
 * Answer-first boundary regressions. The first implementation computed a
 * `firstFormIndex` but never applied it: it scanned the first six <p> elements
 * wherever they sat, so an answer BELOW the first form — or far down the page —
 * wrongly passed. These lock the document-order walk and its boundaries.
 */
describe("answer-first lint — document-order boundary", () => {
  // 32 words — comfortably over the MIN_ANSWER_WORDS (25) substantive-answer bar.
  const LONG_ANSWER =
    "Bright Smiles Dental is a family dental practice in Austin, Texas, offering routine cleanings, fillings, crowns, implants, and teeth whitening, with same week appointments available for new patients who need urgent care.";
  const QUESTION_HEADING = "<h1>Is Bright Smiles Dental accepting new patients?</h1>";

  it("PASSES when the substantive answer appears before the first form", () => {
    const result = lintAnswerFirstStructure(
      `<!doctype html><html><body>
        ${QUESTION_HEADING}
        <p>${LONG_ANSWER}</p>
        <form><input name="email" /><button>Book</button></form>
      </body></html>`,
    );
    expect(result.flags).not.toContain("answer_not_first");
    expect(result.details.boundary).toBeNull();
  });

  it("FLAGS a substantive paragraph that only appears AFTER the first form", () => {
    const result = lintAnswerFirstStructure(
      `<!doctype html><html><body>
        ${QUESTION_HEADING}
        <p>Yes.</p>
        <form><input name="email" /><button>Book</button></form>
        <p>${LONG_ANSWER}</p>
      </body></html>`,
    );
    expect(result.flags).toContain("answer_not_first");
    expect(result.details.boundary).toBe("form");
  });

  it("FLAGS a substantive paragraph buried far down the page (element cap)", () => {
    const result = lintAnswerFirstStructure(
      `<!doctype html><html><body>
        <h1>What are your hours?</h1>
        ${"<div></div>".repeat(70)}
        <p>${LONG_ANSWER}</p>
      </body></html>`,
    );
    expect(result.flags).toContain("answer_not_first");
    expect(result.details.boundary).toBe("element_cap");
  });

  it("FLAGS a substantive paragraph that only appears in a later section", () => {
    const result = lintAnswerFirstStructure(
      `<!doctype html><html><body>
        <section class="hero">${QUESTION_HEADING}<p>Yes.</p></section>
        <section class="about"><h2>About us</h2><p>${LONG_ANSWER}</p></section>
      </body></html>`,
    );
    expect(result.flags).toContain("answer_not_first");
    expect(result.details.boundary).toBe("next_section");
  });

  it("FLAGS a substantive paragraph that only appears after a CTA", () => {
    const result = lintAnswerFirstStructure(
      `<!doctype html><html><body>
        ${QUESTION_HEADING}
        <p>Yes.</p>
        <a class="btn btn-primary" href="/book">Book now</a>
        <p>${LONG_ANSWER}</p>
      </body></html>`,
    );
    expect(result.flags).toContain("answer_not_first");
    expect(result.details.boundary).toBe("cta");
  });

  it("does not treat a nav CTA as the boundary (site chrome is skipped)", () => {
    const result = lintAnswerFirstStructure(
      `<!doctype html><html><body>
        <nav><a class="btn" href="/book">Book</a></nav>
        ${QUESTION_HEADING}
        <p>${LONG_ANSWER}</p>
      </body></html>`,
    );
    expect(result.flags).not.toContain("answer_not_first");
  });
});

describe("honesty lint — GeneratedCopySafetyService.validateGeneratedCopy", () => {
  const rejected = [
    "We will get you to rank #1 on Google.",
    "Your practice page will be at the top of google in weeks.",
    "This structured data will rank for every one of your services.",
    "We guarantee first page placement.",
    "Posting weekly is a freshness signal that boosts your ranking.",
    "We will help you rank higher on Google.",
    "We can help you outrank your competitors.",
    "Get you to page one of results.",
    "We'll dominate local search for you.",
    "Be #1 on Google, guaranteed.",

    // The page-qualifier family. Each of these was a MEASURED miss: the older
    // qualifier set sat directly on the rank noun, so a multi-word page
    // qualifier ("first PAGE placement") fell through the gap between the words.
    "First page placement on Google for every service page.",
    "Page one placement on Google, every time.",
    "Front page of Google for implant patients.",
    "Premium placement in Google Maps for your practice.",
  ];

  it.each(rejected)("REJECTS ranking/placement/visibility copy: %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.reasonCodes.length).toBeGreaterThan(0);
  });

  const honest = [
    "We will see you at your appointment on Tuesday.",
    "Complete structured data helps search and AI readers understand your services.",
    "We will add your hours, address, and social profiles to the page.",
    "Answer the question directly at the top of the page.",
    "We make no google ranking promises.",
    "Structured data does not guarantee a higher ranking.",
  ];

  it.each(honest)("PASSES honest copy (no false positive): %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(true);
    expect(result.status).toBe("safe");
  });

  /**
   * Negation is scoped to the clause that governs the matched phrase. An honest
   * clause must not launder a promise that follows it: a negator before an
   * adversative conjunction ("but", "however", …) or before a new coordinated
   * subject does not reach the later clause, so the promise is still blocked.
   *
   * Every clause-opening shape in the boundary set gets a fixture here, because
   * the gap this closes was a boundary set that covered only SOME of them.
   */
  const negationScoped = [
    "We do not use shortcuts, but we guarantee first page placement.",
    "We do not use shortcuts, however we guarantee first page placement.",
    "We don't cut corners and we guarantee first page placement.",
    "We never inflate results, though we will rank you #1 on Google.",
    // A leading subordinate clause is closed by its comma: the negator lives in
    // the subordinate clause and does not reach the main clause.
    "While we do not use shortcuts, we guarantee first page placement.",
    "Whereas we do not use shortcuts, we guarantee first page placement.",
    "Even though we avoid tricks, we guarantee first page placement.",
    "We do not use shortcuts. We guarantee first page placement.",
    "We don't cut corners; we guarantee first page placement.",
    "We make no promises, yet we guarantee first page placement.",

    // A comma splice: no conjunction at all, just a new subject. The negator
    // governs its own clause and stops at the comma.
    "We do not use shortcuts, we guarantee first page placement.",
    "We don't cut corners, we get you to page one.",
    "We do not use shortcuts, you get to page one.",
    "We don't cut corners, your practice will rank #1 on Google.",
    "We never inflate numbers, our clients rank #1 on Google.",
    "We do not use tricks, it will rank higher on Google.",
    "We don't cut corners, they rank #1 on Google.",
    "We make no promises, this will rank #1 on Google.",
    "We do not use shortcuts, that gets you to page one.",
    "We don't use tricks, Alloro gets you to page one.",
    "We do not use shortcuts, which guarantees first page placement.",
    "we don't cut corners,we guarantee first page placement.",
    "WE DO NOT USE SHORTCUTS, WE GUARANTEE FIRST PAGE PLACEMENT.",

    // A dash sets off a new element; the negation does not cross it.
    "Never settle for less — we guarantee first page placement.",
    "We don't cut corners – we guarantee first page placement.",
    "We don't cut corners -- we guarantee first page placement.",
    "We don't cut corners - we guarantee first page placement.",
    "Never settle for less—we guarantee first page placement.",
    "No shortcuts — guaranteed top spot on Google.",
    "We never inflate results — ranked #1 on Google.",

    // A verbless "no X," fragment negates its own noun phrase only: with no
    // verb to attach to, the negation cannot reach a following predication.
    "No hidden fees, guaranteed top spot on Google.",
    "No hidden fees, guaranteed first page placement.",
    "No hidden fees, ranked #1 on Google.",
    "No shortcuts, we get you to page one.",
    "Without gimmicks, we guarantee first page placement.",
    "No tricks. No gimmicks, guaranteed top spot on Google.",

    // Conjunctive adverbs and causal subordinators open a new clause.
    "We do not use shortcuts, therefore we guarantee first page placement.",
    "We don't cut corners; instead we guarantee first page placement.",
    "We never inflate results, still we guarantee first page placement.",
    "We do not use tricks, meanwhile we guarantee first page placement.",
    "We make no promises, moreover we guarantee first page placement.",
    "We don't cut corners, thus we guarantee first page placement.",
    "We do not use shortcuts, regardless we guarantee first page placement.",
    "We don't cut corners because we guarantee first page placement.",
    "We never inflate results since we guarantee first page placement.",

    // Coordinators with a new subject, and other separators.
    "We don't cut corners, so we guarantee first page placement.",
    "We make no promises, then we guarantee first page placement.",
    "We do not use shortcuts, plus we guarantee first page placement.",
    "We never cut corners and your practice will rank #1 on Google.",
    "We never cut corners (we guarantee first page placement).",
    "We don't cut corners / we guarantee first page placement.",
    "We do not use shortcuts… we guarantee first page placement.",
    "We don't cut corners: we guarantee first page placement.",

    // Block separators: page metadata is one of the surfaces this gate guards,
    // and "A | B" in a title tag is two independent fragments.
    "No hidden fees | Guaranteed top spot on Google",
    "We don't cut corners | we guarantee first page placement.",
    "No shortcuts • Guaranteed top spot on Google",
    "No shortcuts → guaranteed top spot on Google",
    "No gimmicks » we get you to page one",

    // A comma look-alike is still a comma.
    "We don't cut corners‚ we guarantee first page placement.",
    "We don't cut corners， we guarantee first page placement.",

    // Paragraph breaks, list items, and tabs.
    "We do not use shortcuts\nWe guarantee first page placement",
    "We never cut corners\n• Guaranteed top spot on Google",
    "No gimmicks\nWe get you to page one",
    "We don't cut corners.\n\nGuaranteed top spot on Google.",
    "We don't cut corners\n\n- Guaranteed top spot on Google",
    "We don't cut corners\n1. Guaranteed top spot on Google",
    "We don't cut corners\twe guarantee first page placement.",

    // The negator is real but governs an unrelated, earlier predicate.
    "We do not use shortcuts or take chances or cut corners, we guarantee page one.",
    "We don't cut corners, we never rest and we guarantee first page placement.",
  ];

  it.each(negationScoped)("REJECTS a promise in a later clause the negator does not govern: %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.reasonCodes.length).toBeGreaterThan(0);
  });

  /**
   * The mirror of the above, and the constraint that makes the boundary set
   * non-trivial: negation that GENUINELY distributes across a coordinated verb
   * phrase sharing the negated auxiliary must still pass. Over-blocking an
   * honest disclaimer is a real failure, not a safe default — it fails the
   * recommendation that produced the copy. Each fixture here is a shape the
   * boundary set must deliberately NOT split.
   */
  const negationDistributes = [
    "We will not rank you #1 or get you to page one.",
    "We do not and will not guarantee a higher ranking.",
    "We never make claims about your google ranking.",
    "Although we do not guarantee a higher ranking, we do complete your schema.",
    // "yet" as an adverb shares the negated auxiliary — not an adversative.
    "We have not yet guaranteed a higher ranking.",
    // The negator governs the phrase in the main clause.
    "While we do complete your schema, we make no google ranking promises.",
    "We do not guarantee rankings or promise page-one placement.",

    // A comma-separated list of verb phrases sharing one negated auxiliary.
    // This is why a bare comma is NOT a boundary.
    "We do not guarantee rankings, promise page one, or boost your visibility.",
    // A parenthetical insert between the negator and the phrase it governs.
    "We do not, and will not, guarantee a higher ranking.",
    "We do not (ever) guarantee a higher ranking.",
    // A coordinated object list under one determiner-"no".
    "We provide no rankings, placements, or guarantees.",
    "We do not guarantee your ranking, your placement, or your visibility.",
    "We do not boost your traffic, your rankings, or your visibility.",
    "We do not offer refunds, guaranteed placements, or free audits.",
    // A separator followed by negation-carrying material continues the negated
    // predicate rather than opening a new one.
    "We won't rank you #1 — or get you to page one.",
    "We do not guarantee rankings — not now, not ever.",
    "No guarantees, no promises.",
    "No guarantees | no promises",
    "We cannot guarantee a higher ranking, nor will we promise page one.",
    "No, we do not guarantee rankings.",
    "Without a doubt, we do not guarantee rankings.",
    "We cannot guarantee a higher ranking, and we never will.",
    // A relative or reason clause that is itself honest.
    "We do not guarantee rankings, which is why we focus on structure.",
    "We make no claims about rankings, which we cannot control.",
    "We do not promise a higher ranking, which we never guarantee.",
    "We do not guarantee rankings because ranking is not something we control.",
    // Soft-wrapped prose: a LONE line break is not a clause break, so the
    // negated verb phrase must survive the wrap.
    "We do not\nguarantee a higher ranking.",
    "Structured data does not\nguarantee a higher ranking.",
    "We will not rank you #1\nor get you to page one.",
  ];

  it.each(negationDistributes)("PASSES an honest disclaimer whose negator governs the phrase: %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(true);
    expect(result.status).toBe("safe");
  });

  /**
   * POST-MODIFYING NEGATION — the negator AFTER the claim.
   *
   * The scope walk reads backward from a match, so a claim in SUBJECT position
   * with the negator in its own predicate ("Permanent results are not
   * guaranteed") was BLOCKED. That is the worst failure this gate has: a missed
   * boast still meets owner approval before publish, but a blocked disclaimer is
   * silent and absolute — the most honest sentence a practice can publish simply
   * cannot ship. The first two fixtures are the measured false positives.
   */
  const postModifyingNegation = [
    "Permanent results are not guaranteed.",
    "Ranking #1 on Google is not something we promise.",
    "First page placement is not guaranteed.",
    "A higher ranking is not promised.",
    "Top placement cannot be guaranteed.",
    "Google rankings are never guaranteed.",
    "Page one placement isn't something we control.",
    "Higher rankings are not a promise we make.",
    "Google rankings do not come with any promise.",
    "A higher ranking has not been promised.",
    "Top placement will not be promised.",
    "No first page placement is implied.",
    "We cannot guarantee first page placement.",
    // The subject tail: PP modifiers continue the subject NP, so the negated
    // predicate still governs the claim across them.
    "Top placement in Google Maps for your practice is not guaranteed.",
    // A matrix verb that is not an asserting verb must not disable the guard.
    "Please note that permanent results are not guaranteed.",
  ];

  it.each(postModifyingNegation)("PASSES a disclaimer whose negator FOLLOWS the claim: %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(true);
    expect(result.status).toBe("safe");
  });

  /**
   * The mirror of the above, and the constraint that keeps the forward read from
   * opening a hole: a trailing negator that modifies a DIFFERENT constituent
   * must not launder the claim. Forward negation is only read when the claim is
   * the subject of its own negated finite predicate — a comma, a dash, an
   * intervening copula, or an asserting verb governing the claim all stop it.
   */
  const trailingNegatorDoesNotLaunder = [
    "We guarantee first page placement, not just traffic.",
    "We guarantee first page placement — not just traffic.",
    "We deliver top placement, never less.",
    "You get page one placement, not excuses.",
    // The negator sits in a complement clause; the matrix verb still asserts.
    "We promise top placement is not a problem.",
    // A copula stops the subject tail, so the later negator cannot reach back.
    "Top placement is our goal but rankings are not guaranteed.",
  ];

  it.each(trailingNegatorDoesNotLaunder)("BLOCKS a claim a trailing negator does not govern: %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(false);
    expect(result.status).toBe("blocked");
  });

  /**
   * The rank/placement claim family, swept adversarially. This is a conservative
   * FILTER, not a proof of coverage — two shapes from the same sweep are known to
   * escape and are documented as residuals on the pattern block itself: a
   * metaphor with no rank noun ("prime real estate on Google's first page") and a
   * paraphrase with no claim vocabulary at all ("we put your practice where
   * patients look first"). Neither is reachable lexically.
   */
  const claimFamily = [
    "Page-one placement for your practice.",
    "First-page rankings for every service.",
    "Page 1 placement, every time.",
    "Position one placement on Google.",
    "#1 placement on Google.",
    "Top of Google for your whole service list.",
    "Front page of the search results.",
    "Top of the SERPs for implants.",
    "Page one of Google Maps.",
    "We get you in the local pack.",
    "We put your practice in the map pack.",
    "Land your listing in the 3-pack.",
    "Rank above your competitors.",
    "We put you ahead of your competitors.",
    "Priority placement in Google Maps.",
    "Featured placement on Google.",
    "The top spot on Google is yours.",
    "We land you the first slot.",
    "Maximum exposure on Google search.",
    "We make your practice the most visible in town.",
    "Own the map pack in your city.",
    "Your listing will sit at the top of the results.",
    "Expect to be found at the very top.",
  ];

  it.each(claimFamily)("BLOCKS the rank/placement claim family: %s", (copy) => {
    expect(GeneratedCopySafetyService.validateGeneratedCopy(copy).isSafe).toBe(false);
  });

  /**
   * The inventory widened around the page qualifiers, NOT around the noun
   * "position". These are ordinary English that happens to share a qualifier
   * with a placement promise; blocking them would be a false positive, which is
   * the failure this round exists to fix.
   */
  const ordinaryEnglish = [
    "We put you in a better position to serve your patients.",
    "Answer the question directly at the top of the page.",
    "We will create your first listing this week.",
    "Your hours are more visible on the page.",
  ];

  it.each(ordinaryEnglish)("PASSES ordinary English that shares a qualifier: %s", (copy) => {
    expect(GeneratedCopySafetyService.validateGeneratedCopy(copy).isSafe).toBe(true);
  });

  /**
   * ENCODING BOUNDARIES. Every pattern in this gate is ASCII, and copy a reader
   * sees as "guarantee" need not be ASCII "guarantee". Before normalization the
   * gate matched one ENCODING of the text rather than the text; each fixture
   * below was a MEASURED bypass on the reviewed head.
   *
   * These are CATEGORY representatives — an invisible character, a cross-script
   * confusable, a compatibility letter form, an entity, an inline tag — not a
   * list of strings to block. The fold, not a pattern, is what closes them; see
   * copy-normalization.test.ts for the fold's own unit coverage.
   */
  const encodingBypasses = [
    // The three boundaries Dave named: the negator must not leak across them.
    "We do not make ranking claims。 We guarantee first page placement.",
    "We do not make ranking claims； We guarantee first page placement.",
    "We do not make ranking claims<br> We guarantee first page placement.",
    // The same boundary class in other scripts and in HTML block tags.
    "We do not make ranking claims। We guarantee first page placement.",
    "We do not make ranking claims؟ We guarantee first page placement.",
    "We do not make ranking claims！ We guarantee first page placement.",
    "<p>We do not make ranking claims</p><p>We guarantee first page placement.</p>",
    "<li>We do not make ranking claims</li><li>We guarantee first page placement.</li>",
    // A claim broken apart by something that renders as nothing.
    "Top pla​cement on Google for your practice.",
    "Top pla­cement on Google for your practice.",
    "Top pla<wbr>cement on Google for your practice.",
    "Top pla<b>cement</b> on Google for your practice.",
    "Top pla&#99;ement on Google for your practice.",
    "Top pla<!-- x -->cement on Google for your practice.",
    // A claim written in letters that are not the ASCII they look like.
    "#1 on Gооgle for implants.",
    "Ｔｏｐ　ｐｌａｃｅｍｅｎｔ　ｏｎ　Ｇｏｏｇｌｅ．",
  ];

  it.each(encodingBypasses)("BLOCKS a claim whose ENCODING hid it from an ASCII pattern: %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(false);
    expect(result.status).toBe("blocked");
  });

  /**
   * A NEGATOR THAT NEGATES NOTHING. Finding a negator token in the clause used to
   * BE the negation test, so a token bound to something that is not a predicate
   * laundered the claim after it. Each fixture was a MEASURED bypass; the first
   * two are Dave's.
   */
  const falseNegators = [
    // Compound-bound: the negator belongs to a hyphenated modifier.
    "No-hassle guaranteed top placement on Google.",
    "No-obligation first page placement for your practice.",
    "No-risk page one placement, every time.",
    // Idiom-bound: a fixed adverbial that negates nothing — several ASSERT.
    "Without delay guaranteed top placement on Google.",
    "Without fail we get you first page placement.",
    "Without a doubt the top spot on Google is yours.",
    "No doubt we get you page one placement.",
    "You can't beat our guaranteed top placement.",
    "Don't miss our guaranteed first page placement.",
    "Not to worry guaranteed top placement on Google.",
    "Never fear guaranteed top placement on Google.",
    // The FORWARD direction of the same class: the claim IS the subject of a
    // negated predicate, so the grammar guard fires — but the idiom asserts the
    // claim rather than denying it. Found by attacking this round's own fix.
    "Ranking #1 on Google has never been easier.",
    "Top placement is no problem.",
    "First page placement is never a problem.",
    // An independent adversary broke the first version of the "no problem"
    // demotion: it only fired clause-finally, so a trailing prepositional phrase
    // — the MORE natural way to write the boast — laundered the claim.
    "A higher ranking is no problem for us.",
    "Top placement is no problem at all.",
    "Page one placement is no issue for our team.",
    "First page placement is no sweat for us.",
    "Getting you to page one is no trouble at all.",
    "Ranking #1 on Google is no problem for a practice like yours.",
    // Fragment-bound: a verbless NP fragment juxtaposed against the claim.
    // NOTE the residual documented on the rules: this is caught at TWO
    // intervening words, not one. "No obligation first page placement" (one
    // noun) is surface-identical to "No guaranteed higher ranking" (one
    // participle), which must PASS — separating them needs a POS tagger. The
    // hyphenated form above is caught structurally.
    "No hassle guaranteed top placement on Google.",
  ];

  it.each(falseNegators)("BLOCKS a claim behind a negator that governs nothing: %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(false);
    expect(result.status).toBe("blocked");
  });

  /**
   * The mirror, and the constraint that makes the false-negator rules
   * non-trivial: a REAL negator must keep governing. Over-blocking an honest
   * disclaimer is the worse failure — a missed boast still meets owner approval,
   * a blocked disclaimer is silent and absolute.
   *
   * The curly-apostrophe fixtures were MEASURED FALSE POSITIVES on the reviewed
   * head: the negator inventory spells `don't` in ASCII and generated copy spells
   * it with U+2019, so the negator silently failed to match and the most honest
   * sentence a practice can publish could not ship.
   */
  const negatorStillGoverns = [
    "We don’t guarantee a higher ranking.",
    "First page placement isn’t guaranteed.",
    "We can’t guarantee first page placement.",
    "We don’t promise page one placement.",
    // A determiner-"no" whose complement IS the claim.
    "We make no promises about your google ranking.",
    "We have no control over your google ranking.",
    "We offer no guarantee of first page placement.",
    "There is no such thing as guaranteed first page placement.",
    "No guaranteed higher ranking is implied.",
    // A false negator and a real one in one clause: the real one still governs.
    "There is no doubt that we cannot guarantee a higher ranking.",
    "Without a doubt, we do not guarantee rankings.",
    // Normalized copy must not lose a boundary an honest disclaimer relies on.
    "We do not guarantee rankings。 We complete your schema.",
    "We do not guarantee rankings<br>We complete your schema.",
    "<p>We do <b>not</b> guarantee a higher ranking.</p>",
    "Café Dental does not guarantee a higher ranking.",

    /*
     * MEASURED OVER-BLOCKS FROM THIS ROUND'S OWN FIX, caught by attacking it
     * before shipping. Each was an idiom demotion that was simply WRONG — the
     * "idiom" negates normally, so demoting its negator silently blocked an
     * honest disclaimer. They are pinned here because the idiom inventory is the
     * part of this gate most likely to be widened again later, and widening it
     * carelessly fails SILENTLY in the direction nothing catches.
     */
    "We make no other guarantees about your google ranking.",
    "We make no less binding a promise about your google ranking.",
    "We make no fewer promises about your google ranking.",
    "Google rankings are never better than honest structure.",
    "No matter what, we do not guarantee a higher ranking.",
    // The "no problem" demotion must not reach a genuine denial that merely
    // starts the same way — a finite clause after the noun proves it is a real
    // predicate, not the idiom.
    "First page placement is not a problem we can solve.",

    /*
     * MEASURED OVER-BLOCKS FOUND BY AN INDEPENDENT ADVERSARY against this
     * round's fix. Both are the same mistake in two places: treating something
     * as a non-negator when it genuinely negates.
     *
     * <br> was folded to a PARAGRAPH break, which the gate reads as a hard
     * clause end — so it cut the negator off the claim it governs and blocked
     * the disclaimer. <br> renders as ONE line break, and a lone line break is
     * deliberately a soft wrap here. It now folds to "\n", which still ends
     * scope before a new subject (so the boast form above still blocks) without
     * splitting a negated verb phrase.
     */
    "We do not <br> guarantee a higher ranking.",
    "Structured data does not <br/> guarantee a higher ranking.",
    "<p>We do not<br>guarantee a higher ranking.</p>",
    "We cannot<br />promise a higher ranking.",
    /*
     * "not only" negates EXCLUSIVITY and really does scope over what follows, so
     * demoting it blocked honest copy that makes no ranking promise at all.
     */
    "Good dentistry is not only about your google rankings.",
    "Your success is not only about a higher ranking.",
    "Choosing a dentist is not only about who ranks #1 on Google.",
    "We are not only unable to guarantee rankings, we say so up front.",
  ];

  it.each(negatorStillGoverns)("PASSES an honest disclaimer whose negator DOES govern: %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(true);
    expect(result.status).toBe("safe");
  });
});

/**
 * POST-CLAIM DENIAL FRAGMENTS — the elliptical denial.
 *
 * The forward negation model only read a negated FINITE predicate adjacent to
 * the claim ("permanent results ARE not guaranteed"). Real disclaimer copy elides
 * the copula and sets the denial off with punctuation instead. A sweep of the
 * space measured 482 of 497 honest disclaimer shapes BLOCKED at the previous
 * head — the whole class, not the three strings the review happened to name.
 *
 * These fixtures walk the class along its two axes: the BOUNDARY between claim
 * and denial, and the HEAD the denial lands on.
 */
describe("honesty lint — post-claim denial fragments must not false-block", () => {
  const claims = ["Top placement", "Higher rankings", "Permanent results", "First page placement"];
  const boundaries = ["? ", ": ", ". ", " — ", "; ", "\n", " - ", ", "];
  const denials = [
    "Not guaranteed.",
    "not guaranteed.",
    "Never guaranteed.",
    "Not promised.",
    "Not always guaranteed.",
    "No guarantee.",
    "Not a guarantee.",
    "Not a given.",
    "Not certain.",
    "Not guaranteed by anyone.",
    "Not guaranteed, ever.",
    "Not something we promise.",
  ];
  const fragments = claims.flatMap((c) => boundaries.flatMap((b) => denials.map((d) => c + b + d)));

  it.each(fragments)("PASSES an honest post-claim denial: %j", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(true);
  });

  it.each(["Top placement (not guaranteed).", "Higher rankings (never guaranteed)."])(
    "PASSES a parenthetical denial: %s",
    (copy) => {
      expect(GeneratedCopySafetyService.validateGeneratedCopy(copy).isSafe).toBe(true);
    },
  );

  /*
   * The other direction. A trailing fragment that denies something OTHER than
   * the claim must not launder it. These are GUARD fixtures: they blocked before
   * this round's fix and must keep blocking after it — the fragment rule is the
   * part of this gate most likely to be widened later, and widening it carelessly
   * fails in the direction owner approval is the only backstop for.
   *
   * "Not a promise, a fact." is here because it was a MEASURED laundering in this
   * round's own adversary pass: the denial noun satisfied the fragment and the
   * phrase after the comma quietly reversed it.
   */
  const stillBlocked = [
    "Top placement? Not just traffic.",
    "First page placement: not only visibility.",
    "Top placement. Not a promise, a fact.",
    "Top placement? Not a guarantee, a certainty.",
    "First page placement — not a given, a certainty.",
    "Top placement? No problem.",
    "Ranking #1 on Google? Not a problem at all.",
    "We guarantee first page placement, not just traffic.",
    "We guarantee top placement — not guaranteed.",
    "Guaranteed top placement. Not guaranteed.",
  ];

  it.each(stillBlocked)("BLOCKS a claim a trailing fragment does not deny: %s", (copy) => {
    expect(GeneratedCopySafetyService.validateGeneratedCopy(copy).isSafe).toBe(false);
  });
});

/**
 * A determiner negator whose NP is the SUBJECT OF A FINITE VERB (Rule D).
 *
 * A SECOND over-block class, found by attacking the fix above rather than named
 * in review. "No dentist can guarantee results." is the plainest honest sentence
 * in this space and it blocked: the word-distance test saw two words where it
 * allows one, so it read a real clausal negation as a verbless fragment. Ten of
 * ten natural shapes in this class blocked before Rule D.
 */
describe("honesty lint — 'no <subject> <verb> <claim>' is clausal negation, not a fragment", () => {
  const honest = [
    "No treatment is guaranteed to be pain-free.",
    "No dentist can guarantee results.",
    "No procedure is pain-free.",
    "No practice guarantees top placement.",
    "No agency can guarantee a higher ranking.",
    "No one can promise first page placement.",
    // The claim pattern begins AT the finite verb here, leaving a verbless "no
    // SEO work" before the match. Pinned because it is the case that proved the
    // rule had to read the claim, not just the text before it.
    "No SEO work guarantees a higher ranking.",
    "No provider will guarantee permanent results.",
    "No result is guaranteed.",
    "No outcome is ever guaranteed.",
  ];

  it.each(honest)("PASSES a clausal 'no' disclaimer: %s", (copy) => {
    expect(GeneratedCopySafetyService.validateGeneratedCopy(copy).isSafe).toBe(true);
  });

  /*
   * GUARD fixtures. The verb set is closed to auxiliaries, modals, copulas and
   * the promise verbs; widening it toward "any verb" would launder these. Each
   * blocked before Rule D and must keep blocking after it.
   */
  const stillBlocked = [
    "No one doubts we guarantee top placement.",
    "No-hassle guaranteed top placement on Google.",
    "Without delay guaranteed top placement on Google.",
    "No doubt we will rank you #1.",
    "No question we can guarantee top placement.",
    "No hassle, guaranteed top placement is yours.",
    "No worries, your top placement is guaranteed.",
  ];

  it.each(stillBlocked)("BLOCKS a negator that governs no predicate: %s", (copy) => {
    expect(GeneratedCopySafetyService.validateGeneratedCopy(copy).isSafe).toBe(false);
  });
});

describe("AEO-incomplete gates nothing and is never owner-facing", () => {
  const html = pageWithSchema(
    INCOMPLETE_LOCAL_BUSINESS,
    "<h1>Bright Smiles Dental</h1><p>We are a dental practice.</p>",
  );

  it("flags the internal signal but never blocks and never leaks into copy", () => {
    const result = runGetFoundChecker({ url: "https://example.com/", html }, [
      // Honest candidate copy — the honesty gate must pass even while the schema
      // is AEO-incomplete, proving the signal gates nothing.
      "Complete structured data helps search and AI readers understand your page.",
    ]);

    // Internal signal present (admin-only).
    expect(result.internalSignals).toContain(INTERNAL_AEO_INCOMPLETE_SIGNAL);
    // Yet advisory recommendations are still emitted and honesty still passes —
    // the incomplete signal blocked nothing.
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.honesty.passed).toBe(true);

    // Owner-facing copy on every recommendation must never contain the signal.
    for (const rec of result.recommendations) {
      expect(rec.title).not.toMatch(/AEO/i);
      expect(rec.detail).not.toMatch(/AEO/i);
      expect(rec.detail).not.toContain(INTERNAL_AEO_INCOMPLETE_SIGNAL);
    }
  });

  it("skips the GBP consistency flag when no GBP identity is supplied", () => {
    const result = runGetFoundChecker({ url: "https://example.com/", html });
    expect(result.gbpPageConsistency).toBeNull();
  });

  it("flags divergence when the GBP profile disagrees with the page", () => {
    const result = runGetFoundChecker(
      { url: "https://example.com/", html, gbpIdentity: { name: "Totally Different Dental", phone: "+1-999-555-0000", address: "999 Other Rd, Dallas, TX 75001" } },
    );
    expect(result.gbpPageConsistency).not.toBeNull();
  });
});
