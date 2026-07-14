import { showUploadToast } from "../../lib/toast";

import {
  submitManualPMSData,
  uploadPastedData,
  uploadPMSData,
  uploadWithMapping,
  type ColumnMapping,
  type ManualMonthEntry,
} from "../../api/pms";
import type { MonthBucket } from "./types";
import { formatMonthLabel } from "./pmsManualEntryModal.utils";
import type { PmsCopy } from "./pmsCopy";

/**
 * Dependencies the submit handler closes over. These are the exact reactive
 * values and setters the original inline `handleSubmit` referenced — passed in
 * so the handler body can be lifted verbatim out of `usePmsManualEntry`
 * without changing any logic, branch, string, or call order. `handleSubmit`
 * was a plain async function (not a hook), so relocating it changes no
 * hook-call sequence.
 */
interface PmsManualEntrySubmitDeps {
  copy: PmsCopy;
  selectedUploadFile: File | null;
  getSubmitMonths: () => ManualMonthEntry[];
  targetMonth?: string | null;
  clientId: string;
  locationId?: number | null;
  currentMapping: ColumnMapping | null;
  mappingAllRows: Record<string, unknown>[];
  pastedRawText: string;
  currentMonth: string;
  months: MonthBucket[];
  onSuccess?: () => void;
  onClose: () => void;
  setIsSubmitting: (value: boolean) => void;
  setError: (value: string | null) => void;
  setSubmitStatus: (value: "idle" | "success" | "error") => void;
}

export function createPmsManualEntrySubmit({
  copy,
  selectedUploadFile,
  getSubmitMonths,
  targetMonth,
  clientId,
  locationId,
  currentMapping,
  mappingAllRows,
  pastedRawText,
  currentMonth,
  months,
  onSuccess,
  onClose,
  setIsSubmitting,
  setError,
  setSubmitStatus,
}: PmsManualEntrySubmitDeps) {
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
            (month) => month.month === targetMonth && month.sources.length > 0,
          )
        ) {
          throw new Error(
            `Add data for ${formatMonthLabel(targetMonth)} before uploading.`,
          );
        }
        const result = await uploadPMSData({
          domain: clientId,
          file: selectedUploadFile,
          locationId,
          targetMonth,
          monthlyDataOverride: backendData,
        });

        if (result.success) {
          setSubmitStatus("success");
          showUploadToast(
            copy.toastDataReceivedTitle,
            copy.processingInsightsMessage,
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

    if (pastedRawText) {
      setIsSubmitting(true);
      setError(null);
      try {
        const result = await uploadPastedData({
          rawText: pastedRawText,
          currentMonth,
          targetMonth,
          domain: clientId,
          locationId,
          monthlyDataOverride: getSubmitMonths(),
        });
        if (!result.success) throw new Error(result.error.message);

        setSubmitStatus("success");
        showUploadToast(
          copy.toastDataReceivedTitle,
          copy.processingInsightsMessage,
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("pms:job-uploaded", {
              detail: { clientId, entryType: "paste", locationId },
            }),
          );
        }
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 2000);
        return;
      } catch (err) {
        setSubmitStatus("error");
        setError(err instanceof Error ? err.message : "Submission failed");
        return;
      } finally {
        setIsSubmitting(false);
      }
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
            copy.toastReceivedTitle,
            copy.processingInsightsMessage,
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
        r.source.trim() &&
        (Number(r.referrals) > 0 || Number(r.production) > 0),
    );

    if (validRows.length === 0) {
      setError(copy.validationMissingSourceData);
      return;
    }

    // Check for empty source names
    const emptySourceRows = allRows.filter(
      (r) =>
        !r.source.trim() &&
        (Number(r.referrals) > 0 || Number(r.production) > 0),
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
          (month) => month.month === targetMonth && month.sources.length > 0,
        )
      ) {
        throw new Error(
          `Add data for ${formatMonthLabel(targetMonth)} before submitting.`,
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
        showUploadToast(
          copy.toastDataReceivedTitle,
          copy.processingInsightsMessage,
        );

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

  return handleSubmit;
}
