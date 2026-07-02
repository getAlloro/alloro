/**
 * Unit tests — SEO enrichment pure helpers (plans/07022026-seo-metatag-fixes).
 *
 * Load-bearing guarantees:
 *   • sanitizeSchemaJsonTypes — invented business types ("Endodontist",
 *     "Orthodontist") fall back to "MedicalBusiness"; valid business types
 *     and known non-business kinds (Service, FAQPage, BreadcrumbList, ...)
 *     pass through unchanged.
 *   • buildFaqPageSchema — valid candidates produce a real FAQPage block;
 *     empty/absent/malformed candidates produce null, never a fabricated block.
 *   • injectAggregateRating — only the business-entity element gets the
 *     rating; a null rating or absent business entity leaves the array
 *     unchanged, never fabricating a placeholder.
 */

import { describe, it, expect } from "vitest";
import {
  sanitizeSchemaEntryType,
  sanitizeSchemaJsonTypes,
  isBusinessEntitySchema,
} from "../controllers/admin-websites/feature-utils/util.schema-business-type";
import {
  buildFaqPageSchema,
  hasFaqPageSchema,
} from "../controllers/admin-websites/feature-utils/util.faq-schema";
import { injectAggregateRating } from "../controllers/admin-websites/feature-utils/util.aggregate-rating-schema";
import { trimTitleLength } from "../controllers/admin-websites/feature-utils/util.title-length";

describe("sanitizeSchemaEntryType / sanitizeSchemaJsonTypes", () => {
  it("falls back invented specialty types to MedicalBusiness", () => {
    expect(sanitizeSchemaEntryType({ "@type": "Endodontist" })).toEqual({ "@type": "MedicalBusiness" });
    expect(sanitizeSchemaEntryType({ "@type": "Orthodontist" })).toEqual({ "@type": "MedicalBusiness" });
  });

  it("passes through valid business types unchanged", () => {
    const entry = { "@type": "Dentist", name: "One Endodontics" };
    expect(sanitizeSchemaEntryType(entry)).toEqual(entry);
  });

  it("passes through known non-business schema kinds unchanged", () => {
    for (const type of ["BreadcrumbList", "Service", "FAQPage", "WebPage", "Organization", "SoftwareApplication"]) {
      const entry = { "@type": type };
      expect(sanitizeSchemaEntryType(entry)).toEqual(entry);
    }
  });

  it("leaves entries with no string @type unchanged", () => {
    const entry = { name: "no type here" };
    expect(sanitizeSchemaEntryType(entry)).toEqual(entry);
  });

  it("sanitizes every entry in an array, preserving order", () => {
    const input = [{ "@type": "Endodontist" }, { "@type": "BreadcrumbList" }, { "@type": "Orthodontist" }];
    expect(sanitizeSchemaJsonTypes(input)).toEqual([
      { "@type": "MedicalBusiness" },
      { "@type": "BreadcrumbList" },
      { "@type": "MedicalBusiness" },
    ]);
  });

  it("returns an empty array for non-array input", () => {
    expect(sanitizeSchemaJsonTypes(null)).toEqual([]);
    expect(sanitizeSchemaJsonTypes(undefined)).toEqual([]);
    expect(sanitizeSchemaJsonTypes("not an array")).toEqual([]);
  });
});

describe("isBusinessEntitySchema", () => {
  it("is true for a valid business type with an address", () => {
    expect(isBusinessEntitySchema({ "@type": "Dentist", address: {} })).toBe(true);
  });

  it("is false without an address, without a valid type, or for non-objects", () => {
    expect(isBusinessEntitySchema({ "@type": "Dentist" })).toBe(false);
    expect(isBusinessEntitySchema({ "@type": "Service", address: {} })).toBe(false);
    expect(isBusinessEntitySchema(null)).toBe(false);
    expect(isBusinessEntitySchema("nope")).toBe(false);
  });
});

describe("buildFaqPageSchema", () => {
  it("builds a valid FAQPage block from candidates", () => {
    const result = buildFaqPageSchema([
      { question: "What is a root canal?", answer: "A procedure to treat infected pulp." },
    ]);
    expect(result).toEqual({
      "@type": "FAQPage",
      "@context": "https://schema.org",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is a root canal?",
          acceptedAnswer: { "@type": "Answer", text: "A procedure to treat infected pulp." },
        },
      ],
    });
  });

  it("returns null for empty, absent, or malformed candidates — never fabricates", () => {
    expect(buildFaqPageSchema([])).toBeNull();
    expect(buildFaqPageSchema(undefined)).toBeNull();
    expect(buildFaqPageSchema("not an array")).toBeNull();
    expect(buildFaqPageSchema([{ question: "", answer: "" }])).toBeNull();
    expect(buildFaqPageSchema([{ question: "Q only" }])).toBeNull();
  });

  it("drops only the malformed entries, keeps the valid ones", () => {
    const result = buildFaqPageSchema([
      { question: "Valid?", answer: "Yes." },
      { question: "", answer: "Missing question" },
    ]);
    expect(result?.mainEntity).toHaveLength(1);
  });
});

describe("hasFaqPageSchema", () => {
  it("detects an existing FAQPage entry", () => {
    expect(hasFaqPageSchema([{ "@type": "FAQPage" }])).toBe(true);
    expect(hasFaqPageSchema([{ "@type": "BreadcrumbList" }])).toBe(false);
    expect(hasFaqPageSchema(null)).toBe(false);
  });
});

describe("injectAggregateRating", () => {
  const businessEntity = { "@type": "Dentist", address: { addressLocality: "Falls Church" } };
  const breadcrumb = { "@type": "BreadcrumbList" };

  it("injects a real rating only onto the business-entity element", () => {
    const result = injectAggregateRating([businessEntity, breadcrumb], {
      ratingValue: 4.98,
      reviewCount: 1521,
    });
    expect(result[0]).toEqual({
      ...businessEntity,
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.98",
        reviewCount: "1521",
        bestRating: "5",
        worstRating: "1",
      },
    });
    expect(result[1]).toEqual(breadcrumb);
  });

  it("leaves the array unchanged when rating is null — never fabricates", () => {
    const input = [businessEntity, breadcrumb];
    expect(injectAggregateRating(input, null)).toEqual(input);
  });

  it("returns an empty array for non-array input", () => {
    expect(injectAggregateRating(null, { ratingValue: 5, reviewCount: 10 })).toEqual([]);
  });
});

describe("trimTitleLength", () => {
  it("leaves titles at or under 60 chars unchanged", () => {
    const title = "Endodontist in Fredericksburg, VA | One Endodontics"; // 53 chars
    expect(trimTitleLength(title)).toEqual({ title, trimmed: false, unresolvable: false });
  });

  it("drops only the trailing brand segment when that's enough (real 70-char title)", () => {
    const result = trimTitleLength(
      "Patient Reviews: Root Canal Care in Falls Church, VA | One Endodontics"
    );
    expect(result).toEqual({
      title: "Patient Reviews: Root Canal Care in Falls Church, VA",
      trimmed: true,
      unresolvable: false,
    });
    expect(result.title.length).toBeLessThanOrEqual(60);
  });

  it("keeps the first two segments when dropping only the last isn't enough (real 68-char title)", () => {
    const result = trimTitleLength(
      "Endodontic Articles & Resources | Falls Church, VA | One Endodontics"
    );
    expect(result).toEqual({
      title: "Endodontic Articles & Resources | Falls Church, VA",
      trimmed: true,
      unresolvable: false,
    });
  });

  it("keeps the front keyword+location segment, only drops the brand tail (real 66-char title)", () => {
    const result = trimTitleLength(
      "First Visit Guide | Falls Church, VA Endodontist | One Endodontics"
    );
    expect(result).toEqual({
      title: "First Visit Guide | Falls Church, VA Endodontist",
      trimmed: true,
      unresolvable: false,
    });
  });

  it("flags as unresolvable rather than mid-word-truncate a single-segment over-limit title", () => {
    const longSingleSegment = "A".repeat(80);
    const result = trimTitleLength(longSingleSegment);
    expect(result).toEqual({ title: longSingleSegment, trimmed: false, unresolvable: true });
  });

  it("flags as unresolvable when even the first segment alone still exceeds the limit", () => {
    const result = trimTitleLength(`${"A".repeat(70)} | Brand`);
    expect(result.unresolvable).toBe(true);
    expect(result.title).toBe("A".repeat(70));
  });

  it("handles empty input without throwing", () => {
    expect(trimTitleLength("")).toEqual({ title: "", trimmed: false, unresolvable: false });
  });
});
