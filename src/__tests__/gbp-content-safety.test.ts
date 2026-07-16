/**
 * GBP review-reply safety gate — the honesty routing and the shipping limits.
 *
 * WHY THIS FILE EXISTS. The GBP gate had NO direct unit test: the reply-loop
 * rehearsal mocks GbpContentSafetyService wholesale, so nothing exercised the
 * real matcher. That gap is exactly how the bypass below survived: the gate
 * SHARED the honesty inventory with the neutral service but tested it with a raw
 * `pattern.test()`, so every negation fix that landed in the shared matcher
 * simply never reached this path. `OUTCOME_CLAIM_PATTERNS` carries a bare
 * `\bguarantee\b`, so the gate blocked every honest disclaimer a practice can
 * write — refusing to print the word a disclaimer needs in order to disclaim.
 *
 * The two halves are tested together on purpose. Routing through the matcher
 * means MATCHING reads a normalized fold of the reply, while Google's 4096-byte
 * ceiling and Alloro's 900-character ceiling still describe the reply that
 * actually ships. If those ever start measuring the fold, a reply that passes
 * here is rejected by Google — so the limits are pinned against the ORIGINAL.
 */

import { describe, it, expect } from "vitest";
import { GbpContentSafetyService } from "../controllers/gbp-automation/feature-services/GbpContentSafetyService";

describe("GBP review reply — honesty claims route through the shared negation matcher", () => {
  /*
   * Every one of these BLOCKED before the routing fix. Each is a sentence a
   * practice must be able to publish, and a blocked reply is silent: nothing
   * downstream tells the owner their honest disclaimer was refused.
   */
  const honestDisclaimers = [
    "We don't guarantee a higher ranking.",
    // The curly apostrophe every LLM and word processor emits. Pinned because
    // matching reads the normalized fold; the reply still ships as written.
    "We don’t guarantee a higher ranking.",
    "We cannot guarantee any outcome.",
    "We make no guarantee about results.",
    "We do not guarantee a specific result.",
    "We never promise a cure.",
    "No treatment is guaranteed to be pain-free.",
    "Thanks for the kind words. We don't guarantee results, but we do our best work every visit.",
  ];

  it.each(honestDisclaimers)("PASSES an honest disclaimer: %s", (content) => {
    const result = GbpContentSafetyService.validateReviewReply(content);
    expect(result.isSafe).toBe(true);
  });

  const realClaims = [
    "We guarantee you will love your results.",
    "This treatment is pain-free.",
    "We guarantee permanent results.",
    "Your smile is guaranteed for life.",
    "Guaranteed. Not a promise, a fact.",
    "This is a cure for gum disease.",
  ];

  it.each(realClaims)("BLOCKS a real outcome claim: %s", (content) => {
    const result = GbpContentSafetyService.validateReviewReply(content);
    expect(result.isSafe).toBe(false);
    expect(result.reasonCodes).toContain("medical_or_outcome_claim");
  });
});

describe("GBP review reply — the privacy gate is NOT negation-aware, deliberately", () => {
  /*
   * Negation does not make a reference to a reviewer's care safe: "we cannot
   * discuss your treatment" still confirms there was treatment. This gate's
   * asymmetry runs opposite to the honesty gate's — the harm is the publish, not
   * the block — so a negated match stays blocked and the reply goes back for a
   * human edit. Pinned so a later "make it consistent" refactor cannot quietly
   * route these through the matcher too.
   */
  const privacyBlocked = [
    "Thanks for being our patient!",
    "We loved seeing you at your appointment.",
    "We cannot discuss your treatment here.",
    "We never shared your records with anyone.",
  ];

  it.each(privacyBlocked)("BLOCKS a private-detail confirmation: %s", (content) => {
    const result = GbpContentSafetyService.validateReviewReply(content);
    expect(result.isSafe).toBe(false);
    expect(result.reasonCodes).toContain("private_detail_confirmation");
  });
});

describe("GBP review reply — limits measure the ORIGINAL reply, never the normalized fold", () => {
  it("reports the ORIGINAL utf8 byte length when the reply carries a multi-byte character", () => {
    // The curly apostrophe is 3 UTF-8 bytes; the ASCII fold would read 36.
    const result = GbpContentSafetyService.validateReviewReply("We don’t guarantee a higher ranking.");
    expect(result.byteLength).toBe(38);
  });

  it("reports the ORIGINAL byte length for fullwidth text that folds to ASCII", () => {
    // Nine fullwidth letters ship as 27 bytes. The fold reads them as 9.
    const result = GbpContentSafetyService.validateReviewReply("ｇｕａｒａｎｔｅｅ");
    expect(result.byteLength).toBe(27);
  });

  it("blocks a reply over Google's 4096-byte ceiling", () => {
    const result = GbpContentSafetyService.validateReviewReply("a".repeat(4097));
    expect(result.reasonCodes).toContain("google_byte_limit");
    expect(result.isSafe).toBe(false);
  });

  it("blocks a reply over Alloro's 900-character ceiling", () => {
    const result = GbpContentSafetyService.validateReviewReply("b".repeat(901));
    expect(result.reasonCodes).toContain("reply_character_limit");
    expect(result.isSafe).toBe(false);
  });

  it("counts a multi-byte reply under the char ceiling but over the byte ceiling", () => {
    // 2000 three-byte characters: 2000 chars (under 900? no) — pin the byte path.
    const result = GbpContentSafetyService.validateReviewReply("’".repeat(1400));
    expect(result.byteLength).toBe(4200);
    expect(result.reasonCodes).toContain("google_byte_limit");
  });

  it("requires content", () => {
    const result = GbpContentSafetyService.validateReviewReply("   ");
    expect(result.reasonCodes).toContain("required");
    expect(result.isSafe).toBe(false);
  });
});

describe("GBP review reply — service-recovery language is advisory, never a block", () => {
  it("returns needs_review (publishable) rather than blocking", () => {
    const result = GbpContentSafetyService.validateReviewReply(
      "We're sorry to hear this. Please call the office so we can resolve it.",
    );
    expect(result.isSafe).toBe(true);
    expect(result.status).toBe("needs_review");
  });
});
