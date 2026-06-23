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
    expect(l.leads).toBe("referrals");
    expect(l.provider_subject).toBe("the doctor");
    expect(l.specialty_default).toBe("orthodontist");
  });

  it("returns the generic vocabulary for generic", () => {
    const l = resolveLabels("generic");
    expect(l.customer).toBe("customer");
    expect(l.customers).toBe("customers");
    expect(l.org_noun).toBe("business");
    expect(l.revenue_noun).toBe("revenue");
    expect(l.leads).toBe("leads");
    expect(l.provider_subject).toBe("you");
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
});
