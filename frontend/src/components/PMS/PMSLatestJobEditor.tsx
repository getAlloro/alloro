import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Calendar,
  DollarSign,
  Loader2,
  Plus,
  Save,
  Stethoscope,
  Trash2,
  User,
  X,
} from "lucide-react";

import { updatePmsJobResponse } from "../../api/pms";
import { formatDataMonthShort } from "../../utils/timeframe";
import {
  transformBackendToUI,
  transformUIToBackend,
  calculateTotals,
  sanitizeNumber,
  addMonths,
} from "./pmsDataTransform";
import type { MonthBucket, SourceRow } from "./types";
import { useLabels } from "../../hooks/useLabels";
import { logger } from "../../lib/logger";
import {
  ALORO_ORANGE,
  ALORO_ORANGE_DARK,
  normaliseMonthEntries,
} from "./pmsLatestJobEditor.utils";
import { Odometer } from "./PMSLatestJobEditor/Odometer";
import { MonthYearPickerModal } from "./PMSLatestJobEditor/MonthYearPickerModal";
import { SourceRowItem } from "./PMSLatestJobEditor/SourceRowItem";

interface PMSLatestJobEditorProps {
  isOpen: boolean;
  jobId: number;
  initialData: unknown;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onConfirmApproval?: () => Promise<void> | void;
}

export const PMSLatestJobEditor: React.FC<PMSLatestJobEditorProps> = ({
  isOpen,
  jobId,
  initialData,
  onClose,
  onSaved,
  onConfirmApproval,
}) => {
  const labels = useLabels();
  // ==================== STATE ====================
  const [months, setMonths] = useState<MonthBucket[]>([]);
  const [activeMonthId, setActiveMonthId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorMonthId, setErrorMonthId] = useState<number | null>(null);

  // Month picker modal state
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerStep, setPickerStep] = useState<"month" | "year">("month");
  const [tempMonth, setTempMonth] = useState<string | null>(null);

  // Confirmation dialogs
  const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<number | null>(
    null
  );
  const [confirmDeleteMonthId, setConfirmDeleteMonthId] = useState<
    number | null
  >(null);

  // Track if we've already initialized for the current open session
  const hasInitializedRef = React.useRef(false);

  // ==================== INITIALIZATION ====================
  // Only initialize when modal first opens, not on every initialData change
  // This prevents polling from resetting user's edits
  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      const normalized = normaliseMonthEntries(initialData);
      logger.log("🔍 Modal loaded - normalized data from backend:", {
        monthsCount: normalized.length,
        secondMonthSources: normalized[1]?.sources,
      });
      const uiMonths = transformBackendToUI(normalized);
      logger.log("🎯 Transformed to UI format:", {
        monthsCount: uiMonths.length,
        secondMonthRows: uiMonths[1]?.rows,
      });
      setMonths(uiMonths);
      setActiveMonthId(uiMonths[0]?.id ?? null);
      setError(null);
      setErrorMonthId(null);
      setShowMonthPicker(false);
      setConfirmDeleteRowId(null);
      setConfirmDeleteMonthId(null);
      hasInitializedRef.current = true;
    }
  }, [initialData, isOpen]);

  // Reset the initialization flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasInitializedRef.current = false;
    }
  }, [isOpen]);

  // ==================== DERIVED STATE (MEMOIZED) ====================
  const sortedMonths = useMemo(
    () => [...months].sort((a, b) => a.month.localeCompare(b.month)),
    [months]
  );

  const activeMonth = useMemo(() => {
    let found = months.find((m) => m.id === activeMonthId);
    if (!found && sortedMonths[0]) {
      found = sortedMonths[0];
    }
    return found;
  }, [months, activeMonthId, sortedMonths]);

  const rows = activeMonth?.rows ?? [];

  const totals = useMemo(() => calculateTotals(rows), [rows]);

  // Keep active month valid when list changes
  useEffect(() => {
    if (!activeMonth && sortedMonths[0]) {
      setActiveMonthId(sortedMonths[0].id);
    }
  }, [activeMonth, sortedMonths]);

  // ==================== MONTH MANAGEMENT ====================
  const updateActiveMonth = (patch: Partial<MonthBucket>) => {
    setMonths((prev) =>
      prev.map((m) => (m.id === activeMonth?.id ? { ...m, ...patch } : m))
    );
  };

  const addMonthBucket = () => {
    const latest =
      sortedMonths[sortedMonths.length - 1]?.month ??
      activeMonth?.month ??
      "2025-01";
    let candidate = addMonths(latest, 1);

    const existing = new Set(months.map((m) => m.month));
    while (existing.has(candidate)) {
      candidate = addMonths(candidate, 1);
    }

    const newId = Date.now();
    setMonths((prev) => [...prev, { id: newId, month: candidate, rows: [] }]);
    setActiveMonthId(newId);
  };

  const deleteMonth = (id: number) => {
    if (months.length === 1) {
      setError("At least one month is required");
      return;
    }

    const next = months.filter((m) => m.id !== id);
    setMonths(next);
    setConfirmDeleteMonthId(null);

    const nextSorted = [...next].sort((a, b) => a.month.localeCompare(b.month));
    if (nextSorted[0]) {
      setActiveMonthId(nextSorted[0].id);
    }
  };

  const requestDeleteMonth = (id: number) => {
    setConfirmDeleteMonthId(id);
    setConfirmDeleteRowId(null);
  };

  // ==================== ROW MANAGEMENT ====================
  const updateMonthRows = (updater: (rows: SourceRow[]) => SourceRow[]) => {
    setMonths((prev) =>
      prev.map((m) =>
        m.id === activeMonth?.id ? { ...m, rows: updater(m.rows) } : m
      )
    );
  };

  const addRow = () => {
    updateMonthRows((r) => [
      ...r,
      {
        id: Date.now(),
        source: "",
        type: "self",
        referrals: "",
        production: "",
      },
    ]);
  };

  const updateRow = (id: number, field: keyof SourceRow, value: string) => {
    updateMonthRows((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleSourceChange = (rowId: number, value: string) => {
    updateRow(rowId, "source", value);
  };

  const handleTypeToggle = (rowId: number) => {
    const row = rows.find((r) => r.id === rowId);
    if (row) {
      updateRow(rowId, "type", row.type === "self" ? "doctor" : "self");
    }
  };

  const handleReferralsChange = (rowId: number, value: string) => {
    const sanitized = sanitizeNumber(value);
    updateRow(rowId, "referrals", sanitized);
  };

  const handleProductionChange = (rowId: number, value: string) => {
    const sanitized = sanitizeNumber(value);
    updateRow(rowId, "production", sanitized);
  };

  const incrementField = (
    rowId: number,
    field: "referrals" | "production",
    delta: number
  ) => {
    updateMonthRows((rows) =>
      rows.map((row) => {
        if (row.id === rowId) {
          const current = Number(row[field]) || 0;
          const newValue = Math.max(0, current + delta);
          return { ...row, [field]: String(newValue) };
        }
        return row;
      })
    );
  };

  const deleteRow = (id: number) => {
    updateMonthRows((r) => r.filter((row) => row.id !== id));
    setConfirmDeleteRowId(null);
  };

  const requestDeleteRow = (id: number) => {
    setConfirmDeleteRowId(id);
    setConfirmDeleteMonthId(null);
  };

  // ==================== MONTH PICKER ====================
  const openMonthPicker = () => {
    setShowMonthPicker(true);
    setPickerStep("month");
    const parts = activeMonth?.month.split("-") ?? ["", ""];
    setTempMonth(parts[1]);
  };

  const commitMonthChange = (ym: string) => {
    updateActiveMonth({ month: ym });
    setShowMonthPicker(false);
    setPickerStep("month");
    setTempMonth(null);
  };

  // ==================== SAVE & CONFIRM ====================
  const handleSaveAndConfirm = async () => {
    if (!jobId) {
      setError("Job ID missing");
      return;
    }

    // Validation
    for (const month of months) {
      for (const row of month.rows) {
        if (!row.source?.trim()) {
          setError("All source names are required");
          setErrorMonthId(month.id);
          setActiveMonthId(month.id);
          return;
        }
        if (!row.referrals || Number(row.referrals) === 0) {
          setError("All referral counts must be greater than 0");
          setErrorMonthId(month.id);
          setActiveMonthId(month.id);
          return;
        }
      }
    }

    setIsSaving(true);
    setError(null);
    setErrorMonthId(null);

    try {
      const backendData = transformUIToBackend(months);
      const payload = JSON.stringify(backendData, null, 2);

      logger.log("💾 Saving modal changes - transformed data being sent:", {
        backendData,
        monthsSent: backendData.length,
        secondMonthSources: backendData[1]?.sources,
      });

      const response = await updatePmsJobResponse(jobId, payload);

      if (!response?.success) {
        throw new Error(
          response?.error || response?.message || "Failed to update PMS data"
        );
      }

      if (onConfirmApproval) {
        await onConfirmApproval();
      }

      await onSaved();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong while saving";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // ==================== RENDER ====================
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 200 }}
            className="relative flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ===== HEADER ===== */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Review Latest PMS Data
                </h2>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Job #{jobId}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* ===== BODY (SCROLLABLE) ===== */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {months.length === 0 || !activeMonth ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  No PMS records were found in the latest job.
                </div>
              ) : (
                <div className="space-y-8">
                  {/* ===== MONTH TABS ===== */}
                  <div className="flex items-center gap-2 mb-6 flex-wrap">
                    {sortedMonths.map((m) => {
                      const isActive = m.id === activeMonthId;
                      const hasError = m.id === errorMonthId;
                      return (
                        <div key={m.id} className="relative">
                          <motion.button
                            onClick={() => setActiveMonthId(m.id)}
                            className="px-4 py-2 rounded-full text-xs border pr-9 transition-colors"
                            style={{
                              backgroundColor: isActive
                                ? ALORO_ORANGE
                                : "transparent",
                              color: isActive ? "white" : undefined,
                              borderColor: hasError
                                ? "#ef4444"
                                : isActive
                                  ? ALORO_ORANGE
                                  : undefined,
                              boxShadow: hasError
                                ? "0 0 0 2px rgba(239, 68, 68, 0.1), inset 0 0 0 1px rgba(239, 68, 68, 0.5)"
                                : undefined,
                            }}
                          >
                            {formatDataMonthShort(m.month)}
                          </motion.button>

                          {/* Delete icon per tab */}
                          {sortedMonths.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                requestDeleteMonth(m.id);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors"
                              style={{
                                backgroundColor: isActive
                                  ? "rgba(255,255,255,0.22)"
                                  : "rgba(0,0,0,0.04)",
                                color: isActive ? "white" : "#ef4444",
                              }}
                              title="Delete month"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}

                          {/* Confirm tooltip (month) */}
                          <AnimatePresence>
                            {confirmDeleteMonthId === m.id && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -6 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -6 }}
                                className="absolute left-1/2 -translate-x-1/2 top-12 bg-white border rounded-xl shadow-lg p-3 z-20 w-56"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="text-xs mb-2 text-gray-700">
                                  Delete this month?
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <button
                                    onClick={() => deleteMonth(m.id)}
                                    className="text-xs px-3 py-1 rounded-lg text-white"
                                    style={{
                                      backgroundColor: ALORO_ORANGE_DARK,
                                    }}
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={() =>
                                      setConfirmDeleteMonthId(null)
                                    }
                                    className="text-xs px-3 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}

                    {/* Add month button */}
                    <button
                      onClick={addMonthBucket}
                      className="p-2 rounded-full border text-xs hover:bg-gray-50"
                      title="Add month"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {/* ===== SUMMARY CARDS ===== */}
                  <div className="grid grid-cols-5 gap-6">
                    {/* Month card (clickable) */}
                    <motion.div
                      layout
                      className="rounded-2xl border p-6 flex flex-col justify-center cursor-pointer hover:border-gray-300 transition-colors"
                      onClick={openMonthPicker}
                    >
                      <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 uppercase mb-3">
                        <Calendar size={14} />
                        Month
                      </div>
                      <div className="text-center text-xl font-semibold">
                        {formatDataMonthShort(activeMonth.month)}
                      </div>
                    </motion.div>

                    {/* Summary cards */}
                    {[
                      {
                        label: labels.selfReferrals,
                        value: totals.selfReferrals,
                        icon: User,
                        tint: "#C9765E22",
                      },
                      {
                        label: labels.doctorReferrals,
                        value: totals.doctorReferrals,
                        icon: Stethoscope,
                        tint: "#C9765E11",
                      },
                      {
                        label: labels.totalReferrals,
                        value: totals.totalReferrals,
                        icon: User,
                        tint: "#C9765E18",
                      },
                      {
                        label: labels.production,
                        value: totals.productionTotal.toLocaleString(),
                        icon: DollarSign,
                        tint: "#34D39922",
                      },
                    ].map((card, i) => (
                      <motion.div
                        key={i}
                        layout
                        className="rounded-2xl p-6 border flex flex-col justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${card.tint}, #ffffff)`,
                        }}
                      >
                        <div className="text-[11px] text-gray-400 uppercase text-center mb-2">
                          {card.label}
                        </div>
                        <div className="flex items-center justify-center gap-3 scale-90">
                          <card.icon size={22} className="text-gray-400" />
                          <Odometer value={card.value} />
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* ===== MONTH/YEAR PICKER MODAL ===== */}
                  <MonthYearPickerModal
                    showMonthPicker={showMonthPicker}
                    setShowMonthPicker={setShowMonthPicker}
                    pickerStep={pickerStep}
                    setPickerStep={setPickerStep}
                    tempMonth={tempMonth}
                    setTempMonth={setTempMonth}
                    activeMonthMonth={activeMonth.month}
                    commitMonthChange={commitMonthChange}
                  />

                  {/* ===== TABLE HEADER ===== */}
                  <div className="grid grid-cols-13 gap-4 mb-3 px-2 text-[11px] font-bold text-gray-400 uppercase">
                    <div className="col-span-3">Source</div>
                    <div className="col-span-2">Type</div>
                    <div className="col-span-3">Referral Count</div>
                    <div className="col-span-4">Production</div>
                    <div className="col-span-1" />
                  </div>

                  {/* ===== DATA GRID ROWS ===== */}
                  <AnimatePresence>
                    {rows.map((row) => (
                      <SourceRowItem
                        key={row.id}
                        row={row}
                        confirmDeleteRowId={confirmDeleteRowId}
                        handleSourceChange={handleSourceChange}
                        handleTypeToggle={handleTypeToggle}
                        handleReferralsChange={handleReferralsChange}
                        handleProductionChange={handleProductionChange}
                        incrementField={incrementField}
                        requestDeleteRow={requestDeleteRow}
                        deleteRow={deleteRow}
                        setConfirmDeleteRowId={setConfirmDeleteRowId}
                      />
                    ))}
                  </AnimatePresence>

                  {/* Add Source Button */}
                  <div className="flex justify-end mt-2 px-2">
                    <button
                      onClick={addRow}
                      className="flex items-center space-x-2 border rounded-full px-5 py-2 text-xs font-semibold transition-colors hover:bg-gray-50"
                      style={{ color: ALORO_ORANGE }}
                    >
                      <Plus size={16} />
                      <span>Add Source</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ===== FOOTER ===== */}
            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
              <div className="text-xs text-gray-500">
                {error && (
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold uppercase text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndConfirm}
                  disabled={isSaving || !jobId}
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    backgroundColor: ALORO_ORANGE,
                    borderColor: ALORO_ORANGE,
                  }}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Confirm and Get Insights
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
