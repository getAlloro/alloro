import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { MonthBucket } from "./types";
import { usePmsManualEntryRows } from "./usePmsManualEntryRows";

const authoritativeMonth: MonthBucket = {
  id: 1,
  month: "2026-04",
  authoritativeTotalReferrals: 156,
  referralTotalMode: "authoritative",
  rows: [
    {
      id: 10,
      source: "Smith Family Dental",
      type: "doctor",
      referrals: "158",
      production: "100",
    },
  ],
};

function useRowsHarness() {
  const [months, setMonths] = useState<MonthBucket[]>([authoritativeMonth]);
  const [, setActiveMonthId] = useState<number | null>(1);
  const [, setError] = useState<string | null>(null);
  const [, setConfirmDeleteMonthId] = useState<number | null>(null);
  const [, setConfirmDeleteRowId] = useState<number | null>(null);
  const [, setShowMonthPicker] = useState(false);
  const [, setPickerStep] = useState<"month" | "year">("month");
  const [, setTempMonth] = useState<string | null>(null);
  const activeMonth = months[0];
  const handlers = usePmsManualEntryRows({
    activeMonth,
    sortedMonths: months,
    months,
    rows: activeMonth?.rows ?? [],
    setMonths,
    setActiveMonthId,
    setError,
    setConfirmDeleteMonthId,
    setConfirmDeleteRowId,
    setShowMonthPicker,
    setPickerStep,
    setTempMonth,
  });
  return { months, handlers };
}

describe("usePmsManualEntryRows authoritative total invalidation", () => {
  it("keeps the authoritative referral total for production-only edits", () => {
    const { result } = renderHook(useRowsHarness);

    act(() => result.current.handlers.updateRow(10, "production", "250"));

    expect(result.current.months[0]?.referralTotalMode).toBe("authoritative");
    expect(result.current.months[0]?.authoritativeTotalReferrals).toBe(156);
  });

  it("invalidates the total when a source or referral count changes", () => {
    const { result } = renderHook(useRowsHarness);

    act(() => result.current.handlers.updateRow(10, "source", "New Name"));

    expect(result.current.months[0]?.referralTotalMode).toBe("derived");
    expect(
      result.current.months[0]?.authoritativeTotalReferrals,
    ).toBeUndefined();
  });
});
