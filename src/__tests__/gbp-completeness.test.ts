import { describe, it, expect } from "vitest";
import {
  mapAiReadyGbpToCompletenessInput,
  scoreGbpCompleteness,
  GBP_COMPLETENESS_FIELDS,
} from "../services/ai-seo-audit/gbpCompletenessScoring";
import {
  runGetFoundChecker,
  INTERNAL_GBP_INCOMPLETE_SIGNAL,
} from "../services/ai-seo-audit/getFoundChecker";
import { GeneratedCopySafetyService } from "../services/content-safety/GeneratedCopySafetyService";
import { condenseGbp } from "../controllers/audit/audit-utils/payloadCondensers";

/**
 * Alloro Funnel Engine — A2 (GBP own-completeness) proofs. Locks the behaviors
 * the spec's Test section requires: the missing-field set, the fully-complete
 * and partial-record cases, the no-GBP skip, and that "GBP-incomplete" gates
 * nothing / never surfaces in owner-facing copy and the recommendation copy
 * makes no ranking claim.
 */

const COMPLETE_GBP = {
  categoryName: "Dentist",
  categories: ["Dentist", "Cosmetic dentist"],
  address: "123 Main St, Austin, TX 78701",
  phone: "+1-512-555-0100",
  website: "https://brightsmiles.example",
  hasWebsite: true,
  hasPhone: true,
  hasHours: true,
  openingHoursSummary: "Mon-Fri 9am-5pm",
  imagesCount: 12,
};

// category (via categoryName), phone (via hasPhone), address present;
// website (hasWebsite:false), hours (hasHours:false, no summary), photos
// (imagesCount:0) missing.
const INCOMPLETE_GBP = {
  categoryName: "Dentist",
  address: "123 Main St, Austin, TX 78701",
  hasWebsite: false,
  hasPhone: true,
  hasHours: false,
  imagesCount: 0,
};

function minimalPage(body = "<h1>Bright Smiles Dental</h1>"): string {
  return `<!doctype html><html><head></head><body>${body}</body></html>`;
}

describe("scoreGbpCompleteness — missing-field set", () => {
  it("returns exactly the missing fields for a partially-complete profile", () => {
    const result = scoreGbpCompleteness(INCOMPLETE_GBP);
    expect(result.hasData).toBe(true);
    // Iteration order is GBP_COMPLETENESS_FIELDS order.
    expect(result.missingFields).toEqual(["website", "hours", "photos"]);
    expect(result.presentFields).toEqual(["category", "phone", "address"]);
    expect(result.completeness).toBeCloseTo(0.5, 5);
    expect(result.gbpIncomplete).toBe(true);
  });

  it("reports a fully-complete profile with no missing fields", () => {
    const result = scoreGbpCompleteness(COMPLETE_GBP);
    expect(result.hasData).toBe(true);
    expect(result.missingFields).toEqual([]);
    expect(result.completeness).toBe(1);
    expect(result.gbpIncomplete).toBe(false);
  });

  it("tolerates a record missing keys entirely (grades them missing, no crash)", () => {
    const result = scoreGbpCompleteness({ categoryName: "Dentist" });
    expect(result.hasData).toBe(true);
    expect(result.presentFields).toEqual(["category"]);
    expect(result.missingFields).toEqual(["website", "phone", "hours", "address", "photos"]);
  });

  it("grades only the real fixed field set (never an invented field)", () => {
    const result = scoreGbpCompleteness(INCOMPLETE_GBP);
    for (const field of [...result.presentFields, ...result.missingFields]) {
      expect(GBP_COMPLETENESS_FIELDS).toContain(field);
    }
  });

  it("returns hasData:false and recommends nothing for no/empty record", () => {
    for (const input of [null, undefined, {}]) {
      const result = scoreGbpCompleteness(input as never);
      expect(result.hasData).toBe(false);
      expect(result.missingFields).toEqual([]);
      expect(result.gbpIncomplete).toBe(false);
    }
  });
});

describe("scoreGbpCompleteness — against the real condenseGbp producer", () => {
  it("treats condenseGbp(null) (no listing) as no data — never a false 'complete your profile'", () => {
    // Regression for the adversary's HIGH finding: condenseGbp(null) emits
    // all-false derived booleans, which must NOT grade as a real incomplete GBP.
    const noListing = condenseGbp(null);
    const result = scoreGbpCompleteness(noListing);
    expect(result.hasData).toBe(false);
    expect(result.missingFields).toEqual([]);
    expect(result.gbpIncomplete).toBe(false);
  });

  it("grades a real condenseGbp record that has content", () => {
    const real = condenseGbp({
      categoryName: "Dentist",
      address: "1 A St, Austin, TX",
      website: "https://x.example",
      openingHours: ["Mon: 9-5"],
      imagesCount: 3,
    });
    const result = scoreGbpCompleteness(real);
    expect(result.hasData).toBe(true);
    // No phone in the input → phone is the one missing field; the rest present.
    expect(result.missingFields).toEqual(["phone"]);
    expect(result.presentFields).toEqual(
      expect.arrayContaining(["category", "website", "hours", "address", "photos"]),
    );
  });
});

describe("scoreGbpCompleteness — AI-ready production profile adapter", () => {
  it("maps the existing organization-audit GBP profile without inventing photo evidence", () => {
    const mapped = mapAiReadyGbpToCompletenessInput({
      profile: {
        primaryCategory: "Dentist",
        additionalCategories: ["Cosmetic Dentist"],
        websiteUri: null,
        phoneNumber: "+1-512-555-0100",
        hasHours: true,
        storefrontAddress: {
          addressLines: ["123 Main St"],
          locality: "Austin",
          administrativeArea: "TX",
          postalCode: "78701",
        },
      },
    });
    const result = scoreGbpCompleteness(mapped);

    expect(result.hasData).toBe(true);
    expect(result.presentFields).toEqual(["category", "phone", "hours", "address"]);
    expect(result.missingFields).toEqual(["website"]);
    expect(result.missingFields).not.toContain("photos");
    expect(result.completeness).toBeCloseTo(0.8, 5);

    const checker = runGetFoundChecker({
      url: "https://example.com/",
      html: minimalPage(),
      gbpCompleteness: mapped,
    });
    const recommendation = checker.recommendations.find(
      (entry) => entry.code === "gbp_completeness",
    );
    expect(recommendation?.detail).toContain("website");
    expect(recommendation?.detail).not.toContain("photo");
  });

  it("grades photos when the AI-ready source carries a real count", () => {
    const mapped = mapAiReadyGbpToCompletenessInput({
      imagesCount: 0,
      profile: { primaryCategory: "Dentist" },
    });
    const result = scoreGbpCompleteness(mapped);

    expect(result.missingFields).toContain("photos");
  });
});

describe("getFoundChecker — GBP completeness wiring", () => {
  it("emits a gbp_completeness recommendation when a record is supplied and incomplete", () => {
    const result = runGetFoundChecker({
      url: "https://example.com/",
      html: minimalPage(),
      gbpCompleteness: INCOMPLETE_GBP,
    });

    expect(result.gbpCompleteness.hasData).toBe(true);
    expect(result.gbpCompleteness.missingFields).toEqual(["website", "hours", "photos"]);
    expect(result.internalSignals).toContain(INTERNAL_GBP_INCOMPLETE_SIGNAL);

    const rec = result.recommendations.find((r) => r.code === "gbp_completeness");
    expect(rec).toBeDefined();
    // Owner-facing copy is eligibility/trust framed and names the missing fields.
    expect(rec!.detail).toContain("opening hours");
    expect(rec!.detail).toContain("at least one photo");
  });

  it("skips the GBP completeness score and recommendation when no record is supplied", () => {
    const result = runGetFoundChecker({ url: "https://example.com/", html: minimalPage() });
    expect(result.gbpCompleteness.hasData).toBe(false);
    expect(result.recommendations.find((r) => r.code === "gbp_completeness")).toBeUndefined();
    expect(result.internalSignals).not.toContain(INTERNAL_GBP_INCOMPLETE_SIGNAL);
  });

  it("gbp_completeness copy passes the honesty gate, makes no rank claim, and never leaks the internal signal", () => {
    const result = runGetFoundChecker({
      url: "https://example.com/",
      html: minimalPage(),
      gbpCompleteness: INCOMPLETE_GBP,
    });
    const rec = result.recommendations.find((r) => r.code === "gbp_completeness")!;

    // Honesty gate accepts the owner-facing title + detail.
    for (const copy of [rec.title, rec.detail]) {
      const safety = GeneratedCopySafetyService.validateGeneratedCopy(copy);
      expect(safety.isSafe).toBe(true);
    }
    // No rank/visibility language, and the internal signal never surfaces.
    expect(rec.title).not.toMatch(/rank|#1|top of google|page one|outrank/i);
    expect(rec.detail).not.toMatch(/rank|#1|top of google|page one|outrank/i);
    expect(rec.title).not.toContain(INTERNAL_GBP_INCOMPLETE_SIGNAL);
    expect(rec.detail).not.toContain(INTERNAL_GBP_INCOMPLETE_SIGNAL);
  });
});
