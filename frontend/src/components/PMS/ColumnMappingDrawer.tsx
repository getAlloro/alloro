/**
 * ColumnMappingDrawer Component
 *
 * Side-panel UI for reviewing and editing the column mapping resolved by the
 * backend (org-cache → global-library → AI inference). Implements the D6 state
 * machine for banner color/copy, per-header role pickers, and the production
 * formula builder.
 *
 * Reference analog: PMSManualEntryModal.tsx (overall styling), ResetOrgDataModal.tsx
 * (framer-motion modal pattern).
 */

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";

import {
  type ColumnMapping,
  type ColumnRole,
  type MappingSource,
  type ProductionFormula,
} from "../../api/pms";
import { ProductionFormulaBuilder } from "./ProductionFormulaBuilder";
import { useLabels } from "../../hooks/useLabels";

interface ColumnMappingDrawerProps {
  isOpen: boolean;
  headers: string[];
  sampleRows: Record<string, unknown>[];
  mapping: ColumnMapping;
  source: MappingSource;
  isReprocessing: boolean;
  onChange: (mapping: ColumnMapping) => void;
  onReprocess: () => void;
  onClose: () => void;
}

const ALORO_ORANGE = "#C9765E";

interface BannerSpec {
  tone: "amber" | "red" | "none";
  title: string;
  body: string;
}

/**
 * Compute the banner state per spec D6.
 * - org-cache → no banner (silent apply)
 * - global-library → amber: "Using a system template..."
 * - ai-inference + any confidence > 0 → amber: "New structure detected..."
 * - ai-inference + all confidences 0 → red: "Could not auto-map..."
 */
function computeBanner(mapping: ColumnMapping, source: MappingSource): BannerSpec {
  if (source === "org-cache") {
    return { tone: "none", title: "", body: "" };
  }
  if (source === "global-library") {
    return {
      tone: "amber",
      title: "Using a system template",
      body: "Please verify it matches your data before submitting.",
    };
  }
  // ai-inference
  const anyConfident = mapping.assignments.some((a) => a.confidence > 0);
  if (anyConfident) {
    return {
      tone: "amber",
      title: "New structure detected",
      body: "We auto-mapped your columns — please verify before submitting.",
    };
  }
  return {
    tone: "red",
    title: "Could not auto-map your columns",
    body: "Please configure your column mapping manually below.",
  };
}

interface SlotFieldProps {
  label: string;
  helpText?: string;
  value: string | null;
  options: string[];
  onChange: (value: string | null) => void;
  required?: boolean;
}

/**
 * SlotField — one of the user-facing mapping slots (Date / Source / Patient).
 * Renders a labeled card with help text + a dropdown of file column names.
 * The "value" is the file column header currently mapped to this role, or
 * null if unmapped.
 */
const SlotField: React.FC<SlotFieldProps> = ({
  label,
  helpText,
  value,
  options,
  onChange,
  required,
}) => {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-gray-900">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </p>
        {value && (
          <CheckCircle2
            size={14}
            className="text-emerald-500 shrink-0"
            aria-label="Column mapped"
          />
        )}
      </div>
      {helpText && (
        <p className="text-[11px] text-gray-500 leading-relaxed">{helpText}</p>
      )}
      <select
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value)
        }
        className="h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
      >
        <option value="">
          {required ? "— select a column from your file —" : "(Don't use)"}
        </option>
        {options.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
};

export const ColumnMappingDrawer: React.FC<ColumnMappingDrawerProps> = ({
  isOpen,
  headers,
  sampleRows,
  mapping,
  source,
  isReprocessing,
  onChange,
  onReprocess,
  onClose,
}) => {
  const labels = useLabels();
  const banner = useMemo(() => computeBanner(mapping, source), [mapping, source]);

  // Snapshot the mapping each time the drawer opens fresh, so we can tell
  // whether the user has actually edited anything. The "Re-process and save"
  // button is disabled until isDirty becomes true.
  const [baselineMappingJson, setBaselineMappingJson] = useState<string>(() =>
    JSON.stringify(mapping)
  );
  useEffect(() => {
    if (isOpen) {
      setBaselineMappingJson(JSON.stringify(mapping));
    }
    // We intentionally only re-snapshot on the false→true transition so that
    // user edits while the drawer is open continue to register as dirty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const isDirty = JSON.stringify(mapping) !== baselineMappingJson;

  // Advanced collapsible section. Patient + status filter live here so the
  // primary view stays focused on Date / Source / Production.
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Slot helpers — translate "this user-friendly field" to assignments.
  // Setting a slot to a header means: that header gets the role, and any
  // OTHER header that currently holds the same role gets demoted to "ignore".
  const getHeaderForRole = (role: ColumnRole): string | null =>
    mapping.assignments.find((a) => a.role === role)?.header ?? null;

  const setSlotHeader = (role: ColumnRole, newHeader: string | null) => {
    const nextAssignments = mapping.assignments.map((a) => {
      if (a.header === newHeader) {
        return { ...a, role, confidence: 1.0 };
      }
      if (a.role === role && a.header !== newHeader) {
        return { ...a, role: "ignore" as ColumnRole, confidence: 1.0 };
      }
      return a;
    });
    onChange({ ...mapping, assignments: nextAssignments });
  };

  // The "Source" slot can be either `source` (template) or `referring_practice`
  // (procedure-log). Preserve whichever role the auto-resolution chose so the
  // backend dispatcher routes to the right adapter; the user is just picking
  // a column, not changing the dispatch decision.
  const sourceAssignment = mapping.assignments.find(
    (a) => a.role === "source" || a.role === "referring_practice"
  );
  const sourceHeader = sourceAssignment?.header ?? null;
  const sourceRole: "source" | "referring_practice" =
    (sourceAssignment?.role as "source" | "referring_practice") ??
    "referring_practice";

  const setSourceHeader = (newHeader: string | null) =>
    setSlotHeader(sourceRole, newHeader);

  const dateHeader = getHeaderForRole("date");
  const patientHeader = getHeaderForRole("patient");

  // Count of columns from the file we're NOT using — surfaced as a hint so
  // doctors aren't confused that we're "ignoring" most of their data.
  const ignoredCount = mapping.assignments.filter(
    (a) => a.role === "ignore"
  ).length;

  const updateFormula = (next: ProductionFormula | undefined) => {
    if (!next) {
      const { productionFormula: _drop, ...rest } = mapping;
      void _drop;
      onChange(rest as ColumnMapping);
      return;
    }
    onChange({ ...mapping, productionFormula: next });
  };

  // Status filter helpers
  const statusAssignment = mapping.assignments.find((a) => a.role === "status");
  const statusFilter = mapping.statusFilter ?? null;
  const [statusInput, setStatusInput] = useState("");

  const ensureStatusFilter = (): NonNullable<ColumnMapping["statusFilter"]> => {
    if (statusFilter) return statusFilter;
    return {
      column: statusAssignment?.header ?? "",
      includeValues: [],
    };
  };

  const addStatusValue = () => {
    const v = statusInput.trim();
    if (!v) return;
    const current = ensureStatusFilter();
    if (current.includeValues.includes(v)) {
      setStatusInput("");
      return;
    }
    onChange({
      ...mapping,
      statusFilter: {
        column: statusAssignment?.header ?? current.column,
        includeValues: [...current.includeValues, v],
      },
    });
    setStatusInput("");
  };

  const removeStatusValue = (v: string) => {
    if (!statusFilter) return;
    const next = statusFilter.includeValues.filter((x) => x !== v);
    onChange({
      ...mapping,
      statusFilter: {
        ...statusFilter,
        column: statusAssignment?.header ?? statusFilter.column,
        includeValues: next,
      },
    });
  };

  const sampleRow = sampleRows[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 280 }}
          className="absolute right-0 top-0 bottom-0 z-30 flex w-full flex-col border-l border-gray-200 bg-white shadow-xl md:w-[480px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 bg-white">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Column mapping</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Match each column from your file to what it represents.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-gray-200 p-1.5 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              aria-label="Close mapping drawer"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-gray-50">
            {/* Banner per D6 */}
            {banner.tone !== "none" && (
              <div
                className={`rounded-xl border px-3 py-2.5 ${
                  banner.tone === "red"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold">{banner.title}</p>
                    <p className="mt-0.5 leading-relaxed">{banner.body}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Date — required */}
            <SlotField
              label="Date"
              helpText={`Which column has the visit or ${labels.serviceEvent} date?`}
              value={dateHeader}
              options={headers}
              onChange={(h) => setSlotHeader("date", h)}
              required
            />

            {/* Source — required (procedure-log: practice/doctor; template: source) */}
            <SlotField
              label="Source"
              helpText={`Which column shows where each ${labels.customer} came from? (referring ${labels.orgNoun}, ${labels.doctorShort.toLowerCase()}, or marketing channel)`}
              value={sourceHeader}
              options={headers}
              onChange={setSourceHeader}
              required
            />

            {/* Production — required (formula builder) */}
            <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
              <div>
                <p className="text-xs font-semibold text-gray-900">{labels.production}</p>
                <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5">
                  How should we calculate the dollar amount per row? Pick one
                  column or build a formula by adding/subtracting columns.
                </p>
              </div>
              <ProductionFormulaBuilder
                availableColumns={headers}
                sampleRow={sampleRow}
                value={mapping.productionFormula}
                onChange={updateFormula}
              />
            </div>

            {/* Advanced — collapsible. Hidden by default. Holds patient (for
                grouping in procedure-log mode) and the status row filter. */}
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 transition"
            >
              <span className="inline-flex items-center gap-1.5">
                <ChevronRight
                  size={12}
                  className={`transition-transform ${
                    advancedOpen ? "rotate-90" : ""
                  }`}
                />
                Advanced settings
              </span>
              <span className="text-[10px] text-gray-400">
                {ignoredCount > 0
                  ? `${ignoredCount} column${ignoredCount === 1 ? "" : "s"} not used`
                  : ""}
              </span>
            </button>

            {advancedOpen && (
              <div className="space-y-3 rounded-xl border border-dashed border-gray-300 bg-white/60 p-3">
                <SlotField
                  label={`${labels.customer.charAt(0).toUpperCase()}${labels.customer.slice(1)} ID column (optional)`}
                  helpText={`When provided, multiple procedures for the same ${labels.customer} on the same day count as ONE referral. Leave empty if your data is already at one-row-per-referral.`}
                  value={patientHeader}
                  options={headers}
                  onChange={(h) => setSlotHeader("patient", h)}
                />

                {/* Row filter — only appears if a column is mapped to status */}
                {statusAssignment ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs font-semibold text-gray-900">
                        Only include rows where{" "}
                        <span className="text-gray-500 font-normal">
                          {statusAssignment.header}
                        </span>{" "}
                        is:
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(statusFilter?.includeValues ?? []).map((v) => (
                        <span
                          key={v}
                          className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs text-gray-700"
                        >
                          {v}
                          <button
                            type="button"
                            onClick={() => removeStatusValue(v)}
                            className="text-gray-400 hover:text-red-600"
                            aria-label={`Remove ${v}`}
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={statusInput}
                          onChange={(e) => setStatusInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addStatusValue();
                            }
                          }}
                          placeholder="e.g. Done"
                          className="h-7 w-28 rounded-full border border-gray-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300"
                        />
                        <button
                          type="button"
                          onClick={addStatusValue}
                          className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100"
                        >
                          + add
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Footer — single CTA "Re-process and save".
              Disabled until the user has actually edited something (isDirty).
              When the user is satisfied with the auto-applied mapping, they
              just close the drawer with X. When they make edits, the button
              activates; on click it re-processes the preview and the parent
              auto-closes the drawer.
          */}
          <div className="flex items-center justify-end border-t border-gray-200 px-5 py-3 bg-white">
            <button
              type="button"
              onClick={onReprocess}
              disabled={isReprocessing || !isDirty}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: ALORO_ORANGE }}
              title={
                isDirty
                  ? "Apply your mapping changes and update the preview"
                  : "Make a change to enable saving"
              }
            >
              {isReprocessing ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <RefreshCw size={12} />
                  Re-process and save
                </>
              )}
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
