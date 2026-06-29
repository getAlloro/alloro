import { describe, expect, it } from "vitest";

import { formatPmsSourceType, getPmsCopyForValue } from "./pmsCopy";

const bannedGenericPatterns = [
  /PMS/,
  /Practice Management/i,
  /Referral Source/i,
  /Doctor referrals/i,
  /Self referrals/i,
  /Patient ID/i,
  /\bProduction\b/,
];

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenStrings);
  }
  return [];
}

describe("PMS org-type copy", () => {
  it("keeps the existing health wording", () => {
    const copy = getPmsCopyForValue("health");
    expect(copy.dataName).toBe("PMS Data");
    expect(copy.sourceLabel).toBe("Referral Source");
    expect(copy.customerIdLabel).toBe("Patient ID or Name");
    expect(copy.moneyLabel).toBe("Production");
    expect(copy.roleLabels.source).toBe("Referral Source");
  });

  it("maps legacy saas and generic values to revenue-data wording", () => {
    expect(getPmsCopyForValue("saas").dataName).toBe("Revenue Data");
    expect(getPmsCopyForValue("generic").sourceLabel).toBe("Source / Channel");
  });

  it("does not expose banned health terms in generic copy", () => {
    const genericStrings = flattenStrings(getPmsCopyForValue("generic"));
    for (const text of genericStrings) {
      for (const pattern of bannedGenericPatterns) {
        expect(text, `Unexpected generic PMS copy: ${text}`).not.toMatch(
          pattern,
        );
      }
    }
  });

  it("renders internal source types as client-facing labels", () => {
    const health = getPmsCopyForValue("health");
    const generic = getPmsCopyForValue("generic");
    expect(formatPmsSourceType(health, "self")).toBe("self");
    expect(formatPmsSourceType(health, "doctor")).toBe("doctor");
    expect(formatPmsSourceType(generic, "self")).toBe("direct");
    expect(formatPmsSourceType(generic, "doctor")).toBe("partner");
  });
});
