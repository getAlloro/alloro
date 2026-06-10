/**
 * PMSManualEntryModal Component
 *
 * Allows users to manually enter PMS referral data without uploading a CSV file.
 * Opens with the previous month selected and no sources by default.
 * On submit, data goes directly to monthly agents (skipping admin/client approval).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { showUploadToast } from "../../lib/toast";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Calendar,
  ClipboardPaste,
  DollarSign,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Stethoscope,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";

import {
  transformUIToBackend,
  calculateTotals,
  formatMoney,
  sanitizeNumber,
  addMonths,
  toYm,
} from "./pmsDataTransform";
import type { MonthBucket, SourceRow } from "./types";
import {
  submitManualPMSData,
  uploadPMSData,
  previewMapping,
  previewPmsUploadFile,
  uploadWithMapping,
  type ColumnMapping,
  type ManualMonthEntry,
  type MappingSource,
  type MonthlyRollupMonth,
  type MonthlyRollupForJob,
  type PmsUploadPreviewResponse,
} from "../../api/pms";
import { usePasteHandler } from "./usePasteHandler";
import { PasteConfirmDialog } from "./PasteConfirmDialog";
import { ColumnMappingDrawer } from "./ColumnMappingDrawer";

interface PMSManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string; // domain
  locationId?: number | null;
  locationName?: string | null;
  targetMonth?: string | null;
  onSuccess?: () => void;
}

const ALORO_ORANGE = "#C9765E";
const ALORO_ORANGE_DARK = "#D66853";
type PmsUploadPreviewData = NonNullable<PmsUploadPreviewResponse["data"]>;

/**
 * State-machine CSV/TSV parser for the mapping-preview path.
 *
 * Handles:
 *   - Tab or comma delimiters (auto-detected from first line)
 *   - Quoted fields containing the delimiter (e.g. `"Diab, Zied"`)
 *   - Escaped quotes inside quoted fields (`""` → `"`)
 *   - LF and CRLF row endings
 *   - Newlines inside quoted fields (rare but legal)
 *   - Ragged rows (fewer cells than headers → undefined)
 *
 * The previous naive `split(delimiter)` implementation broke on the very
 * common case of practice-management exports that quote fields with commas
 * (Patient, Provider, Referring User on the Open Dental shape), causing the
 * mapping to read column N as column N+k for arbitrary k. Verified against
 * `Fredericksburg February 2026 - Raw Data.csv` (515 rows, 11 cols).
 */
const parseTabularToRows = (
  raw: string
): { headers: string[]; rows: Record<string, unknown>[] } => {
  if (!raw.trim()) return { headers: [], rows: [] };

  const firstLineEnd = raw.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? raw : raw.slice(0, firstLineEnd);
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const allRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote: "" → "
        if (raw[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentField);
      currentField = "";
    } else if (ch === "\n" || ch === "\r") {
      // Skip the LF in CRLF
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.some((c) => c.length > 0)) {
        allRows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += ch;
    }
  }

  // Flush final field/row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((c) => c.length > 0)) {
      allRows.push(currentRow);
    }
  }

  if (allRows.length === 0) return { headers: [], rows: [] };

  const headers = allRows[0].map((h) => h.trim());
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < allRows.length; i++) {
    const cells = allRows[i];
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return { headers, rows };
};

/**
 * Get the previous month in YYYY-MM format
 */
const getPreviousMonth = (): string => {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return toYm(prevMonth.getFullYear(), prevMonth.getMonth() + 1);
};

const formatMonthLabel = (month: string): string => {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
};

const formatMonthList = (months: string[]): string => {
  if (months.length === 0) return "none";
  return months.map(formatMonthLabel).join(", ");
};

const monthlyRollupToBuckets = (
  rows: Array<MonthlyRollupMonth | ManualMonthEntry>
): MonthBucket[] => {
  return rows.map((m, i) => ({
    id: Date.now() + i,
    month: m.month,
    rows: m.sources.map((s, j) => ({
      id: Date.now() + i * 1000 + j,
      source: s.name,
      type: (s.inferred_referral_type as "self" | "doctor") || "self",
      referrals: String(s.referrals),
      production: String(s.production),
    })),
  }));
};

/**
 * Animated odometer for summary cards
 */
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

export const PMSManualEntryModal: React.FC<PMSManualEntryModalProps> = ({
  isOpen,
  onClose,
  clientId,
  locationId,
  locationName,
  targetMonth,
  onSuccess,
}) => {
  // Initialize with previous month and empty sources
  const [months, setMonths] = useState<MonthBucket[]>(() => [
    {
      id: Date.now(),
      month: getPreviousMonth(),
      rows: [],
    },
  ]);
  const [activeMonthId, setActiveMonthId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  // Month picker state
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerStep, setPickerStep] = useState<"month" | "year">("month");
  const [tempMonth, setTempMonth] = useState<string | null>(null);

  // Confirmation states
  const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<number | null>(
    null
  );
  const [confirmDeleteMonthId, setConfirmDeleteMonthId] = useState<
    number | null
  >(null);

  // Month-merge conflict state
  const [pendingMonths, setPendingMonths] = useState<MonthBucket[] | null>(null);
  const [monthConflicts, setMonthConflicts] = useState<
    Array<{ month: string; status: "new" | "conflict"; existingRowCount: number }> | null
  >(null);

  // Drag & drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Set when the user dropped a file (vs pasting). Drives the
  // PasteConfirmDialog wording ("File detected" vs "Paste detected").
  const [droppedFileName, setDroppedFileName] = useState<string | null>(null);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  // Month-selected mode only: months found in the data that are NOT the
  // target month. Non-null blocks the merge until the user discards or
  // re-uploads a corrected file.
  const [monthMismatch, setMonthMismatch] = useState<string[] | null>(null);
  const [uploadPreview, setUploadPreview] =
    useState<PmsUploadPreviewData | null>(null);
  const [isPreviewingUpload, setIsPreviewingUpload] = useState(false);

  // Column-mapping state (T18/T19)
  const [mappingHeaders, setMappingHeaders] = useState<string[]>([]);
  const [mappingSampleRows, setMappingSampleRows] = useState<
    Record<string, unknown>[]
  >([]);
  const [mappingAllRows, setMappingAllRows] = useState<
    Record<string, unknown>[]
  >([]);
  const [currentMapping, setCurrentMapping] = useState<ColumnMapping | null>(
    null
  );
  const [mappingSource, setMappingSource] = useState<MappingSource | null>(null);
  const [parsedPreview, setParsedPreview] = useState<MonthlyRollupForJob | null>(
    null
  );
  const [isResolvingMapping, setIsResolvingMapping] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Raw paste text captured at paste-event time, consumed AFTER legacy parse
  // completes. Sequencing the mapping pipeline behind the legacy parse means
  // the drawer can't auto-open while the user is still in the "Paste detected"
  // confirmation dialog.
  const pastedRawTextRef = useRef<string>("");

  // Forward-ref to runMappingPreview, populated by an effect below. handleParsedPaste
  // is declared before runMappingPreview so we use a ref to avoid TDZ.
  const runMappingPreviewRef = useRef<(rawText: string) => void>(() => {});

  // ─── Month merge helpers ────────────────────────────────────────
  const createEmptyMonthBucket = useCallback(
    (month: string): MonthBucket => ({
      id: Date.now(),
      month,
      rows: [],
    }),
    []
  );

  const scopeMonthsToTarget = useCallback(
    (incomingMonths: MonthBucket[]) => {
      if (!targetMonth) return incomingMonths;
      return incomingMonths.filter((month) => month.month === targetMonth);
    },
    [targetMonth]
  );

  /**
   * Month-selected mode: parsed data must contain ONLY the target month.
   * When any other month is present, reject the whole batch and flag it —
   * the user must discard or re-upload a corrected file. No silent
   * filtering. Returns true when the batch was flagged (caller must stop).
   */
  const flagOffsetMonths = useCallback(
    (incomingMonthKeys: string[]): boolean => {
      if (!targetMonth) return false;
      const offset = [
        ...new Set(incomingMonthKeys.filter((month) => month !== targetMonth)),
      ].sort();
      if (offset.length === 0) return false;

      const emptyTarget = createEmptyMonthBucket(targetMonth);
      setMonths([emptyTarget]);
      setActiveMonthId(emptyTarget.id);
      setSelectedUploadFile(null);
      setUploadPreview(null);
      setParsedPreview(null);
      setPendingMonths(null);
      setMonthConflicts(null);
      setError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setMonthMismatch(offset);
      return true;
    },
    [createEmptyMonthBucket, targetMonth]
  );

  const getSubmitMonths = useCallback(() => {
    const backendData = transformUIToBackend(months);
    if (!targetMonth) return backendData;
    return backendData.filter((month) => month.month === targetMonth);
  }, [months, targetMonth]);

  const applyMerge = useCallback(
    (incomingMonths: MonthBucket[]) => {
      if (flagOffsetMonths(incomingMonths.map((m) => m.month))) return;
      const scopedIncoming = scopeMonthsToTarget(incomingMonths);
      if (targetMonth && scopedIncoming.length === 0) {
        const emptyTarget = createEmptyMonthBucket(targetMonth);
        setMonths([emptyTarget]);
        setActiveMonthId(emptyTarget.id);
        setError(
          `This data does not include ${formatMonthLabel(targetMonth)}. Only that selected month can be uploaded from this slot.`
        );
        return;
      }

      const incomingKeys = new Set(scopedIncoming.map((m) => m.month));
      setMonths((prev) => [
        ...prev.filter((m) => !incomingKeys.has(m.month)),
        ...scopedIncoming,
      ]);
      const sorted = [...scopedIncoming].sort((a, b) =>
        a.month.localeCompare(b.month)
      );
      const first = sorted.find((m) => m.rows.length > 0) || sorted[0];
      if (first) setActiveMonthId(first.id);
      setPendingMonths(null);
      setMonthConflicts(null);
    },
    [createEmptyMonthBucket, flagOffsetMonths, scopeMonthsToTarget, targetMonth]
  );

  const mergeOrConfirm = useCallback(
    (incomingMonths: MonthBucket[]) => {
      if (flagOffsetMonths(incomingMonths.map((m) => m.month))) return;
      const scopedIncoming = scopeMonthsToTarget(incomingMonths);
      if (targetMonth && scopedIncoming.length === 0) {
        applyMerge(incomingMonths);
        return;
      }
      const existingMap = new Map(
        months
          .filter((m) => m.rows.length > 0)
          .map((m) => [m.month, m])
      );
      const conflicts = scopedIncoming.map((incoming) => ({
        month: incoming.month,
        status: (existingMap.has(incoming.month) ? "conflict" : "new") as
          | "new"
          | "conflict",
        existingRowCount: existingMap.get(incoming.month)?.rows.length ?? 0,
      }));
      const hasConflicts = conflicts.some((c) => c.status === "conflict");
      if (!hasConflicts) {
        applyMerge(scopedIncoming);
        showUploadToast(
          "Data parsed!",
          `${scopedIncoming.reduce((s, m) => s + m.rows.length, 0)} rows added for ${formatMonthList(scopedIncoming.map((m) => m.month))}.`
        );
      } else {
        setPendingMonths(scopedIncoming);
        setMonthConflicts(conflicts);
      }
    },
    [applyMerge, flagOffsetMonths, months, scopeMonthsToTarget, targetMonth]
  );

  const confirmMerge = useCallback(() => {
    if (pendingMonths) {
      const count = pendingMonths.reduce((s, m) => s + m.rows.length, 0);
      applyMerge(pendingMonths);
      showUploadToast(
        "Data merged!",
        `${count} rows merged. Conflicting months replaced.`
      );
    }
  }, [pendingMonths, applyMerge]);

  const cancelMerge = useCallback(() => {
    setPendingMonths(null);
    setMonthConflicts(null);
  }, []);

  // Paste handler
  const handleParsedPaste = useCallback(
    (parsedMonths: MonthBucket[]) => {
      mergeOrConfirm(parsedMonths);

      // Now that legacy parsing is done and the user can see the result, kick
      // off the column-mapping resolver. This is what eventually opens the
      // mapping drawer for non-org-cache signatures.
      const text = pastedRawTextRef.current;
      if (text) {
        runMappingPreviewRef.current(text);
        pastedRawTextRef.current = "";
      }
    },
    [mergeOrConfirm]
  );

  const handlePasteWarnings = useCallback((warnings: string[]) => {
    if (warnings.length > 0) {
      setError(warnings[0]);
    }
  }, []);

  const activeMonthStr = useMemo(() => {
    const found = months.find((m) => m.id === activeMonthId);
    return found?.month ?? months[0]?.month ?? getPreviousMonth();
  }, [months, activeMonthId]);

  const {
    isPasting,
    phase: pastePhase,
    showConfirm: showPasteConfirm,
    pasteInfo,
    batchProgress,
    confirmPaste,
    cancelPaste,
    handlePasteEvent: legacyHandlePasteEvent,
  } = usePasteHandler({
    currentMonth: activeMonthStr,
    onParsed: handleParsedPaste,
    onError: (msg) => setError(msg),
    onWarnings: handlePasteWarnings,
  });

  // Clear droppedFileName once the dialog tears down (cancel or done).
  useEffect(() => {
    if (!pasteInfo) setDroppedFileName(null);
  }, [pasteInfo]);

  /**
   * Run the column-mapping resolver against the pasted text. Triggered by
   * `handleParsedPaste` AFTER the legacy parser populates the months bucket
   * UI — so the drawer never opens while the "Paste detected" modal is up.
   *
   * Declared BEFORE handlePasteEvent so that callback's deps array can
   * reference it without hitting a TDZ.
   */
  const runMappingPreview = useCallback(
    async (rawText: string) => {
      const { headers, rows } = parseTabularToRows(rawText);
      if (headers.length === 0 || rows.length === 0) return;

      setMappingHeaders(headers);
      // Accumulate rows across pastes so multi-paste submissions
      // include all months. Previous behavior replaced on each paste,
      // causing only the last paste's rows to reach the backend.
      setMappingAllRows((prev) => [...prev, ...rows]);
      // Keep a small sample around for any UI that wants to show example values
      // (e.g. the production formula preview). The backend always gets ALL
      // rows so the parsed preview reflects the entire file, not a sample.
      setMappingSampleRows(rows.slice(0, 5));
      setIsResolvingMapping(true);

      try {
        const resp = await previewMapping({ headers, sampleRows: rows });
        if (resp.success && resp.data) {
          setCurrentMapping(resp.data.mapping);
          setMappingSource(resp.data.source);
          setParsedPreview(resp.data.parsedPreview);
          // Open drawer for non-org-cache sources (D6). At this point the
          // user has already seen parsed data on the left, so the drawer is
          // a "verify or adjust" prompt, not a blocking question.
          setDrawerOpen(resp.data.source !== "org-cache");
        } else {
          setError(resp.error || "Could not preview this file mapping.");
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not preview this file mapping."
        );
      } finally {
        setIsResolvingMapping(false);
      }
    },
    []
  );

  // Keep the forward-ref synced so handleParsedPaste can call the latest
  // runMappingPreview without dependency loops.
  useEffect(() => {
    runMappingPreviewRef.current = runMappingPreview;
  }, [runMappingPreview]);

  /**
   * Wraps the legacy paste handler. Captures the raw text into a ref, then
   * forwards the event to the positional parser. The mapping resolver does
   * NOT run here — it's deferred to `handleParsedPaste` so the drawer can't
   * pop while the user is still confirming the legacy "Paste detected" modal.
   */
  const handlePasteEvent = useCallback(
    (e: React.ClipboardEvent) => {
      // Sniff text first (the legacy handler may preventDefault and consume).
      let text = "";
      try {
        text = e.clipboardData.getData("text/plain");
      } catch {
        // ignore — not all synthetic events expose clipboardData
      }
      setSelectedUploadFile(null);
      setUploadPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      pastedRawTextRef.current = text;
      legacyHandlePasteEvent(e);
    },
    [legacyHandlePasteEvent]
  );

  // Shared by the empty-state action card and the compact "Paste Data" button.
  const handlePasteFromClipboard = useCallback(() => {
    navigator.clipboard
      .readText()
      .then((text) => {
        if (text) {
          const fakeEvent = {
            clipboardData: { getData: () => text },
            target: document.body,
            preventDefault: () => {},
          } as unknown as React.ClipboardEvent;
          handlePasteEvent(fakeEvent);
        }
      })
      .catch(() => {
        setError("Clipboard access denied. Try pressing Cmd+V instead.");
      });
  }, [handlePasteEvent]);

  // Only reset transient state when modal opens (keep data intact)
  useEffect(() => {
    if (isOpen) {
      setSubmitStatus("idle");
      setError(null);
      setMonthMismatch(null);
      if (targetMonth) {
        const targetBucket = createEmptyMonthBucket(targetMonth);
        setMonths([targetBucket]);
        setActiveMonthId(targetBucket.id);
        setPendingMonths(null);
        setMonthConflicts(null);
      }
    }
  }, [createEmptyMonthBucket, isOpen, targetMonth]);

  // ─── Column-mapping pipeline ─────────────────────────────────────
  // When the mapping pipeline produces a parsedPreview, hydrate the existing
  // months bucket UI with it so the user can review/edit the parsed result
  // alongside the drawer.
  useEffect(() => {
    // Skip while the month-conflict dialog is open — the user hasn't
    // confirmed yet. Once they confirm (monthConflicts clears), this
    // effect re-fires and silently applies the mapping-refined version.
    if (!parsedPreview || monthConflicts) return;
    const rows = parsedPreview.monthly_rollup;
    if (!rows?.length) return;
    applyMerge(monthlyRollupToBuckets(rows));
  }, [parsedPreview, applyMerge, monthConflicts]);

  // Reset mapping state on modal close so re-opens get a clean slate.
  useEffect(() => {
    if (!isOpen) {
      setMappingHeaders([]);
      setMappingSampleRows([]);
      setMappingAllRows([]);
      setCurrentMapping(null);
      setMappingSource(null);
      setParsedPreview(null);
      setDrawerOpen(false);
      setIsResolvingMapping(false);
      setIsReprocessing(false);
      setSelectedUploadFile(null);
      setUploadPreview(null);
      setIsPreviewingUpload(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [isOpen]);

  /**
   * Re-call previewMapping with the user-edited mapping as `overrideMapping`.
   * Backend skips resolution and re-applies the supplied mapping to sampleRows.
   * Chosen over a dedicated /apply-mapping endpoint to keep the contract surface
   * minimal — see report.
   */
  const handleReprocess = useCallback(async () => {
    if (!currentMapping || mappingHeaders.length === 0) return;
    setIsReprocessing(true);
    try {
      // Send ALL rows so the backend re-applies the mapping to the entire
      // file, not just the 5-row preview sample. The months display rebuilds
      // from the resulting parsedPreview via the parsedPreview→months effect.
      const resp = await previewMapping({
        headers: mappingHeaders,
        sampleRows: mappingAllRows,
        overrideMapping: currentMapping,
      });
      if (resp.success && resp.data) {
        setParsedPreview(resp.data.parsedPreview);
        setDrawerOpen(false);
        const totalRows = (resp.data.parsedPreview?.monthly_rollup ?? []).reduce(
          (s, m) => s + (m.sources?.length ?? 0),
          0
        );
        // Adapter-emitted notes — currently the "skipped N zero/negative-
        // production referrals" line. Append to the toast body so it's
        // visible without adding new UI surface.
        const flagsLine =
          resp.data.dataQualityFlags && resp.data.dataQualityFlags.length
            ? "\n" + resp.data.dataQualityFlags.join(" · ")
            : "";
        showUploadToast(
          "Mapping saved",
          `Re-processed ${mappingAllRows.length} rows into ${totalRows} sources.${flagsLine}`
        );
      } else {
        setError(resp.error || "Re-process failed.");
      }
    } finally {
      setIsReprocessing(false);
    }
  }, [currentMapping, mappingHeaders, mappingAllRows]);

  // Clear all data and reset to empty state
  const clearAllData = useCallback(() => {
    const initialMonth = targetMonth ?? getPreviousMonth();
    const initialBucket = createEmptyMonthBucket(initialMonth);
    setMonths([initialBucket]);
    setActiveMonthId(initialBucket.id);
    setError(null);
    setSelectedUploadFile(null);
    setUploadPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [createEmptyMonthBucket, targetMonth]);

  // Month-mismatch resolutions: both clear the flagged batch; re-upload
  // additionally reopens the file picker for the corrected file.
  const discardMismatchedUpload = useCallback(() => {
    setMonthMismatch(null);
    setDroppedFileName(null);
    clearAllData();
  }, [clearAllData]);

  const reuploadCorrectedFile = useCallback(() => {
    setMonthMismatch(null);
    setDroppedFileName(null);
    clearAllData();
    fileInputRef.current?.click();
  }, [clearAllData]);

  const replaceMonthsFromRollup = useCallback(
    (rollup: Array<MonthlyRollupMonth | ManualMonthEntry>) => {
      const buckets = scopeMonthsToTarget(monthlyRollupToBuckets(rollup));
      if (targetMonth && buckets.length === 0) {
        const emptyTarget = createEmptyMonthBucket(targetMonth);
        setMonths([emptyTarget]);
        setActiveMonthId(emptyTarget.id);
        setError(
          `This file does not include ${formatMonthLabel(targetMonth)}. Choose a file with that month or enter it manually.`
        );
        return;
      }
      if (buckets.length === 0) return;
      setMonths(buckets);
      setActiveMonthId(buckets[0]?.id ?? null);
    },
    [createEmptyMonthBucket, scopeMonthsToTarget, targetMonth]
  );

  const handleSelectedUploadFile = useCallback(
    async (file: File) => {
      const validExts = [".csv", ".xls", ".xlsx"];
      const isValid = validExts.some((ext) =>
        file.name.toLowerCase().endsWith(ext)
      );

      if (!isValid) {
        setError(
          `"${file.name}" is not supported. Please choose a CSV, XLS, or XLSX file.`
        );
        return;
      }

      if (!locationId) {
        setError("Choose a location before uploading PMS data.");
        return;
      }

      setError(null);
      setDroppedFileName(file.name);
      setSelectedUploadFile(file);
      setUploadPreview(null);
      setIsPreviewingUpload(true);
      setCurrentMapping(null);
      setMappingSource(null);
      setMappingAllRows([]);
      setParsedPreview(null);
      setDrawerOpen(false);

      try {
        const response = await previewPmsUploadFile(file, locationId);
        if (!response.success || !response.data) {
          throw new Error(response.error || "Could not preview this PMS file.");
        }

        // Month-selected mode: a file carrying any other month is flagged,
        // not silently trimmed. droppedFileName stays set so the mismatch
        // panel can name the offending file.
        if (flagOffsetMonths(response.data.incomingMonths)) return;

        const scopedRollup = targetMonth
          ? response.data.monthlyRollup.filter(
              (month) => month.month === targetMonth
            )
          : response.data.monthlyRollup;
        const scopedIncomingMonths = targetMonth
          ? response.data.incomingMonths.filter((month) => month === targetMonth)
          : response.data.incomingMonths;
        const scopedSupersededMonths = targetMonth
          ? response.data.supersededMonths.filter(
              (month) => month.month === targetMonth
            )
          : response.data.supersededMonths;
        setUploadPreview({
          ...response.data,
          monthlyRollup: scopedRollup,
          incomingMonths: scopedIncomingMonths,
          supersededMonths: scopedSupersededMonths,
        });
        replaceMonthsFromRollup(scopedRollup);
        showUploadToast(
          "PMS file parsed",
          scopedSupersededMonths.length > 0
            ? `${scopedSupersededMonths.length} month(s) will be overwritten.`
            : targetMonth
              ? `Only ${formatMonthLabel(targetMonth)} will be uploaded.`
              : "No saved months will be overwritten."
        );
      } catch (err) {
        setSelectedUploadFile(null);
        setUploadPreview(null);
        setDroppedFileName(null);
        setError(
          err instanceof Error ? err.message : "Could not preview this PMS file."
        );
      } finally {
        setIsPreviewingUpload(false);
      }
    },
    [flagOffsetMonths, locationId, replaceMonthsFromRollup, targetMonth]
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void handleSelectedUploadFile(file);
    },
    [handleSelectedUploadFile]
  );

  // Drag & drop handlers for PMS files
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length === 0) return;

      if (files.length > 1) {
        setError("Upload one PMS file at a time so overwrite checks stay clear.");
        return;
      }

      void handleSelectedUploadFile(files[0]);
    },
    [handleSelectedUploadFile]
  );

  // Download CSV template with the expected headers
  const downloadTemplate = useCallback(() => {
    const headers = "Treatment Date,Source,Type,Production";
    const example = "01/15/2025,Google,self,1500";
    const csv = `${headers}\n${example}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pms-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

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

  // Keep active ID valid
  useEffect(() => {
    if (!activeMonth && sortedMonths[0]) {
      setActiveMonthId(sortedMonths[0].id);
    }
  }, [activeMonth, sortedMonths]);

  // Month management
  const updateActiveMonth = useCallback(
    (patch: Partial<MonthBucket>) => {
      if (!activeMonth) return;
      setMonths((prev) =>
        prev.map((m) => (m.id === activeMonth.id ? { ...m, ...patch } : m))
      );
    },
    [activeMonth]
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
  }, [months, sortedMonths, targetMonth]);

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
        a.month.localeCompare(b.month)
      );
      if (nextSorted[0]) {
        setActiveMonthId(nextSorted[0].id);
      }
    },
    [months, targetMonth]
  );

  const requestDeleteMonth = (id: number) => {
    setConfirmDeleteMonthId(id);
    setConfirmDeleteRowId(null);
  };

  // Row management
  const updateMonthRows = useCallback(
    (updater: (rows: SourceRow[]) => SourceRow[]) => {
      if (!activeMonth) return;
      setMonths((prev) =>
        prev.map((m) =>
          m.id === activeMonth.id ? { ...m, rows: updater(m.rows) } : m
        )
      );
    },
    [activeMonth]
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
      updateMonthRows((rows) =>
        rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
      );
    },
    [updateMonthRows]
  );

  const handleTypeToggle = useCallback(
    (rowId: number) => {
      const row = rows.find((r) => r.id === rowId);
      if (row) {
        updateRow(rowId, "type", row.type === "self" ? "doctor" : "self");
      }
    },
    [rows, updateRow]
  );

  const deleteRow = useCallback(
    (rowId: number) => {
      updateMonthRows((rows) => rows.filter((row) => row.id !== rowId));
      setConfirmDeleteRowId(null);
    },
    [updateMonthRows]
  );

  const requestDeleteRow = (rowId: number) => {
    setConfirmDeleteRowId(rowId);
    setConfirmDeleteMonthId(null);
  };

  const incrementField = useCallback(
    (rowId: number, field: "referrals" | "production", delta: number) => {
      updateMonthRows((rows) =>
        rows.map((row) => {
          if (row.id === rowId) {
            const current = Number(row[field]) || 0;
            return { ...row, [field]: String(Math.max(0, current + delta)) };
          }
          return row;
        })
      );
    },
    [updateMonthRows]
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
      (m) => m.month === ym && m.id !== activeMonth?.id
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

  // Submit handler
  const handleSubmit = async () => {
    if (selectedUploadFile) {
      setIsSubmitting(true);
      setError(null);
      try {
        const backendData = getSubmitMonths();
        if (
          targetMonth &&
          !backendData.some(
            (month) => month.month === targetMonth && month.sources.length > 0
          )
        ) {
          throw new Error(
            `Add data for ${formatMonthLabel(targetMonth)} before uploading.`
          );
        }
        const result = await uploadPMSData({
          domain: clientId,
          file: selectedUploadFile,
          pmsType: "auto-detect",
          locationId,
          monthlyDataOverride: backendData,
        });

        if (result.success) {
          setSubmitStatus("success");
          showUploadToast(
            "PMS file received!",
            "Processing your insights now..."
          );

          if (typeof window !== "undefined") {
            const event = new CustomEvent("pms:job-uploaded", {
              detail: { clientId, entryType: "file", locationId },
            });
            window.dispatchEvent(event);
          }

          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 2000);
          return;
        }
        throw new Error(result.error || "Upload failed");
      } catch (err) {
        setSubmitStatus("error");
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // ── Mapping path: when the user pasted a non-template file and we
    // resolved a mapping, submit via uploadWithMapping so the backend's
    // parsing pipeline (and clone-on-confirm cache write) runs end-to-end.
    if (!targetMonth && currentMapping && mappingAllRows.length > 0) {
      setIsSubmitting(true);
      setError(null);
      try {
        const result = await uploadWithMapping({
          domain: clientId,
          rows: mappingAllRows,
          mapping: currentMapping,
          locationId,
        });

        if (result.success) {
          setSubmitStatus("success");
          showUploadToast(
            "Data received!",
            "Processing your insights now..."
          );

          if (typeof window !== "undefined") {
            const event = new CustomEvent("pms:job-uploaded", {
              detail: { clientId, entryType: "mapping", locationId },
            });
            window.dispatchEvent(event);
          }

          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 2000);
          return;
        }
        throw new Error(result.error || "Submission failed");
      } catch (err) {
        setSubmitStatus("error");
        setError(err instanceof Error ? err.message : "Submission failed");
        setIsSubmitting(false);
        return;
      } finally {
        // Only flip off when staying on screen (success leaves modal open
        // until the timeout above fires).
      }
    }

    // ── Legacy manual-entry path (unchanged) ──────────────────────────
    // Validate that there's at least one source with data
    const allRows = months.flatMap((m) => m.rows);
    const validRows = allRows.filter(
      (r) =>
        r.source.trim() && (Number(r.referrals) > 0 || Number(r.production) > 0)
    );

    if (validRows.length === 0) {
      setError(
        "Please add at least one source with referrals or production data"
      );
      return;
    }

    // Check for empty source names
    const emptySourceRows = allRows.filter(
      (r) =>
        !r.source.trim() &&
        (Number(r.referrals) > 0 || Number(r.production) > 0)
    );
    if (emptySourceRows.length > 0) {
      setError("All sources must have a name");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const backendData = getSubmitMonths();
      if (
        targetMonth &&
        !backendData.some(
          (month) => month.month === targetMonth && month.sources.length > 0
        )
      ) {
        throw new Error(
          `Add data for ${formatMonthLabel(targetMonth)} before submitting.`
        );
      }

      const result = await submitManualPMSData({
        domain: clientId,
        monthlyData: backendData,
        locationId,
      });

      if (result.success) {
        setSubmitStatus("success");

        // Show toast notification
        showUploadToast("Data received!", "Processing your insights now...");

        // Dispatch event for other components
        if (typeof window !== "undefined") {
          const event = new CustomEvent("pms:job-uploaded", {
            detail: { clientId, entryType: "manual", locationId },
          });
          window.dispatchEvent(event);
        }

        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 2000);
      } else {
        throw new Error(result.error || "Submission failed");
      }
    } catch (err) {
      setSubmitStatus("error");
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
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
          className="relative flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl my-auto"
          onClick={(e) => e.stopPropagation()}
          onPaste={handlePasteEvent}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl"
                style={{ backgroundColor: "rgba(201,118,94,0.08)", border: `2px dashed ${ALORO_ORANGE}` }}
              >
                <div className="flex flex-col items-center gap-2">
                  <Upload size={32} style={{ color: ALORO_ORANGE }} />
                  <span className="text-sm font-medium" style={{ color: ALORO_ORANGE }}>
                    Drop your CSV, XLS, or XLSX file here
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {targetMonth
                  ? `${locationName ? `${locationName} — ` : ""}${formatMonthLabel(targetMonth)}`
                  : `Enter PMS Data${locationName ? ` for ${locationName}` : ""}`}
              </h2>
              {!targetMonth && (
                <p className="text-xs text-gray-500 mt-1">
                  Add your referral and production data for {clientId}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Mapping settings link — visible whenever a mapping has been
                  resolved, even silently from org-cache, so doctors can audit
                  what was applied. */}
              {currentMapping && !drawerOpen && (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:border-gray-300"
                  title="Review or edit the column mapping"
                >
                  Mapping settings
                </button>
              )}
              {isResolvingMapping && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Resolving mapping…
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="relative flex-1 overflow-y-auto px-6 py-6 bg-gray-50">
            {/* Re-processing overlay — visible feedback so the user can see
                the new mapping being applied to their data, not just a
                fleeting toast. Blocks pointer events on the months display
                so the user can't edit during a re-process. */}
            <AnimatePresence>
              {isReprocessing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white/85 backdrop-blur-sm pointer-events-auto"
                >
                  <Loader2
                    className="h-8 w-8 animate-spin"
                    style={{ color: ALORO_ORANGE }}
                  />
                  <p className="text-sm font-semibold text-gray-900">
                    Re-processing your data…
                  </p>
                  <p className="text-xs text-gray-500">
                    Applying your mapping to {mappingAllRows.length}{" "}
                    {mappingAllRows.length === 1 ? "row" : "rows"}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {submitStatus === "success" ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center justify-center py-16"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                  <Save className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Data Submitted Successfully!
                </h3>
                <p className="text-gray-600 text-center max-w-md">
                  We're processing your data now. Your insights and action items
                  will be ready shortly.
                </p>
              </motion.div>
            ) : (
              <div className="space-y-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {targetMonth && monthMismatch && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-600">
                      Month mismatch — upload flagged
                    </p>
                    <p className="mt-1 text-sm font-bold text-gray-900">
                      {droppedFileName
                        ? `"${droppedFileName}" contains`
                        : "The provided data contains"}{" "}
                      data for {formatMonthList(monthMismatch)}. Only{" "}
                      {formatMonthLabel(targetMonth)} can be uploaded from this
                      view, so nothing was kept.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={reuploadCorrectedFile}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white transition hover:brightness-110"
                        style={{ backgroundColor: ALORO_ORANGE }}
                      >
                        <Upload size={13} />
                        Re-upload corrected file
                      </button>
                      <button
                        type="button"
                        onClick={discardMismatchedUpload}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
                      >
                        <Trash2 size={13} />
                        Discard upload
                      </button>
                    </div>
                  </div>
                )}

                {selectedUploadFile && (
                  <div className="rounded-xl border border-alloro-orange/30 bg-alloro-orange/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-alloro-orange">
                          {isPreviewingUpload ? "Previewing file" : "File ready"}
                        </p>
                        <p className="mt-1 text-sm font-bold text-gray-900">
                          {selectedUploadFile.name}
                        </p>
                      </div>
                      {isPreviewingUpload && (
                        <span className="inline-flex items-center gap-2 text-xs font-bold text-gray-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Checking months
                        </span>
                      )}
                    </div>
                    {uploadPreview && (
                      <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs font-semibold text-gray-700">
                        <p>
                          Parsed months:{" "}
                          {formatMonthList(uploadPreview.incomingMonths)}
                        </p>
                        <p className="mt-1">
                          {uploadPreview.supersededMonths.length > 0
                            ? `Will overwrite: ${formatMonthList(
                                uploadPreview.supersededMonths.map(
                                  (month) => month.month
                                )
                              )}`
                            : "No existing months will be overwritten."}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Month Tabs — hidden in month-selected mode: the month is
                    fixed, so the pill row would be a dead control. */}
                {!targetMonth && (
                <div className="flex items-center gap-2 flex-wrap">
                  {sortedMonths.map((m) => {
                    const isActive = m.id === activeMonthId;
                    return (
                      <div key={m.id} className="relative">
                        <motion.button
                          onClick={() => setActiveMonthId(m.id)}
                          className="px-4 py-2 rounded-full text-xs border pr-9 font-medium"
                          style={{
                            backgroundColor: isActive ? ALORO_ORANGE : "white",
                            color: isActive ? "white" : "#374151",
                            borderColor: isActive ? ALORO_ORANGE : "#e5e7eb",
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

                        {/* Delete icon per tab */}
                        {months.length > 1 && !targetMonth && (
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

                        {/* Confirm delete month tooltip */}
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
                                  className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
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

                  <button
                    onClick={addMonthBucket}
                    className="p-2 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
                    title="Add month"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                )}

                {/* Summary Cards */}
                {activeMonth && (
                  <div className="grid grid-cols-5 gap-4">
                    {/* Month card - clickable */}
                    <motion.div
                      layout
                      className={`rounded-2xl border bg-white p-4 flex flex-col justify-center transition ${
                        targetMonth
                          ? "cursor-default"
                          : "cursor-pointer hover:border-gray-300"
                      }`}
                      onClick={targetMonth ? undefined : openMonthPicker}
                    >
                      <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 uppercase mb-2">
                        <Calendar size={14} />
                        Month
                      </div>
                      <div className="text-center text-lg font-semibold text-gray-900">
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
                        className="rounded-2xl p-4 border flex flex-col justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${card.tint}, #ffffff)`,
                        }}
                      >
                        <div className="text-[10px] text-gray-400 uppercase text-center mb-1">
                          {card.label}
                        </div>
                        <div className="flex items-center justify-center gap-2 scale-75">
                          <card.icon size={20} className="text-gray-400" />
                          <Odometer value={card.value} />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Table Header — only meaningful once rows exist */}
                {rows.length > 0 && (
                  <div className="grid grid-cols-13 gap-4 px-2 text-[11px] font-bold text-gray-400 uppercase">
                    <div className="col-span-3">Source</div>
                    <div className="col-span-2">Type</div>
                    <div className="col-span-3">Referral Count</div>
                    <div className="col-span-4">Production</div>
                    <div className="col-span-1" />
                  </div>
                )}

                {/* Data Rows */}
                <AnimatePresence>
                  {rows.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="py-10"
                    >
                      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          {
                            label: "Choose File",
                            description: "Select a valid file from your computer",
                            icon: <Upload size={22} />,
                            accent: true,
                            onClick: () => fileInputRef.current?.click(),
                          },
                          {
                            label: "Download Template",
                            description: "Fill out and upload",
                            icon: <Download size={22} />,
                            accent: false,
                            onClick: downloadTemplate,
                          },
                          {
                            label: "Paste Data",
                            description: "Copy and paste data from a sheets software",
                            icon: <ClipboardPaste size={22} />,
                            accent: false,
                            onClick: handlePasteFromClipboard,
                            disabled: isPasting,
                          },
                          {
                            label: "Add Source",
                            description: "Manually input your sources and revenue here",
                            icon: <Plus size={22} />,
                            accent: true,
                            onClick: addRow,
                          },
                        ].map((action) => (
                          <button
                            key={action.label}
                            type="button"
                            onClick={action.onClick}
                            disabled={action.disabled}
                            className="flex flex-col items-center gap-3 rounded-2xl border bg-white px-4 py-6 text-center transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                            style={{
                              borderColor: action.accent ? ALORO_ORANGE : "#E5E7EB",
                            }}
                          >
                            <span
                              className="flex h-12 w-12 items-center justify-center rounded-full"
                              style={{
                                backgroundColor: action.accent
                                  ? "rgba(201,118,94,0.12)"
                                  : "#F3F4F6",
                                color: action.accent ? ALORO_ORANGE : "#6B7280",
                              }}
                            >
                              {action.icon}
                            </span>
                            <span
                              className="text-sm font-bold"
                              style={{
                                color: action.accent ? ALORO_ORANGE : "#374151",
                              }}
                            >
                              {action.label}
                            </span>
                            <span className="text-xs leading-relaxed text-gray-500">
                              {action.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    rows.map((row) => (
                      <motion.div
                        key={row.id}
                        layout
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="grid grid-cols-13 gap-4 items-center px-2"
                      >
                        {/* Source */}
                        <div className="col-span-3 relative">
                          <User
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            size={16}
                          />
                          <input
                            value={row.source}
                            onChange={(e) =>
                              updateRow(row.id, "source", e.target.value)
                            }
                            placeholder="Enter source name..."
                            className="pl-9 w-full border rounded-xl px-4 py-3 text-sm bg-white focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none transition"
                          />
                        </div>

                        {/* Type */}
                        <div className="col-span-2">
                          <button
                            onClick={() => handleTypeToggle(row.id)}
                            className="w-full border rounded-xl px-3 py-3 flex items-center justify-between capitalize text-sm font-semibold transition hover:brightness-95"
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
                            type="text"
                            value={row.referrals}
                            onChange={(e) =>
                              updateRow(
                                row.id,
                                "referrals",
                                sanitizeNumber(e.target.value)
                              )
                            }
                            placeholder="0"
                            className="pl-9 pr-12 w-full border rounded-xl px-4 py-3 text-sm bg-transparent focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none transition"
                          />
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
                            type="text"
                            value={formatMoney(row.production)}
                            onChange={(e) =>
                              updateRow(
                                row.id,
                                "production",
                                sanitizeNumber(e.target.value)
                              )
                            }
                            placeholder="0"
                            className="pl-9 pr-12 w-full border rounded-xl px-4 py-3 text-sm bg-transparent focus:ring-2 focus:ring-orange-200 focus:border-orange-300 outline-none transition"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
                            <button
                              onClick={() =>
                                incrementField(row.id, "production", 100)
                              }
                              className="p-0.5 text-gray-500 hover:text-gray-700"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              onClick={() =>
                                incrementField(row.id, "production", -100)
                              }
                              className="p-0.5 text-gray-500 hover:text-gray-700"
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Delete */}
                        <div className="col-span-1 flex justify-end relative">
                          <button
                            onClick={() => requestDeleteRow(row.id)}
                            className="p-2.5 rounded-xl transition hover:brightness-110"
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
                                    onClick={() => setConfirmDeleteRowId(null)}
                                    className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>

                {/* Compact action row — the empty state renders the full
                    action-card grid instead; once rows exist the only
                    remaining inline action is adding another row. */}
                {rows.length > 0 && (
                  <div className="flex justify-end gap-3 px-2">
                    <button
                      onClick={addRow}
                      className="flex items-center gap-2 border rounded-full px-5 py-2 text-xs font-semibold transition-colors hover:bg-gray-50"
                      style={{ color: ALORO_ORANGE, borderColor: ALORO_ORANGE }}
                    >
                      <Plus size={16} />
                      <span>Add Row</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Paste / file-drop Confirm Dialog */}
          {showPasteConfirm && (
            <PasteConfirmDialog
              pasteInfo={pasteInfo}
              isPasting={isPasting}
              phase={pastePhase}
              batchProgress={batchProgress}
              onConfirm={confirmPaste}
              onCancel={cancelPaste}
              droppedFileName={droppedFileName}
            />
          )}

          {/* Month-conflict merge dialog */}
          <AnimatePresence>
            {monthConflicts && pendingMonths && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/30 flex items-center justify-center z-[110]"
                onClick={cancelMerge}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-2xl p-6 w-96 shadow-xl"
                >
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    Data already exists
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Some months in this data already have entries. Confirm which
                    to replace.
                  </p>
                  <div className="space-y-2 mb-5">
                    {monthConflicts.map((c) => {
                      const label = new Date(c.month + "-01").toLocaleDateString(
                        "en-US",
                        { month: "long", year: "numeric" }
                      );
                      return (
                        <div
                          key={c.month}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                            c.status === "conflict"
                              ? "bg-amber-50 border border-amber-200"
                              : "bg-green-50 border border-green-200"
                          }`}
                        >
                          <span className="text-xs font-medium">
                            {c.status === "conflict" ? "⚠️" : "✅"}
                          </span>
                          <span className="flex-1 font-medium text-gray-900">
                            {label}
                          </span>
                          <span className="text-xs text-gray-500">
                            {c.status === "conflict"
                              ? `Replaces ${c.existingRowCount} existing rows`
                              : "New month"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mb-4">
                    Existing months not listed above will be kept as-is.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={cancelMerge}
                      className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmMerge}
                      className="flex-1 rounded-full px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
                      style={{ backgroundColor: "#C9765E" }}
                    >
                      Confirm & Merge
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Month Picker Modal */}
          <AnimatePresence>
            {showMonthPicker && activeMonth && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/30 flex items-center justify-center z-[110]"
                onClick={() => setShowMonthPicker(false)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-2xl p-6 w-96 shadow-xl relative"
                >
                  <button
                    onClick={() => setShowMonthPicker(false)}
                    className="absolute right-3 top-3 p-1 rounded-lg hover:bg-gray-50"
                    aria-label="Close"
                  >
                    <X size={16} className="text-gray-400" />
                  </button>

                  {pickerStep === "month" && (
                    <>
                      <div className="text-sm font-semibold text-gray-500 mb-4 text-center">
                        Select Month
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {Array.from({ length: 12 }).map((_, i) => {
                          const m = String(i + 1).padStart(2, "0");
                          const label = new Date(`2024-${m}-01`).toLocaleString(
                            undefined,
                            { month: "short" }
                          );
                          const isSelected = m === tempMonth;
                          return (
                            <motion.button
                              key={m}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => {
                                setTempMonth(m);
                                setPickerStep("year");
                              }}
                              className="rounded-xl py-2 text-sm border transition hover:bg-gray-50"
                              style={{
                                backgroundColor: isSelected
                                  ? "rgba(201,118,94,0.12)"
                                  : undefined,
                              }}
                            >
                              {label}
                            </motion.button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {pickerStep === "year" && (
                    <>
                      <div className="text-sm font-semibold text-gray-500 mb-2 text-center">
                        Select Year
                      </div>
                      <div className="text-xs text-gray-400 text-center mb-4">
                        for{" "}
                        {new Date(`2024-${tempMonth}-01`).toLocaleString(
                          undefined,
                          {
                            month: "long",
                          }
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const y = new Date().getFullYear() - i;
                          const candidate = `${y}-${tempMonth}`;
                          const isActive = candidate === activeMonth.month;
                          return (
                            <motion.button
                              key={y}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => commitMonthChange(candidate)}
                              className="rounded-xl py-2 text-sm border transition"
                              style={{
                                backgroundColor: isActive
                                  ? ALORO_ORANGE
                                  : undefined,
                                color: isActive ? "white" : undefined,
                              }}
                            >
                              {y}
                            </motion.button>
                          );
                        })}
                      </div>

                      <div className="flex justify-center mt-5">
                        <button
                          onClick={() => setPickerStep("month")}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Back to months
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Column-mapping side drawer (T18). Slides over the right edge
              of the modal whenever a non-org-cache mapping needs review, or
              when the user clicks "Mapping settings" in the header. */}
          {currentMapping && mappingSource && (
            <ColumnMappingDrawer
              isOpen={drawerOpen}
              headers={mappingHeaders}
              sampleRows={mappingSampleRows}
              mapping={currentMapping}
              source={mappingSource}
              isReprocessing={isReprocessing}
              onChange={setCurrentMapping}
              onReprocess={handleReprocess}
              onClose={() => setDrawerOpen(false)}
            />
          )}

          {/* Footer */}
          {submitStatus !== "success" && (
            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 bg-white">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={clearAllData}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-full border px-5 py-2 text-sm font-medium transition hover:bg-orange-50 disabled:opacity-50"
                  style={{ borderColor: ALORO_ORANGE, color: ALORO_ORANGE }}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
                {error && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-gray-200 px-6 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || isPreviewingUpload}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: ALORO_ORANGE }}
                >
                  {isSubmitting || isPreviewingUpload ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isPreviewingUpload
                    ? "Previewing..."
                    : isSubmitting
                      ? "Submitting..."
                      : selectedUploadFile
                        ? "Upload File & Get Insights"
                        : "Submit & Get Insights"}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
