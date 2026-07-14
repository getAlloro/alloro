import { useCallback } from "react";

import {
  addMonths,
  invalidateAuthoritativeReferralTotal,
} from "./pmsDataTransform";
import type { MonthBucket, SourceRow } from "./types";
import { getPreviousMonth } from "./pmsManualEntryModal.utils";

/**
 * Month- and row-management slice of usePmsManualEntry, lifted verbatim as a
 * contiguous trailing block of hooks. Nothing declared after this block in the
 * original hook depended on it, so it is relocated as a child hook called at
 * the exact position the block occupied — keeping the overall hook-call order
 * (and behavior) identical. Inputs are the reactive values/setters these
 * handlers closed over; the return is what the JSX consumed.
 */
interface UsePmsManualEntryRowsParams {
  activeMonth: MonthBucket | undefined;
  sortedMonths: MonthBucket[];
  months: MonthBucket[];
  rows: SourceRow[];
  targetMonth?: string | null;
  setMonths: React.Dispatch<React.SetStateAction<MonthBucket[]>>;
  setActiveMonthId: React.Dispatch<React.SetStateAction<number | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setConfirmDeleteMonthId: React.Dispatch<React.SetStateAction<number | null>>;
  setConfirmDeleteRowId: React.Dispatch<React.SetStateAction<number | null>>;
  setShowMonthPicker: React.Dispatch<React.SetStateAction<boolean>>;
  setPickerStep: React.Dispatch<React.SetStateAction<"month" | "year">>;
  setTempMonth: React.Dispatch<React.SetStateAction<string | null>>;
}

export function usePmsManualEntryRows({
  activeMonth,
  sortedMonths,
  months,
  rows,
  targetMonth,
  setMonths,
  setActiveMonthId,
  setError,
  setConfirmDeleteMonthId,
  setConfirmDeleteRowId,
  setShowMonthPicker,
  setPickerStep,
  setTempMonth,
}: UsePmsManualEntryRowsParams) {
  // Month management
  const updateActiveMonth = useCallback(
    (patch: Partial<MonthBucket>) => {
      if (!activeMonth) return;
      setMonths((prev) =>
        prev.map((m) => (m.id === activeMonth.id ? { ...m, ...patch } : m)),
      );
    },
    [activeMonth, setMonths],
  );

  const addMonthBucket = useCallback(() => {
    if (targetMonth) return;
    const latest =
      sortedMonths[sortedMonths.length - 1]?.month ?? getPreviousMonth();
    let candidate = addMonths(latest, 1);

    // Ensure unique month
    const existing = new Set(months.map((m) => m.month));
    while (existing.has(candidate)) {
      candidate = addMonths(candidate, 1);
    }

    const newId = Date.now();
    setMonths((prev) => [...prev, { id: newId, month: candidate, rows: [] }]);
    setActiveMonthId(newId);
  }, [months, sortedMonths, targetMonth, setMonths, setActiveMonthId]);

  const deleteMonth = useCallback(
    (id: number) => {
      if (targetMonth) return;
      if (months.length === 1) {
        setError("At least one month is required");
        return;
      }

      const next = months.filter((m) => m.id !== id);
      setMonths(next);
      setConfirmDeleteMonthId(null);

      const nextSorted = [...next].sort((a, b) =>
        a.month.localeCompare(b.month),
      );
      if (nextSorted[0]) {
        setActiveMonthId(nextSorted[0].id);
      }
    },
    [
      months,
      targetMonth,
      setMonths,
      setError,
      setConfirmDeleteMonthId,
      setActiveMonthId,
    ],
  );

  const requestDeleteMonth = (id: number) => {
    setConfirmDeleteMonthId(id);
    setConfirmDeleteRowId(null);
  };

  // Row management
  const updateMonthRows = useCallback(
    (
      updater: (rows: SourceRow[]) => SourceRow[],
      shouldInvalidateReferralTotal = true,
    ) => {
      if (!activeMonth) return;
      setMonths((prev) =>
        prev.map((m) =>
          m.id === activeMonth.id
            ? shouldInvalidateReferralTotal
              ? invalidateAuthoritativeReferralTotal({
                  ...m,
                  rows: updater(m.rows),
                })
              : { ...m, rows: updater(m.rows) }
            : m,
        ),
      );
    },
    [activeMonth, setMonths],
  );

  const addRow = useCallback(() => {
    updateMonthRows((r) => [
      ...r,
      {
        id: Date.now(),
        source: "",
        type: "self" as const,
        referrals: "",
        production: "",
      },
    ]);
  }, [updateMonthRows]);

  const updateRow = useCallback(
    (id: number, field: keyof SourceRow, value: string) => {
      updateMonthRows(
        (rows) =>
          rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
        field !== "production",
      );
    },
    [updateMonthRows],
  );

  const handleTypeToggle = useCallback(
    (rowId: number) => {
      const row = rows.find((r) => r.id === rowId);
      if (row) {
        updateRow(rowId, "type", row.type === "self" ? "doctor" : "self");
      }
    },
    [rows, updateRow],
  );

  const deleteRow = useCallback(
    (rowId: number) => {
      updateMonthRows((rows) => rows.filter((row) => row.id !== rowId));
      setConfirmDeleteRowId(null);
    },
    [updateMonthRows, setConfirmDeleteRowId],
  );

  const requestDeleteRow = (rowId: number) => {
    setConfirmDeleteRowId(rowId);
    setConfirmDeleteMonthId(null);
  };

  const incrementField = useCallback(
    (rowId: number, field: "referrals" | "production", delta: number) => {
      updateMonthRows(
        (rows) =>
          rows.map((row) => {
            if (row.id === rowId) {
              const current = Number(row[field]) || 0;
              return { ...row, [field]: String(Math.max(0, current + delta)) };
            }
            return row;
          }),
        field === "referrals",
      );
    },
    [updateMonthRows],
  );

  // Month picker handlers
  const openMonthPicker = () => {
    if (targetMonth) return;
    if (!activeMonth) return;
    setShowMonthPicker(true);
    setPickerStep("month");
    setTempMonth(activeMonth.month.split("-")[1]);
  };

  const commitMonthChange = (ym: string) => {
    if (targetMonth) return;
    // Check if month already exists
    const existing = months.find(
      (m) => m.month === ym && m.id !== activeMonth?.id,
    );
    if (existing) {
      setError("This month already exists");
      return;
    }
    updateActiveMonth({ month: ym });
    setShowMonthPicker(false);
    setPickerStep("month");
    setTempMonth(null);
  };

  return {
    updateActiveMonth,
    addMonthBucket,
    deleteMonth,
    requestDeleteMonth,
    updateMonthRows,
    addRow,
    updateRow,
    handleTypeToggle,
    deleteRow,
    requestDeleteRow,
    incrementField,
    openMonthPicker,
    commitMonthChange,
  };
}
