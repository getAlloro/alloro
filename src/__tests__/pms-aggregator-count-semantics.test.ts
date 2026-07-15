import { describe, expect, it } from "vitest";
import { shouldReconcileSourceReferralTotal } from "../utils/pms/pmsAggregator";

describe("PMS source referral reconciliation semantics", () => {
  it("keeps reconciliation enabled for legacy jobs without parser metadata", () => {
    expect(shouldReconcileSourceReferralTotal({ monthly_rollup: [] })).toBe(
      true,
    );
  });

  it("skips reconciliation for declared global and per-source distinct counts", () => {
    expect(
      shouldReconcileSourceReferralTotal({
        monthly_rollup: [],
        parser_metadata: {
          parser_type: "dentalemr",
          referral_count_semantics: "unique_patient_global",
          source_referral_count_semantics: "unique_patient_per_source",
          requires_sanitization: false,
        },
      }),
    ).toBe(false);
  });

  it("does not disable quality checks for incomplete or unknown declarations", () => {
    expect(
      shouldReconcileSourceReferralTotal({
        parser_metadata: {
          referral_count_semantics: "unique_patient_global",
          source_referral_count_semantics: "additive",
        },
      }),
    ).toBe(true);
  });
});
