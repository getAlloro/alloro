/**
 * Unit tests — org-type vocabulary (config/orgLabels) + the prompt
 * placeholder substituter (agents/service.prompt-substituter).
 *
 * Load-bearing guarantees for the generic-verbiage feature:
 *   • resolveOrgType — NULL/undefined/legacy default to "health"; "saas" and
 *     "generic" both resolve to "generic"; "health" stays "health".
 *   • substitution — every known {{token}} resolves to the right vocabulary
 *     per org type, prompts with no tokens pass through byte-for-byte, and an
 *     unknown token is left in place (fail-safe, never throws).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveOrgType, resolveLabels } from "../config/orgLabels";
import { substitutePromptPlaceholders } from "../agents/service.prompt-substituter";

describe("resolveOrgType", () => {
  it("defaults NULL / undefined / unknown to health", () => {
    expect(resolveOrgType(null)).toBe("health");
    expect(resolveOrgType(undefined)).toBe("health");
    expect(resolveOrgType("something-else")).toBe("health");
    expect(resolveOrgType("health")).toBe("health");
  });

  it("treats legacy 'saas' and 'generic' as generic", () => {
    expect(resolveOrgType("saas")).toBe("generic");
    expect(resolveOrgType("generic")).toBe("generic");
  });
});

describe("resolveLabels", () => {
  it("returns the healthcare vocabulary for health", () => {
    const l = resolveLabels("health");
    expect(l.customer).toBe("patient");
    expect(l.customers).toBe("patients");
    expect(l.org_noun).toBe("practice");
    expect(l.revenue_noun).toBe("production");
    expect(l.data_product).toBe("PMS data");
    expect(l.volume_noun_plural).toBe("referrals");
    expect(l.leads).toBe("referrals");
    expect(l.provider_subject).toBe("the doctor");
    expect(l.specialty_default).toBe("orthodontist");
    expect(l.management_software).toBe("PMS");
    expect(l.source_dedupe_specialist).toBe("dental/medical referral source");
    expect(l.private_detail_rule).toContain("protected health information");
  });

  it("returns the generic vocabulary for generic", () => {
    const l = resolveLabels("generic");
    expect(l.customer).toBe("customer");
    expect(l.customers).toBe("customers");
    expect(l.org_noun).toBe("business");
    expect(l.revenue_noun).toBe("revenue");
    expect(l.data_product).toBe("revenue data");
    expect(l.volume_noun_plural).toBe("records");
    expect(l.leads).toBe("leads");
    expect(l.provider_subject).toBe("you");
    expect(l.referral_partner).toBe("partner");
    expect(l.management_software).toBe("customer or revenue-management software");
    expect(l.source_dedupe_specialist).toBe("revenue source");
    expect(l.private_detail_rule).toContain("protected customer information");
  });
});

describe("substitutePromptPlaceholders", () => {
  it("resolves a token to healthcare wording for health", () => {
    expect(substitutePromptPlaceholders("Thank our {{customers}}.", "health")).toBe(
      "Thank our patients."
    );
  });

  it("resolves the same token to generic wording for generic", () => {
    expect(substitutePromptPlaceholders("Thank our {{customers}}.", "generic")).toBe(
      "Thank our customers."
    );
  });

  it("resolves multiple distinct tokens in one prompt", () => {
    const tpl = "Tell {{provider_subject}} which {{leads}} grow {{revenue_noun}}.";
    expect(substitutePromptPlaceholders(tpl, "health")).toBe(
      "Tell the doctor which referrals grow production."
    );
    expect(substitutePromptPlaceholders(tpl, "generic")).toBe(
      "Tell you which leads grow revenue."
    );
  });

  it("passes a prompt with no tokens through unchanged", () => {
    const prompt = "Return strict JSON only: {\"reply\":\"...\"}.";
    expect(substitutePromptPlaceholders(prompt, "generic")).toBe(prompt);
  });

  it("leaves an unknown token in place (fail-safe, no throw)", () => {
    expect(substitutePromptPlaceholders("keep {{not_a_real_token}} here", "health")).toBe(
      "keep {{not_a_real_token}} here"
    );
  });

  it("substitutes generic monthly-agent prompt prose to revenue-data wording", () => {
    const referralPrompt = fs.readFileSync(
      path.join(process.cwd(), "src/agents/monthlyAgents/ReferralEngineAnalysis.md"),
      "utf8"
    );
    const summaryPrompt = fs.readFileSync(
      path.join(process.cwd(), "src/agents/monthlyAgents/Summary.md"),
      "utf8"
    );

    const genericReferral = substitutePromptPlaceholders(referralPrompt, "generic");
    const genericSummary = substitutePromptPlaceholders(summaryPrompt, "generic");

    expect(genericReferral).toContain("Using this month's revenue data");
    expect(genericReferral).toContain("Revenue data → required");
    expect(genericReferral).toContain("Revenue Performance Report that tells you");
    expect(genericReferral).not.toContain("Using this month's PMS referral data");

    expect(genericSummary).toContain("have already analyzed records, rankings");
    expect(genericSummary).toContain(
      "Pick the single highest-priority monthly action for you"
    );
    expect(genericSummary).not.toContain(
      "Pick the single highest-priority monthly action for the doctor"
    );
  });
});
