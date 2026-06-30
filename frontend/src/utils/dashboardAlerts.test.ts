import { describe, expect, it } from "vitest";

import { getPmsCopyForValue } from "../components/PMS/pmsCopy";
import { buildDashboardAlerts } from "./dashboardAlerts";
import { derivePmsFocusPeriod } from "./pmsFocusPeriod";

const bannedGenericPatterns = [
  /PMS/,
  /practice management/i,
  /\breferral\b/i,
  /\bproduction\b/i,
];

function alertText() {
  const copy = getPmsCopyForValue("generic");
  const focusPeriod = derivePmsFocusPeriod(
    [{ month: "2026-04", selfReferrals: 0, doctorReferrals: 0, totalReferrals: 0, productionTotal: 0 }],
    new Date(2026, 5, 15),
    copy,
  );
  const alerts = buildDashboardAlerts({
    insightsStale: true,
    focusPeriod,
    isOnboardingIncomplete: true,
    copy: { ...copy, orgNoun: "business" },
    actions: {
      getUpdatedInsights: { to: "/pmsStatistics" },
      uploadData: { to: "/pmsStatistics" },
      continueSetup: { to: "/new-account-onboarding" },
    },
  });

  return alerts
    .flatMap((alert) => [
      alert.eyebrow,
      alert.title,
      alert.body,
      alert.action.label,
    ])
    .join(" ");
}

describe("dashboard alert org-type copy", () => {
  it("uses revenue-data language for generic orgs", () => {
    const text = alertText();

    for (const pattern of bannedGenericPatterns) {
      expect(text).not.toMatch(pattern);
    }
    expect(text).toContain("May 2026 revenue data ready?");
    expect(text).toContain("Upload revenue data");
    expect(text).toContain("records and revenue insights");
    expect(text).toContain("Finish setting up your business");
  });
});
