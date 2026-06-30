import { describe, expect, it } from "vitest";

import { formatGeneratedCopyForOrg } from "./generatedCopy";

const bannedGenericPatterns = [
  /PMS/,
  /practice management/i,
  /doctor referral source/i,
  /\bdoctor\b/i,
  /\bpatients\b/i,
  /\breferrals\b/i,
  /\bproduction\b/i,
  /practice staff/i,
];

describe("formatGeneratedCopyForOrg", () => {
  it("leaves healthcare copy unchanged for health orgs", () => {
    const text =
      "Call the top doctor referral source after 14 patients drove production from PMS data.";

    expect(formatGeneratedCopyForOrg(text, "health")).toBe(text);
  });

  it("translates stale healthcare prose for generic orgs", () => {
    const text =
      "Call the top doctor referral source after 14 patients drove production from PMS data.";
    const formatted = formatGeneratedCopyForOrg(text, "generic");

    for (const pattern of bannedGenericPatterns) {
      expect(formatted).not.toMatch(pattern);
    }
    expect(formatted).toContain("partner source");
    expect(formatted).toContain("customers");
    expect(formatted).toContain("revenue");
    expect(formatted).toMatch(/revenue data/i);
  });

  it("passes nullish values through", () => {
    expect(formatGeneratedCopyForOrg(null, "generic")).toBeNull();
    expect(formatGeneratedCopyForOrg(undefined, "generic")).toBeUndefined();
  });

  it("translates stale task-card prose without changing source names", () => {
    const text =
      "The doctor/owner must personally reach out to Dr Malhan because referrals stopped. Practice staff should use patient-friendly language and confirm production value.";
    const formatted = formatGeneratedCopyForOrg(text, "generic");

    for (const pattern of bannedGenericPatterns) {
      expect(formatted).not.toMatch(pattern);
    }
    expect(formatted).toContain("partner/owner");
    expect(formatted).toContain("Dr Malhan");
    expect(formatted).toContain("records stopped");
    expect(formatted).toContain("Business staff");
    expect(formatted).toContain("customer-friendly language");
    expect(formatted).toContain("revenue value");
  });
});
