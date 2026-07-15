/**
 * Taste Profile — composition + Tier-2 honesty gate unit tests.
 *
 * Pure-function coverage with MOCKED extractor outputs (no live Google/GBP,
 * no DB, no network). Proves the four behaviors the spec's enforcement tiers
 * require:
 *   1. a clean profile keeps every sourced, honest claim;
 *   2. a claim with no source is DROPPED (never fabricated into a source);
 *   3. rank / guarantee / invented-metric language is REJECTED;
 *   4. empty / absent data yields empty fields, never invented ones.
 * Plus the adapter's review-source resolution (the wire-together to the real
 * `ThemeExtractionResult` / `DistilledContent` shapes).
 */

import { describe, expect, it } from "vitest";

import {
  composeTasteProfile,
  buildCandidatesFromExtractors,
  type TasteProfileCandidates,
  type ExtractorBundle,
} from "../controllers/admin-websites/feature-services/service.taste-profile";
import {
  enforceHonesty,
  isRealSource,
} from "../controllers/admin-websites/feature-utils/util.taste-profile-honesty";
import type { ThemeExtractionResult } from "../services/reviewThemeExtractor";
import type { DistilledContent } from "../controllers/admin-websites/feature-services/service.identity-distillation";

function baseCandidates(
  overrides: Partial<TasteProfileCandidates> = {}
): TasteProfileCandidates {
  return {
    business_name: "Art of Sleep Dentistry",
    business_category: "Sleep dentist",
    voice: { archetype: "family-friendly", tone_descriptor: "warm, calm" },
    ...overrides,
  };
}

describe("composeTasteProfile — honesty gate", () => {
  it("keeps every sourced, honest claim (clean profile)", () => {
    const { profile, audit } = composeTasteProfile(
      baseCandidates({
        suggested_headline: "Finally sleep through the night",
        hero_quote: {
          value: "Dr. Pawlak gave me my sleep back.",
          source: "review:1001",
        },
        praise_themes: [
          { value: "Gentle care: never felt rushed", source: "review:1001" },
          { value: "Clear explanations", source: "review:1002" },
        ],
        credentials: [
          { value: "Dr. Pawlak: Diplomate, ABDSM", source: "https://site/team" },
        ],
        practice_facts: [
          { value: "Offers oral appliance therapy", source: 'page_content: "oral appliance"' },
        ],
        why_they_choose: [
          { value: "Customers choose Art of Sleep for gentle care.", source: "review:1001" },
        ],
      })
    );

    expect(profile.hero_quote).toEqual({
      value: "Dr. Pawlak gave me my sleep back.",
      source: "review:1001",
    });
    expect(profile.suggested_headline).toBe("Finally sleep through the night");
    expect(profile.praise_themes).toHaveLength(2);
    expect(profile.credentials).toHaveLength(1);
    expect(profile.practice_facts).toHaveLength(1);
    expect(profile.customer_journey.why_they_choose).toHaveLength(1);
    // 1 hero + 2 themes + 1 cred + 1 fact + 1 why = 6 kept claims.
    expect(audit.kept).toBe(6);
    expect(audit.dropped).toHaveLength(0);
    expect(audit.rejected).toHaveLength(0);
  });

  it("drops a claim that has no real source", () => {
    const { profile, audit } = composeTasteProfile(
      baseCandidates({
        hero_quote: { value: "Best dentist in town.", source: null },
        praise_themes: [
          { value: "Great with kids", source: "review:2001" },
          { value: "Runs on time", source: "" }, // empty source → dropped
          { value: "Spotless office", source: "unknown" }, // placeholder → dropped
        ],
      })
    );

    expect(profile.hero_quote).toBeNull();
    expect(profile.praise_themes).toHaveLength(1);
    expect(profile.praise_themes[0].value).toBe("Great with kids");
    expect(audit.dropped).toHaveLength(3);
    expect(audit.dropped.every((d) => d.reason === "no_source")).toBe(true);
    expect(audit.rejected).toHaveLength(0);
  });

  it("rejects rank, guarantee, and invented-metric language", () => {
    const { profile, audit } = composeTasteProfile(
      baseCandidates({
        suggested_headline: "We guarantee you'll rank #1 on Google",
        hero_quote: { value: "Ranked number one in the city", source: "review:3001" },
        praise_themes: [
          { value: "3.4x more new patients", source: "review:3002" },
          { value: "Saved me $500 on treatment", source: "review:3003" },
          { value: "Warm, honest care", source: "review:3004" }, // clean → kept
        ],
      })
    );

    // Headline (generated copy) tripped → emptied + recorded.
    expect(profile.suggested_headline).toBe("");
    expect(profile.hero_quote).toBeNull();
    expect(profile.praise_themes).toHaveLength(1);
    expect(profile.praise_themes[0].value).toBe("Warm, honest care");

    // hero (rank) + 2 themes (metric, dollar) + headline = 4 rejected.
    expect(audit.rejected).toHaveLength(4);
    const heroReject = audit.rejected.find((r) => r.field === "hero_quote");
    expect(heroReject?.reasonCodes).toContain("rank_or_visibility_promise");
    const headlineReject = audit.rejected.find((r) => r.field === "suggested_headline");
    expect(headlineReject?.reasonCodes).toEqual(
      expect.arrayContaining(["guarantee_or_outcome_claim", "rank_or_visibility_promise"])
    );
    expect(audit.dropped).toHaveLength(0);
    expect(audit.kept).toBe(1);
  });

  it("yields empty fields (never fabricated) when data is absent", () => {
    const { profile, audit } = composeTasteProfile(baseCandidates());

    expect(profile.hero_quote).toBeNull();
    expect(profile.unique_strength).toBeNull();
    expect(profile.suggested_headline).toBe("");
    expect(profile.praise_themes).toEqual([]);
    expect(profile.credentials).toEqual([]);
    expect(profile.practice_facts).toEqual([]);
    expect(profile.customer_journey.why_they_choose).toEqual([]);
    expect(profile.customer_journey.what_makes_them_hesitate).toEqual([]);
    // Voice is descriptive metadata, not a sourced claim — passes through.
    expect(profile.voice.archetype).toBe("family-friendly");
    expect(audit.kept).toBe(0);
    expect(audit.dropped).toHaveLength(0);
    expect(audit.rejected).toHaveLength(0);
  });

  it("populates the hesitation layer only from real signals", () => {
    const withSignal = composeTasteProfile(
      baseCandidates({
        what_makes_them_hesitate: [
          { value: "Worried it would be expensive", source: "review:4001" },
        ],
      })
    );
    expect(withSignal.profile.customer_journey.what_makes_them_hesitate).toHaveLength(1);

    const withoutSignal = composeTasteProfile(baseCandidates());
    expect(
      withoutSignal.profile.customer_journey.what_makes_them_hesitate
    ).toEqual([]);
  });
});

describe("enforceHonesty / isRealSource", () => {
  it("passes clean claim text", () => {
    expect(enforceHonesty("Gentle, patient care").ok).toBe(true);
    expect(enforceHonesty("Dr. Pawlak explained every step").ok).toBe(true);
  });

  it("flags each banned category with a reason code", () => {
    expect(enforceHonesty("We guarantee results").reasonCodes).toContain(
      "guarantee_or_outcome_claim"
    );
    expect(enforceHonesty("get found on the first page").reasonCodes).toContain(
      "rank_or_visibility_promise"
    );
    expect(enforceHonesty("10x more bookings").reasonCodes).toContain(
      "invented_metric"
    );
    expect(enforceHonesty("saved $1,200").reasonCodes).toContain("invented_metric");
  });

  it("treats placeholders and blanks as non-sources", () => {
    expect(isRealSource("review:9")).toBe(true);
    expect(isRealSource("https://site/x")).toBe(true);
    expect(isRealSource("")).toBe(false);
    expect(isRealSource("  ")).toBe(false);
    expect(isRealSource("unknown")).toBe(false);
    expect(isRealSource("N/A")).toBe(false);
    expect(isRealSource(null)).toBe(false);
    expect(isRealSource(undefined)).toBe(false);
  });
});

describe("buildCandidatesFromExtractors — wire-together + source resolution", () => {
  const themeResult: ThemeExtractionResult = {
    heroQuote: "Dr. Pawlak gave me my sleep back",
    heroReviewerName: "Jane D.",
    topThemes: [
      {
        theme: "Gentle care",
        frequency: 40,
        sentiment: "positive",
        exampleQuote: "never felt rushed",
        reviewerName: "Sam P.",
      },
    ],
    uniqueStrength: "Only sleep-focused practice in the area",
    suggestedHeadline: "Sleep through the night again",
    customerVoiceSummary: "Patients feel cared for.",
  };

  const distilled: DistilledContent = {
    doctors: [
      {
        name: "Dr. Pawlak",
        source_url: "https://artofsleep/team",
        short_blurb: null,
        last_synced_at: "2026-07-14T00:00:00.000Z",
        credentials: ["Diplomate, ABDSM"],
      },
    ],
    services: [],
  };

  const bundle: ExtractorBundle = {
    businessName: "Art of Sleep",
    businessCategory: "Sleep dentist",
    themeResult,
    distilled,
    archetype: { archetype: "family-friendly", tone_descriptor: "warm" },
    practiceFacts: [
      {
        fact_text: "Offers oral appliance therapy",
        source_field: "page_content",
        source_excerpt: "we provide oral appliance therapy",
      },
    ],
    reviews: [
      { id: 1001, authorName: "Jane D.", text: "Dr. Pawlak gave me my sleep back" },
      { id: 1002, authorName: "Sam P.", text: "the team never felt rushed with me" },
    ],
  };

  it("resolves review-derived claims to real review ids and keeps them", () => {
    const candidates = buildCandidatesFromExtractors(bundle);
    const { profile, audit } = composeTasteProfile(candidates);

    expect(profile.hero_quote?.source).toBe("review:1001");
    expect(profile.praise_themes).toHaveLength(1);
    expect(profile.praise_themes[0].source).toBe("review:1002");
    expect(profile.credentials[0].source).toBe("https://artofsleep/team");
    expect(profile.practice_facts[0].value).toBe("Offers oral appliance therapy");
    // why_they_choose mirrors the sourced theme (Alloro's journey addition).
    expect(profile.customer_journey.why_they_choose[0].source).toBe("review:1002");
    // unique_strength has no per-item review source → dropped, not fabricated.
    expect(profile.unique_strength).toBeNull();
    expect(audit.dropped.some((d) => d.field === "unique_strength")).toBe(true);
  });

  it("drops a review claim that resolves to no real review", () => {
    const candidates = buildCandidatesFromExtractors({
      ...bundle,
      reviews: [], // nothing to resolve against
    });
    const { profile, audit } = composeTasteProfile(candidates);

    expect(profile.hero_quote).toBeNull();
    expect(profile.praise_themes).toEqual([]);
    // Credentials + facts still source-linked (they don't depend on reviews).
    expect(profile.credentials).toHaveLength(1);
    expect(profile.practice_facts).toHaveLength(1);
    expect(audit.dropped.some((d) => d.field === "hero_quote")).toBe(true);
  });
});
