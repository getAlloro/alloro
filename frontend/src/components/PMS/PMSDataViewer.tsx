/**
 * PMSDataViewer Component
 *
 * Displays and allows editing of PMS referral data in the new redesigned UI.
 * Can be used in both:
 * 1. PMSLatestJobEditor (client-facing modal for review & approval)
 * 2. PMSAutomationCards (admin dashboard for verification)
 *
 * Handles data parsing and detection of PMS data structures.
 */

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "../../lib/toast";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Calendar,
  DollarSign,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Stethoscope,
  Trash2,
  User,
  X,
} from "lucide-react";

import {
  transformBackendToUI,
  transformUIToBackend,
  calculateTotals,
  formatMoney,
  sanitizeNumber,
  type MonthEntryForm,
} from "./pmsDataTransform";
import { normaliseMonthEntries } from "./pmsDataViewer.utils";
import type { MonthBucket, SourceRow } from "./types";

interface PMSDataViewerProps {
  isOpen: boolean;
  jobId: number;
  title?: string;
  subtitle?: string;
  /** Drop the subtitle line entirely (month-scoped editor variant). */
  hideSubtitle?: boolean;
  initialData: unknown;
  initialMonth?: string | null;
  centerInMainView?: boolean;
  onClose: () => void;
  onSave?: (data: MonthEntryForm[]) => Promise<void>;
  readOnly?: boolean;
}

const ALORO_ORANGE = "#C9765E";
const ALORO_ORANGE_DARK = "#D66853";

const Odometer = ({ value }: { value: string | number }) => {
  const str = String(value);
  const digitHeight = 48;
  const digitWidth = 22;

  return (
    <div className="flex items-center overflow-visible">
      {str.split("").map((char, i) => {
        if (isNaN(Number(char))) {
          return (
            <div key={i} className="mx-0 text-2xl font-semibold leading-none">
              {char}
            </div>
          );
        }

        return (
          <div
            key={i}
            className="relative overflow-hidden"
            style={{ height: digitHeight, width: digitWidth }}
          >
            <motion.div
              animate={{ y: -Number(char) * digitHeight }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
              className="absolute top-0 left-0"
            >
              {Array.from({ length: 10 }).map((_, n) => (
                <div
                  key={n}
                  style={{ height: digitHeight }}
                  className="flex items-center justify-center text-3xl font-semibold leading-none"
                >
                  {n}
                </div>
              ))}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
};

export const PMSDataViewer: React.FC<PMSDataViewerProps> = ({
  isOpen,
  jobId,
  title = "View PMS Data",
  subtitle = "Review referral and production data",
  hideSubtitle = false,
  initialData,
  initialMonth,
  centerInMainView = false,
  onClose,
  onSave,
  readOnly = false,
}) => {
  const [months, setMonths] = useState<MonthBucket[]>([]);
  const [activeMonthId, setActiveMonthId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<number | null>(
    null
  );
  const [confirmDeleteMonthId, setConfirmDeleteMonthId] = useState<
    number | null
  >(null);

  // Only initialize on first open, not on data changes (prevents resetting during polling)
  useEffect(() => {
    if (isOpen && months.length === 0) {
      const normalized = initialMonth
        ? normaliseMonthEntries(initialData).filter(
            (entry) => entry.month === initialMonth
          )
        : normaliseMonthEntries(initialData);
      const uiMonths = transformBackendToUI(normalized);
      setMonths(uiMonths);
      setActiveMonthId(uiMonths[0]?.id ?? null);
      setError(null);
    }
  }, [initialData, initialMonth, isOpen, months.length]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setMonths([]);
      setActiveMonthId(null);
    }
  }, [isOpen]);

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

  const rows = useMemo(() => activeMonth?.rows ?? [], [activeMonth?.rows]);
  const totals = useMemo(() => calculateTotals(rows), [rows]);

  useEffect(() => {
    if (!activeMonth && sortedMonths[0]) {
      setActiveMonthId(sortedMonths[0].id);
    }
  }, [activeMonth, sortedMonths]);

  // Edit handlers (only when not read-only)
  const updateMonthRows = (updater: (rows: SourceRow[]) => SourceRow[]) => {
    if (readOnly) return;
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

  const handleTypeToggle = (rowId: number) => {
    const row = rows.find((r) => r.id === rowId);
    if (row) {
      updateRow(rowId, "type", row.type === "self" ? "doctor" : "self");
    }
  };

  const deleteRow = (rowId: number) => {
    updateMonthRows((rows) => rows.filter((row) => row.id !== rowId));
    setConfirmDeleteRowId(null);
  };

  const requestDeleteRow = (rowId: number) => {
    setConfirmDeleteRowId(rowId);
  };

  const deleteMonth = (monthId: number) => {
    if (months.length === 1) {
      setError("At least one month is required");
      return;
    }
    const next = months.filter((m) => m.id !== monthId);
    setMonths(next);
    setConfirmDeleteMonthId(null);
    const nextSorted = [...next].sort((a, b) => a.month.localeCompare(b.month));
    if (nextSorted[0]) {
      setActiveMonthId(nextSorted[0].id);
    }
  };

  const requestDeleteMonth = (monthId: number) => {
    setConfirmDeleteMonthId(monthId);
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
          return { ...row, [field]: String(Math.max(0, current + delta)) };
        }
        return row;
      })
    );
  };

  const handleSave = async () => {
    if (!onSave || readOnly) return;

    setIsSaving(true);
    setError(null);

    try {
      const backendData = transformUIToBackend(months);
      await onSave(backendData);
      toast.success("Changes saved successfully");
      // Close modal after successful save
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save data";
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const overlay = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={`fixed inset-y-0 right-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm ${
          centerInMainView ? "left-0 lg:left-72" : "left-0"
        }`}
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
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              {!hideSubtitle && (
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  {subtitle} • Job #{jobId}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {months.length === 0 || !activeMonth ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                No PMS records found.
              </div>
            ) : (
              <div className="space-y-8">
                {/* Month Tabs — hidden when scoped to a single month: the
                    data is pre-filtered, so the pill (and its delete) would
                    be a dead/dangerous control. */}
                {!initialMonth && (
                <div className="flex items-center gap-2 flex-wrap">
                  {sortedMonths.map((m) => {
                    const isActive = m.id === activeMonthId;
                    return (
                      <div key={m.id} className="relative">
                        <motion.button
                          onClick={() => setActiveMonthId(m.id)}
                          className="px-4 py-2 rounded-full text-xs border pr-9"
                          style={{
                            backgroundColor: isActive
                              ? ALORO_ORANGE
                              : "transparent",
                            color: isActive ? "white" : undefined,
                          }}
                        >
                          {new Date(m.month + "-01").toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </motion.button>

                        {/* delete icon per tab */}
                        {!readOnly && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              requestDeleteMonth(m.id);
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full"
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

                        {/* confirm tooltip (month) */}
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
                                  style={{ backgroundColor: ALORO_ORANGE_DARK }}
                                >
                                  Delete
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteMonthId(null)}
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
                </div>
                )}

                {/* Summary Cards */}
                <div className="grid grid-cols-5 gap-6">
                  <motion.div
                    layout
                    className="rounded-2xl border p-6 flex flex-col justify-center"
                  >
                    <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 uppercase mb-3">
                      <Calendar size={14} />
                      Month
                    </div>
                    <div className="text-center text-xl font-semibold">
                      {new Date(activeMonth.month + "-01").toLocaleDateString(
                        undefined,
                        { month: "short", year: "numeric" }
                      )}
                    </div>
                  </motion.div>

                  {[
                    {
                      label: "Self Referrals",
                      value: totals.selfReferrals,
                      icon: User,
                      tint: "#C9765E22",
                    },
                    {
                      label: "Doctor Referrals",
                      value: totals.doctorReferrals,
                      icon: Stethoscope,
                      tint: "#C9765E11",
                    },
                    {
                      label: "Total Referrals",
                      value: totals.totalReferrals,
                      icon: User,
                      tint: "#C9765E18",
                    },
                    {
                      label: "Production",
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

                {/* Table Header */}
                <div className="grid grid-cols-13 gap-4 mb-3 px-2 text-[11px] font-bold text-gray-400 uppercase">
                  <div className="col-span-3">Source</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-3">Referral Count</div>
                  <div className="col-span-4">Production</div>
                  <div className="col-span-1" />
                </div>

                {/* Data Grid */}
                <AnimatePresence>
                  {rows.map((row) => (
                    <motion.div
                      key={row.id}
                      layout
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      className="grid grid-cols-13 gap-4 mb-4 items-center px-2"
                    >
                      {/* Source */}
                      <div className="col-span-3 relative">
                        <User
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          size={16}
                        />
                        <input
                          disabled={readOnly}
                          value={row.source}
                          onChange={(e) =>
                            updateRow(row.id, "source", e.target.value)
                          }
                          className="pl-9 w-full border rounded-xl px-4 py-3 text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
                        />
                      </div>

                      {/* Type */}
                      <div className="col-span-2">
                        <button
                          disabled={readOnly}
                          onClick={() => handleTypeToggle(row.id)}
                          className="w-full border rounded-xl px-3 py-3 flex items-center justify-between capitalize text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                          style={{
                            backgroundColor:
                              row.type === "self" ? "#C9765E11" : "#C9765E22",
                          }}
                        >
                          <span>{row.type}</span>
                          <RefreshCw size={14} className="text-gray-400" />
                        </button>
                      </div>

                      {/* Referrals */}
                      <div
                        className="col-span-3 relative rounded-xl"
                        style={{
                          backgroundColor:
                            row.type === "self" ? "#C9765E11" : "#C9765E22",
                        }}
                      >
                        <User
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          size={16}
                        />
                        <input
                          disabled={readOnly}
                          type="text"
                          value={row.referrals}
                          onChange={(e) =>
                            updateRow(
                              row.id,
                              "referrals",
                              sanitizeNumber(e.target.value)
                            )
                          }
                          className="pl-9 pr-12 w-full border rounded-xl px-4 py-3 text-sm bg-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                        />
                        {!readOnly && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
                            <button
                              onClick={() =>
                                incrementField(row.id, "referrals", 1)
                              }
                              className="p-0.5 text-gray-500 hover:text-gray-700"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              onClick={() =>
                                incrementField(row.id, "referrals", -1)
                              }
                              className="p-0.5 text-gray-500 hover:text-gray-700"
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Production */}
                      <div
                        className="col-span-4 relative rounded-xl"
                        style={{
                          backgroundColor:
                            row.type === "self" ? "#C9765E11" : "#C9765E22",
                        }}
                      >
                        <DollarSign
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          size={16}
                        />
                        <input
                          disabled={readOnly}
                          type="text"
                          value={formatMoney(row.production)}
                          onChange={(e) =>
                            updateRow(
                              row.id,
                              "production",
                              sanitizeNumber(e.target.value)
                            )
                          }
                          className="pl-9 pr-12 w-full border rounded-xl px-4 py-3 text-sm bg-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                        />
                        {!readOnly && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
                            <button
                              onClick={() =>
                                incrementField(row.id, "production", 1)
                              }
                              className="p-0.5 text-gray-500 hover:text-gray-700"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              onClick={() =>
                                incrementField(row.id, "production", -1)
                              }
                              className="p-0.5 text-gray-500 hover:text-gray-700"
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="col-span-1 flex justify-end relative">
                        {!readOnly && (
                          <>
                            <button
                              onClick={() => requestDeleteRow(row.id)}
                              className="p-2.5 rounded-xl"
                              style={{
                                backgroundColor: ALORO_ORANGE_DARK,
                                color: "white",
                              }}
                            >
                              <Trash2 size={18} />
                            </button>

                            <AnimatePresence>
                              {confirmDeleteRowId === row.id && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95, y: -6 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -6 }}
                                  className="absolute right-10 top-1/2 -translate-y-1/2 bg-white border rounded-xl shadow-lg p-3 z-10"
                                >
                                  <div className="text-xs mb-2">
                                    Delete source?
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => deleteRow(row.id)}
                                      className="text-xs px-3 py-1 rounded-lg text-white"
                                      style={{
                                        backgroundColor: ALORO_ORANGE_DARK,
                                      }}
                                    >
                                      Delete
                                    </button>
                                    <button
                                      onClick={() =>
                                        setConfirmDeleteRowId(null)
                                      }
                                      className="text-xs px-3 py-1 rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {!readOnly && (
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
                )}
              </div>
            )}
          </div>

          {/* Footer */}
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
              {!readOnly && onSave && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
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
                  Save Changes
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") {
    return overlay;
  }

  return createPortal(overlay, document.body);
};
