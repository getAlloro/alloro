import { describe, it, expect } from "vitest";
import {
  scoreSchemaCompleteness,
  LOCAL_BUSINESS_FIELDS,
} from "../services/ai-seo-audit/schemaCompletenessScoring";
import {
  runGetFoundChecker,
  INTERNAL_AEO_INCOMPLETE_SIGNAL,
} from "../services/ai-seo-audit/getFoundChecker";
import { GbpContentSafetyService } from "../controllers/gbp-automation/feature-services/GbpContentSafetyService";

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

describe("honesty lint — GbpContentSafetyService.validateGeneratedCopy", () => {
  const rejected = [
    "We will get you to rank #1 on Google.",
    "Your practice page will be at the top of google in weeks.",
    "This structured data will rank for every one of your services.",
    "We guarantee first page placement.",
    "Posting weekly is a freshness signal that boosts your ranking.",
  ];

  it.each(rejected)("REJECTS ranking/placement/visibility copy: %s", (copy) => {
    const result = GbpContentSafetyService.validateGeneratedCopy(copy);
    expect(result.isSafe).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.reasonCodes.length).toBeGreaterThan(0);
  });

  const honest = [
    "We will see you at your appointment on Tuesday.",
    "Complete structured data helps search and AI readers understand your services.",
    "We will add your hours, address, and social profiles to the page.",
    "Answer the question directly at the top of the page.",
  ];

  it.each(honest)("PASSES honest copy (no false positive): %s", (copy) => {
    const result = GbpContentSafetyService.validateGeneratedCopy(copy);
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
