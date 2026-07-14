import { useCallback } from "react";
import { showUploadToast } from "../../lib/toast";

import {
  previewPmsUploadFile,
  type ManualMonthEntry,
  type MonthlyRollupMonth,
} from "../../api/pms";
import type { MonthBucket } from "./types";
import type { PasteParserType } from "./pastePipeline";
import {
  formatMonthLabel,
  getPreviousMonth,
  monthlyRollupToBuckets,
  type PmsUploadPreviewData,
} from "./pmsManualEntryModal.utils";
import type { PmsCopy } from "./pmsCopy";

/**
 * Upload-and-file domain of usePmsManualEntry: clear/reset, month-mismatch
 * resolutions, rollup→bucket replacement, the file-preview pipeline, plus the
 * file-input, drag-and-drop, and CSV-template handlers. Lifted verbatim as one
 * contiguous block of hooks (all `useCallback`s — no `useState`/`useRef`
 * inside), called from the parent hook at the exact position the block
 * occupied, so the overall hook-call order (and behavior) is unchanged. The
 * upstream values/refs/setters these handlers closed over are passed in.
 */
interface UsePmsManualEntryUploadParams {
  copy: PmsCopy;
  targetMonth?: string | null;
  locationId?: number | null;
  createEmptyMonthBucket: (month: string) => MonthBucket;
  scopeMonthsToTarget: (incomingMonths: MonthBucket[]) => MonthBucket[];
  flagOffsetMonths: (incomingMonthKeys: string[]) => boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  dragCounter: React.MutableRefObject<number>;
  setMonths: React.Dispatch<React.SetStateAction<MonthBucket[]>>;
  setActiveMonthId: React.Dispatch<React.SetStateAction<number | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedUploadFile: React.Dispatch<React.SetStateAction<File | null>>;
  setUploadPreview: React.Dispatch<
    React.SetStateAction<PmsUploadPreviewData | null>
  >;
  setMonthMismatch: React.Dispatch<React.SetStateAction<string[] | null>>;
  setDroppedFileName: React.Dispatch<React.SetStateAction<string | null>>;
  setIsPreviewingUpload: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveParserType: React.Dispatch<
    React.SetStateAction<PasteParserType | null>
  >;
  clearFormulaConfigurationState: () => void;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
}

export function usePmsManualEntryUpload({
  copy,
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
  setActiveParserType,
  clearFormulaConfigurationState,
  setIsDragging,
}: UsePmsManualEntryUploadParams) {
  // Clear all data and reset to empty state
  const clearAllData = useCallback(() => {
    const initialMonth = targetMonth ?? getPreviousMonth();
    const initialBucket = createEmptyMonthBucket(initialMonth);
    setMonths([initialBucket]);
    setActiveMonthId(initialBucket.id);
    setError(null);
    setSelectedUploadFile(null);
    setUploadPreview(null);
    setActiveParserType(null);
    clearFormulaConfigurationState();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [
    createEmptyMonthBucket,
    targetMonth,
    setMonths,
    setActiveMonthId,
    setError,
    setSelectedUploadFile,
    setUploadPreview,
    setActiveParserType,
    clearFormulaConfigurationState,
    fileInputRef,
  ]);

  // Month-mismatch resolutions: both clear the flagged batch; re-upload
  // additionally reopens the file picker for the corrected file.
  const discardMismatchedUpload = useCallback(() => {
    setMonthMismatch(null);
    setDroppedFileName(null);
    clearAllData();
  }, [clearAllData, setMonthMismatch, setDroppedFileName]);

  const reuploadCorrectedFile = useCallback(() => {
    setMonthMismatch(null);
    setDroppedFileName(null);
    clearAllData();
    fileInputRef.current?.click();
  }, [clearAllData, setMonthMismatch, setDroppedFileName, fileInputRef]);

  const replaceMonthsFromRollup = useCallback(
    (rollup: Array<MonthlyRollupMonth | ManualMonthEntry>) => {
      const buckets = scopeMonthsToTarget(monthlyRollupToBuckets(rollup));
      if (targetMonth && buckets.length === 0) {
        const emptyTarget = createEmptyMonthBucket(targetMonth);
        setMonths([emptyTarget]);
        setActiveMonthId(emptyTarget.id);
        setError(
          `This file does not include ${formatMonthLabel(targetMonth)}. Choose a file with that month or enter it manually.`,
        );
        return;
      }
      if (buckets.length === 0) return;
      setMonths(buckets);
      setActiveMonthId(buckets[0]?.id ?? null);
    },
    [
      createEmptyMonthBucket,
      scopeMonthsToTarget,
      targetMonth,
      setMonths,
      setActiveMonthId,
      setError,
    ],
  );

  const handleSelectedUploadFile = useCallback(
    async (file: File) => {
      const validExts = [".csv", ".xls", ".xlsx"];
      const isValid = validExts.some((ext) =>
        file.name.toLowerCase().endsWith(ext),
      );

      if (!isValid) {
        setError(
          `"${file.name}" is not supported. Please choose a CSV, XLS, or XLSX file.`,
        );
        return;
      }

      if (!locationId) {
        setError(copy.previewLocationRequired);
        return;
      }

      setError(null);
      setDroppedFileName(file.name);
      setSelectedUploadFile(file);
      setUploadPreview(null);
      setIsPreviewingUpload(true);
      setActiveParserType(null);
      clearFormulaConfigurationState();

      try {
        const response = await previewPmsUploadFile(
          file,
          locationId,
          targetMonth,
        );
        if (!response.success || !response.data) {
          throw new Error(
            response.error || `Could not preview this ${copy.fileNounLower}.`,
          );
        }

        // Month-selected mode: a file carrying any other month is flagged,
        // not silently trimmed. droppedFileName stays set so the mismatch
        // panel can name the offending file.
        if (flagOffsetMonths(response.data.incomingMonths)) return;
        setActiveParserType(response.data.parserType);

        const scopedRollup = targetMonth
          ? response.data.monthlyRollup.filter(
              (month) => month.month === targetMonth,
            )
          : response.data.monthlyRollup;
        const scopedIncomingMonths = targetMonth
          ? response.data.incomingMonths.filter(
              (month) => month === targetMonth,
            )
          : response.data.incomingMonths;
        const scopedSupersededMonths = targetMonth
          ? response.data.supersededMonths.filter(
              (month) => month.month === targetMonth,
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
          copy.toastParsedTitle,
          scopedSupersededMonths.length > 0
            ? `${scopedSupersededMonths.length} month(s) will be overwritten.`
            : targetMonth
              ? `Only ${formatMonthLabel(targetMonth)} will be uploaded.`
              : "No saved months will be overwritten.",
        );
      } catch (err) {
        setSelectedUploadFile(null);
        setUploadPreview(null);
        setDroppedFileName(null);
        setError(
          err instanceof Error
            ? err.message
            : `Could not preview this ${copy.fileNounLower}.`,
        );
      } finally {
        setIsPreviewingUpload(false);
      }
    },
    [
      copy.fileNounLower,
      copy.previewLocationRequired,
      copy.toastParsedTitle,
      flagOffsetMonths,
      locationId,
      replaceMonthsFromRollup,
      targetMonth,
      setError,
      setDroppedFileName,
      setSelectedUploadFile,
      setUploadPreview,
      setIsPreviewingUpload,
      setActiveParserType,
      clearFormulaConfigurationState,
    ],
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void handleSelectedUploadFile(file);
    },
    [handleSelectedUploadFile],
  );

  // Drag & drop handlers for uploaded data files
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current += 1;
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragging(true);
      }
    },
    [dragCounter, setIsDragging],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current -= 1;
      if (dragCounter.current === 0) {
        setIsDragging(false);
      }
    },
    [dragCounter, setIsDragging],
  );

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
        setError(copy.previewUploadOneFile);
        return;
      }

      void handleSelectedUploadFile(files[0]);
    },
    [
      copy.previewUploadOneFile,
      handleSelectedUploadFile,
      dragCounter,
      setIsDragging,
      setError,
    ],
  );

  // Download CSV template with the expected headers
  const downloadTemplate = useCallback(() => {
    const csv = `${copy.templateHeaders}\n${copy.templateExample}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = copy.templateDownloadName;
    a.click();
    URL.revokeObjectURL(url);
  }, [copy.templateDownloadName, copy.templateExample, copy.templateHeaders]);

  return {
    clearAllData,
    discardMismatchedUpload,
    reuploadCorrectedFile,
    replaceMonthsFromRollup,
    handleSelectedUploadFile,
    handleFileInputChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    downloadTemplate,
  };
}
