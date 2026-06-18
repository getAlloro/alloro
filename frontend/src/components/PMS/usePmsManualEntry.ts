import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showUploadToast } from "../../lib/toast";

import {
  transformUIToBackend,
  calculateTotals,
} from "./pmsDataTransform";
import type { MonthBucket } from "./types";
import {
  previewMapping,
  type ColumnMapping,
  type MappingSource,
  type MonthlyRollupForJob,
} from "../../api/pms";
import { usePasteHandler } from "./usePasteHandler";
import {
  formatMonthLabel,
  formatMonthList,
  getPreviousMonth,
  monthlyRollupToBuckets,
  parseTabularToRows,
  type PmsUploadPreviewData,
} from "./pmsManualEntryModal.utils";
import { createPmsManualEntrySubmit } from "./usePmsManualEntrySubmit";
import { usePmsManualEntryRows } from "./usePmsManualEntryRows";
import { usePmsManualEntryUpload } from "./usePmsManualEntryUpload";

interface UsePmsManualEntryParams {
  isOpen: boolean;
  onClose: () => void;
  clientId: string; // domain
  locationId?: number | null;
  targetMonth?: string | null;
  onSuccess?: () => void;
}

/**
 * Reactive core for PMSManualEntryModal: all month/source/upload/mapping state,
 * the paste pipeline, and every handler, lifted verbatim out of the component.
 * Hooks here run in the exact same order they had in the component (including
 * the TDZ-ordered `pastedRawTextRef`/`runMappingPreviewRef` refs and the
 * `usePasteHandler` call), so the component calls this hook at the same
 * position in its own hook sequence and behavior is preserved.
 */
export function usePmsManualEntry({
  isOpen,
  onClose,
  clientId,
  locationId,
  targetMonth,
  onSuccess,
}: UsePmsManualEntryParams) {
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

  // Upload-and-file domain — clear/reset, month-mismatch resolutions,
  // rollup→bucket replacement, the file-preview pipeline, and the file-input,
  // drag-and-drop, and CSV-template handlers — lifted verbatim into
  // usePmsManualEntryUpload as one contiguous block of useCallbacks (no
  // useState/useRef inside), called here at the exact position the block
  // occupied so the overall hook-call order (and behavior) is unchanged.
  const {
    clearAllData,
    discardMismatchedUpload,
    reuploadCorrectedFile,
    handleFileInputChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    downloadTemplate,
  } = usePmsManualEntryUpload({
    targetMonth,
    locationId,
    createEmptyMonthBucket,
    scopeMonthsToTarget,
    flagOffsetMonths,
    fileInputRef,
    dragCounter,
    setMonths,
    setActiveMonthId,
    setError,
    setSelectedUploadFile,
    setUploadPreview,
    setMonthMismatch,
    setDroppedFileName,
    setIsPreviewingUpload,
    setCurrentMapping,
    setMappingSource,
    setMappingAllRows,
    setParsedPreview,
    setDrawerOpen,
    setIsDragging,
  });

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

  // Month- and row-management handlers — lifted verbatim into
  // usePmsManualEntryRows as a contiguous trailing block of hooks. Called here
  // at the exact position the block occupied, so the overall hook-call order
  // (and behavior) is unchanged.
  const {
    addMonthBucket,
    deleteMonth,
    requestDeleteMonth,
    addRow,
    updateRow,
    handleTypeToggle,
    deleteRow,
    requestDeleteRow,
    incrementField,
    openMonthPicker,
    commitMonthChange,
  } = usePmsManualEntryRows({
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
  });

  // Submit handler — body lifted verbatim into createPmsManualEntrySubmit.
  // It was a plain async function (not a hook), so relocating it changes no
  // hook-call order; the closed-over reactive values/setters are passed in.
  const handleSubmit = createPmsManualEntrySubmit({
    selectedUploadFile,
    getSubmitMonths,
    targetMonth,
    clientId,
    locationId,
    currentMapping,
    mappingAllRows,
    months,
    onSuccess,
    onClose,
    setIsSubmitting,
    setError,
    setSubmitStatus,
  });

  return {
    // state
    months,
    activeMonthId,
    setActiveMonthId,
    isSubmitting,
    submitStatus,
    error,
    showMonthPicker,
    setShowMonthPicker,
    pickerStep,
    setPickerStep,
    tempMonth,
    setTempMonth,
    confirmDeleteRowId,
    setConfirmDeleteRowId,
    confirmDeleteMonthId,
    setConfirmDeleteMonthId,
    pendingMonths,
    monthConflicts,
    isDragging,
    fileInputRef,
    droppedFileName,
    selectedUploadFile,
    monthMismatch,
    uploadPreview,
    isPreviewingUpload,
    mappingHeaders,
    mappingSampleRows,
    mappingAllRows,
    currentMapping,
    setCurrentMapping,
    mappingSource,
    isResolvingMapping,
    isReprocessing,
    drawerOpen,
    setDrawerOpen,
    // merge helpers
    confirmMerge,
    cancelMerge,
    // paste pipeline
    isPasting,
    pastePhase,
    showPasteConfirm,
    pasteInfo,
    batchProgress,
    confirmPaste,
    cancelPaste,
    handlePasteEvent,
    handlePasteFromClipboard,
    // mapping reprocess
    handleReprocess,
    // data reset / mismatch
    clearAllData,
    discardMismatchedUpload,
    reuploadCorrectedFile,
    // upload handlers
    handleFileInputChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    downloadTemplate,
    // derived
    sortedMonths,
    activeMonth,
    rows,
    totals,
    // month management
    addMonthBucket,
    deleteMonth,
    requestDeleteMonth,
    openMonthPicker,
    commitMonthChange,
    // row management
    addRow,
    updateRow,
    handleTypeToggle,
    deleteRow,
    requestDeleteRow,
    incrementField,
    // submit
    handleSubmit,
  };
}
