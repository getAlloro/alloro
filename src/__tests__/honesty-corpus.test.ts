/**
 * Corpus integrity check — B2 honesty evaluation corpus (fixtures/honesty-corpus).
 *
 * This is NOT a gate test. B2's regex gate was REMOVED from this branch: its own
 * committed measurement against this corpus recorded a 69% miss rate and a 58%
 * false-positive rate, so the executable path was withdrawn and only the research
 * record was kept (see plans/07152026-cro-lift-rewrite/spec.html, Rev 5 + Rev 6).
 *
 * WHY THIS FILE EXISTS: the corpus header publishes counts and warns
 * "run, don't read — a prior sweep mis-reported these by reading the file."
 * These assertions make that warning executable, so the published counts cannot
 * silently drift from the data, and the evidence keeps a live reference instead
 * of looking like an unused fixture.
 *
 * It deliberately asserts NOTHING about pass/fail behaviour. Scoring requires a
 * classifier, and per Rev 5 no approved architecture exists to supply one.
 */

import { describe, it, expect } from "vitest";

import {
  OVER_CLAIMS,
  NEGATION_WHITEWASH,
  HONEST,
  BENIGN_MARKUP,
  SHOULD_BLOCK,
  SHOULD_PASS,
} from "./fixtures/honesty-corpus";

describe("honesty corpus — published counts (run, don't read)", () => {
  it("matches the counts published in the corpus header", () => {
    expect(OVER_CLAIMS).toHaveLength(74);
    expect(NEGATION_WHITEWASH).toHaveLength(12);
    expect(HONEST).toHaveLength(22);
    expect(BENIGN_MARKUP).toHaveLength(4);

    const total =
      OVER_CLAIMS.length + NEGATION_WHITEWASH.length + HONEST.length + BENIGN_MARKUP.length;
    expect(total).toBe(112);
  });

  it("derives the two scoring sets from the four buckets, with no contradiction", () => {
    expect(SHOULD_BLOCK).toHaveLength(86);
    expect(SHOULD_PASS).toHaveLength(26);

    // No string may be both a should-block and a should-pass expectation.
    const passSet = new Set(SHOULD_PASS);
    expect(SHOULD_BLOCK.filter((s) => passSet.has(s))).toEqual([]);
  });
});

describe("honesty corpus — data integrity", () => {
  it("carries no duplicate strings (a duplicate would silently reweight any score)", () => {
    const all = [...SHOULD_BLOCK, ...SHOULD_PASS];
    const seen = new Set<string>();
    const duplicates = all.filter((s) => (seen.has(s) ? true : (seen.add(s), false)));
    expect(duplicates).toEqual([]);
  });

  it("contains only non-empty strings", () => {
    const all = [...SHOULD_BLOCK, ...SHOULD_PASS];
    expect(all.every((s) => typeof s === "string" && s.trim().length > 0)).toBe(true);
  });

  it("preserves the byte-exact bypass characters the corpus was built to carry", () => {
    // Load-bearing per the corpus header: zero-width, homoglyph, accented chars.
    // If a reformat ever strips these, the corpus quietly stops carrying the
    // cases it claims to carry, so the record asserts they are still present.
    const overClaims = OVER_CLAIMS.join("");
    expect(overClaims).toContain("​"); // zero-width space
    expect(overClaims).toContain("bést"); // accented homoglyph
    expect(overClaims).toContain("ᴇ"); // small-caps homoglyph (ᴇ)
  });
});
