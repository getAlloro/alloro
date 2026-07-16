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
  ];

  it.each(negationScoped)("REJECTS a promise in a later clause the negator does not govern: %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.reasonCodes.length).toBeGreaterThan(0);
  });

  /**
   * The mirror of the above: negation that GENUINELY distributes across a
   * coordinated verb phrase sharing the negated auxiliary must still pass, so
   * the scoping fix does not over-block honest disclaimers.
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
  ];

  it.each(negationDistributes)("PASSES an honest disclaimer whose negator governs the phrase: %s", (copy) => {
    const result = GeneratedCopySafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(true);
    expect(result.status).toBe("safe");
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
