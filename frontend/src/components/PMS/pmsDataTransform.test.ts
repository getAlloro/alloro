import { describe, expect, it } from "vitest";

import {
  calculateTotals,
  invalidateAuthoritativeReferralTotal,
  transformBackendToUI,
  transformUIToBackend,
  type MonthEntryForm,
} from "./pmsDataTransform";

const nonAdditiveMonth: MonthEntryForm = {
  month: "2026-04",
  self_referrals: 8,
  doctor_referrals: 150,
  total_referrals: 156,
  production_total: 197042.9,
  sources: [
    {
      name: "Self",
      referrals: 8,
      production: 6301,
      inferred_referral_type: "self",
    },
    {
      name: "Smith Family Dental",
      referrals: 150,
      production: 190741.9,
      inferred_referral_type: "doctor",
    },
  ],
};

describe("authoritative PMS referral totals", () => {
  it("keeps a distinct-patient total separate from the source-row sum", () => {
    const [bucket] = transformBackendToUI([nonAdditiveMonth]);
    const totals = calculateTotals(
      bucket.rows,
      bucket.authoritativeTotalReferrals,
    );

    expect(totals.totalReferrals).toBe(156);
    expect(transformUIToBackend([bucket])[0]?.total_referrals).toBe(156);
  });

  it("returns to source-derived totals after a referral/source edit", () => {
    const [bucket] = transformBackendToUI([nonAdditiveMonth]);
    const derivedBucket = invalidateAuthoritativeReferralTotal(bucket);

    expect(derivedBucket.referralTotalMode).toBe("derived");
    expect(derivedBucket.authoritativeTotalReferrals).toBeUndefined();
    expect(calculateTotals(derivedBucket.rows).totalReferrals).toBe(158);
    expect(transformUIToBackend([derivedBucket])[0]?.total_referrals).toBe(158);
  });
});
