import { PMSDataViewer } from "./PMSDataViewer";
import type { MonthEntryForm } from "./pmsDataTransform";
import type { PmsFileManagerFileDetail } from "../../api/pms";

export type PmsJobDataEditorMode = "current" | "original";

export type PmsJobDataEditorModalProps = {
  file: PmsFileManagerFileDetail | null;
  mode: PmsJobDataEditorMode;
  selectedMonth?: string | null;
  locationName?: string | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (responseLog: Record<string, unknown>) => Promise<void>;
};

export function PmsJobDataEditorModal({
  file,
  mode,
  selectedMonth,
  locationName,
  canEdit,
  onClose,
  onSave,
}: PmsJobDataEditorModalProps) {
  if (!file) return null;

  const isOriginal = mode === "original";
  const originalData = hasMonthData(file.original_response_log)
    ? file.original_response_log
    : file.response_log;
  const initialData = isOriginal ? originalData : file.response_log;
  // Month-scoped edits title as "Edit {location} — {Month Year}"; the
  // generic multi-month editor keeps the old title + subtitle.
  const isMonthScopedEdit = !isOriginal && Boolean(selectedMonth);
  const title = isOriginal
    ? "Original Parsed PMS Data"
    : isMonthScopedEdit
      ? `Edit ${locationName ? `${locationName} — ` : ""}${formatMonthLabel(selectedMonth as string)}`
      : "Edit PMS File Data";
  const subtitle = isOriginal
    ? file.original_file_name ?? "Original parsed snapshot unavailable"
    : file.original_file_name ?? "Current parsed PMS data";

  return (
    <PMSDataViewer
      isOpen
      jobId={file.id}
      title={title}
      subtitle={subtitle}
      hideSubtitle={isMonthScopedEdit}
      initialData={initialData}
      initialMonth={selectedMonth}
      centerInMainView
      readOnly={isOriginal || !canEdit}
      onClose={onClose}
      onSave={
        isOriginal || !canEdit
          ? undefined
          : (months) =>
              onSave(
                buildUpdatedResponseLog(file.response_log, months, selectedMonth)
              )
      }
    />
  );
}

function formatMonthLabel(month: string): string {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function hasMonthData(value: unknown) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.length > 0;
  const record = value as Record<string, unknown>;
  const nestedData =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : null;
  return (
    (Array.isArray(record.monthly_rollup) && record.monthly_rollup.length > 0) ||
    (Array.isArray(record.monthlyRollup) && record.monthlyRollup.length > 0) ||
    (Array.isArray(record.report_data) && record.report_data.length > 0) ||
    (Array.isArray(record.reportData) && record.reportData.length > 0) ||
    (Array.isArray(nestedData?.monthly_rollup) &&
      nestedData.monthly_rollup.length > 0) ||
    (Array.isArray(nestedData?.monthlyRollup) &&
      nestedData.monthlyRollup.length > 0) ||
    (Array.isArray(nestedData?.report_data) &&
      nestedData.report_data.length > 0)
  );
}

function buildUpdatedResponseLog(
  responseLog: unknown,
  months: MonthEntryForm[],
  selectedMonth?: string | null
): Record<string, unknown> {
  if (
    responseLog &&
    typeof responseLog === "object" &&
    !Array.isArray(responseLog)
  ) {
    if (selectedMonth) {
      const existingRollup = Array.isArray(
        (responseLog as Record<string, unknown>).monthly_rollup
      )
        ? ((responseLog as Record<string, unknown>).monthly_rollup as unknown[])
        : [];
      const updatedByMonth = new Map(months.map((m) => [m.month, m]));
      const seen = new Set<string>();
      const mergedRollup = existingRollup.map((entry) => {
        const month =
          entry && typeof entry === "object"
            ? String((entry as Record<string, unknown>).month ?? "")
            : "";
        const updated = updatedByMonth.get(month);
        if (updated) {
          seen.add(month);
          return updated;
        }
        return entry;
      });

      for (const month of months) {
        if (!seen.has(month.month)) {
          mergedRollup.push(month);
        }
      }

      return {
        ...(responseLog as Record<string, unknown>),
        monthly_rollup: mergedRollup,
      };
    }

    return {
      ...(responseLog as Record<string, unknown>),
      monthly_rollup: months,
    };
  }

  return { monthly_rollup: months };
}
