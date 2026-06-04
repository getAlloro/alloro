import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { showErrorToast, showSuccessToast } from "../../../lib/toast";
import {
  useDeletePmsFile,
  usePmsFileDetail,
  usePmsFileManager,
  usePmsOriginalFileDownload,
  useUpdatePmsFile,
} from "../../../hooks/queries/usePmsFileManagerQueries";
import {
  PmsJobDataEditorModal,
  type PmsJobDataEditorMode,
} from "../PmsJobDataEditorModal";
import type { PmsFileManagerFile } from "../../../api/pms";
import { PmsFileHistoryPanel } from "./PmsFileHistoryPanel";
import { PmsFileList } from "./PmsFileList";
import {
  PmsMonthSlotGrid,
  type PmsCalendarMonth,
} from "./PmsMonthSlotGrid";

export type PmsFileManagerProps = {
  organizationId: number | null;
  locationId: number | null;
  locationName?: string | null;
  canManage: boolean;
  isProcessing: boolean;
  isOpen: boolean;
  initialMonth?: string | null;
  onClose: () => void;
  onUploadClick: (targetMonth?: string | null) => void;
  onDataChanged?: () => void;
};

const ACTIVE_STATUSES = new Set(["pending", "processing", "awaiting_approval"]);

export function PmsFileManager({
  organizationId,
  locationId,
  locationName,
  canManage,
  isProcessing,
  isOpen,
  initialMonth,
  onClose,
  onUploadClick,
  onDataChanged,
}: PmsFileManagerProps) {
  const [editorJobId, setEditorJobId] = useState<number | null>(null);
  const [editorMode, setEditorMode] = useState<PmsJobDataEditorMode>("current");
  const [historyJobId, setHistoryJobId] = useState<number | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [windowEndMonth, setWindowEndMonth] = useState(lastCompletedMonth);
  const appliedInitialMonthRef = useRef<string | null>(null);

  const managerQuery = usePmsFileManager(organizationId, locationId);
  const { refetch: refetchFileManager } = managerQuery;
  const managerData = managerQuery.data?.data;
  const files = useMemo(() => managerData?.files ?? [], [managerData?.files]);
  const slots = useMemo(
    () => managerData?.monthSlots ?? [],
    [managerData?.monthSlots]
  );
  const calendarMonths = useMemo(
    () => buildCalendarMonths(files, slots, windowEndMonth),
    [files, slots, windowEndMonth]
  );
  const filteredFiles = useMemo(
    () => filterFilesByMonth(files, selectedMonth),
    [files, selectedMonth]
  );
  const detailJobId = editorJobId ?? historyJobId;
  const detailQuery = usePmsFileDetail(organizationId, locationId, detailJobId);
  const updateMutation = useUpdatePmsFile(organizationId, locationId);
  const deleteMutation = useDeletePmsFile(organizationId, locationId);
  const downloadMutation = usePmsOriginalFileDownload(locationId);

  const hasRunningJob = useMemo(
    () =>
      files.some((file) => {
        const status = file.automation_status_detail?.status;
        return status ? ACTIVE_STATUSES.has(status) : false;
      }),
    [files]
  );
  const actionsBlocked = isProcessing || hasRunningJob;
  const selectedFile = detailQuery.data?.data?.file ?? null;

  useEffect(() => {
    setSelectedMonth(null);
    setEditorJobId(null);
    setHistoryJobId(null);
    setPendingDeleteId(null);
    setWindowEndMonth(lastCompletedMonth());
    appliedInitialMonthRef.current = null;
  }, [locationId]);

  useEffect(() => {
    if (!isOpen) {
      appliedInitialMonthRef.current = null;
      return;
    }
    if (!initialMonth || appliedInitialMonthRef.current === initialMonth) return;
    if (!calendarMonths.some((month) => month.month === initialMonth)) {
      setWindowEndMonth(initialMonth);
      return;
    }
    setSelectedMonth(initialMonth);
    appliedInitialMonthRef.current = initialMonth;
  }, [calendarMonths, initialMonth, isOpen]);

  useEffect(() => {
    if (calendarMonths.length === 0) return;
    if (
      isOpen &&
      initialMonth &&
      appliedInitialMonthRef.current !== initialMonth &&
      calendarMonths.some((month) => month.month === initialMonth)
    ) {
      return;
    }
    if (selectedMonth && calendarMonths.some((m) => m.month === selectedMonth)) {
      return;
    }
    setSelectedMonth(calendarMonths[calendarMonths.length - 1]?.month ?? null);
  }, [calendarMonths, initialMonth, isOpen, selectedMonth]);

  useEffect(() => {
    const handler = () => {
      void refetchFileManager();
    };
    window.addEventListener("pms:job-uploaded", handler);
    return () => window.removeEventListener("pms:job-uploaded", handler);
  }, [refetchFileManager]);

  const openEditor = (jobId: number, mode: PmsJobDataEditorMode) => {
    setHistoryJobId(null);
    setEditorMode(mode);
    setEditorJobId(jobId);
  };

  const handleSelectMonth = (month: PmsCalendarMonth) => {
    setSelectedMonth(month.month);
    setEditorJobId(null);
    setHistoryJobId(null);
    setPendingDeleteId(null);
  };

  const handleUploadMonth = (month: PmsCalendarMonth) => {
    setSelectedMonth(month.month);
    onUploadClick(month.month);
  };

  const handleEditMonth = (month: PmsCalendarMonth) => {
    if (!month.jobId) return;
    setSelectedMonth(month.month);
    openEditor(month.jobId, "current");
  };

  const handlePreviousWindow = () => {
    setWindowEndMonth((month) => addMonths(month, -1));
  };

  const handleNextWindow = () => {
    setWindowEndMonth((month) => {
      const nextMonth = addMonths(month, 1);
      return nextMonth > lastCompletedMonth() ? month : nextMonth;
    });
  };

  const handleCurrentWindow = () => {
    setWindowEndMonth(lastCompletedMonth());
  };

  const handleSave = async (responseLog: Record<string, unknown>) => {
    if (!editorJobId) return;
    const response = await updateMutation.mutateAsync({
      jobId: editorJobId,
      responseLog,
    });
    if (!response.success) {
      throw new Error(response.error || "Failed to update PMS file.");
    }
    // The editor (PMSDataViewer) shows its own "saved" confirmation. We no
    // longer claim the agent is rerunning — edits surface a stale-data alert.
    onDataChanged?.();
  };

  const handleDelete = async (jobId: number) => {
    const response = await deleteMutation.mutateAsync(jobId);
    if (!response.success) {
      showErrorToast("Delete blocked", response.error || "Unable to delete this file.");
      return;
    }
    setPendingDeleteId(null);
    showSuccessToast(
      "PMS file deleted",
      "Removed from active reporting. Use Get updated insights to refresh."
    );
    onDataChanged?.();
  };

  const handleDownload = async (jobId: number) => {
    const response = await downloadMutation.mutateAsync(jobId);
    if (!response.success || !response.data?.url) {
      showErrorToast("Download unavailable", response.error || "No original file is saved.");
      return;
    }
    window.location.assign(response.data.url);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70]">
          <motion.button
            type="button"
            aria-label="Close PMS file manager"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-alloro-navy/45 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 280 }}
            className="absolute bottom-0 right-0 top-0 flex w-full flex-col border-l border-line-soft bg-white shadow-2xl sm:w-[min(92vw,620px)]"
            aria-label="PMS file manager"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line-soft bg-white px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-alloro-orange">
                  PMS File Manager
                </p>
                <h2 className="mt-1 font-display text-xl font-medium tracking-tight text-alloro-navy sm:text-2xl">
                  {locationName ? `${locationName} monthly files` : "Monthly files"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-soft bg-white text-alloro-navy transition-all hover:scale-[1.02] hover:border-alloro-orange/40 hover:bg-alloro-orange/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/25"
                aria-label="Close PMS file manager"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50/80 px-5 py-5 sm:px-6">
              <p className="max-w-xl text-sm font-semibold leading-6 text-[color:var(--color-pm-text-secondary)]">
                Pick a month to review data, then choose whether to upload or edit.
              </p>

              {actionsBlocked && (
                <div className="mt-5 flex items-center gap-3 rounded-xl border border-alloro-orange/20 bg-alloro-orange/10 p-4 text-sm font-bold text-alloro-navy">
                  <Loader2 className="h-4 w-4 animate-spin text-alloro-orange" />
                  PMS processing is running for this location. File edits are paused until it finishes.
                </div>
              )}

              <div className="mt-6 space-y-6">
                <PmsMonthSlotGrid
                  months={calendarMonths}
                  selectedMonth={selectedMonth}
                  canManage={canManage}
                  isProcessing={actionsBlocked}
                  windowLabel={`${formatMonth(calendarMonths[0]?.month ?? windowEndMonth)} - ${formatMonth(calendarMonths[calendarMonths.length - 1]?.month ?? windowEndMonth)}`}
                  canGoNext={windowEndMonth < lastCompletedMonth()}
                  onSelectMonth={handleSelectMonth}
                  onUploadMonth={handleUploadMonth}
                  onEditMonth={handleEditMonth}
                  onPreviousWindow={handlePreviousWindow}
                  onNextWindow={handleNextWindow}
                  onCurrentWindow={handleCurrentWindow}
                />
                {selectedMonth && (
                  <div className="rounded-xl border border-line-soft bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-alloro-orange">
                      Selected month
                    </p>
                    <p className="mt-1 font-display text-xl font-semibold text-alloro-navy">
                      {formatMonth(selectedMonth)}
                    </p>
                  </div>
                )}
                <PmsFileList
                  files={filteredFiles}
                  selectedMonth={selectedMonth}
                  canManage={canManage}
                  isProcessing={actionsBlocked}
                  pendingDeleteId={pendingDeleteId}
                  isDeleting={deleteMutation.isPending}
                  onEdit={(jobId) => openEditor(jobId, "current")}
                  onViewOriginal={(jobId) => openEditor(jobId, "original")}
                  onHistory={(jobId) => {
                    setEditorJobId(null);
                    setHistoryJobId(jobId);
                  }}
                  onDownload={handleDownload}
                  onAskDelete={setPendingDeleteId}
                  onConfirmDelete={handleDelete}
                  onCancelDelete={() => setPendingDeleteId(null)}
                />
                <PmsFileHistoryPanel
                  file={historyJobId ? selectedFile : null}
                  isLoading={Boolean(historyJobId && detailQuery.isLoading)}
                  onClose={() => setHistoryJobId(null)}
                />
              </div>
            </div>

            <PmsJobDataEditorModal
              file={editorJobId ? selectedFile : null}
              mode={editorMode}
              selectedMonth={selectedMonth}
              canEdit={canManage && !actionsBlocked}
              onClose={() => setEditorJobId(null)}
              onSave={handleSave}
            />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

function filterFilesByMonth(
  files: PmsFileManagerFile[],
  selectedMonth: string | null
) {
  if (!selectedMonth) return files;
  return files.filter((file) =>
    [
      ...file.months,
      ...file.original_months,
      ...file.active_months,
      ...file.superseded_months,
    ].includes(selectedMonth)
  );
}

function buildCalendarMonths(
  files: PmsFileManagerFile[],
  slots: Array<{
    month: string;
    status: "active" | "missing";
    jobId: number | null;
    fileName: string | null;
  }>,
  windowEndMonth: string
): PmsCalendarMonth[] {
  const activeByMonth = new Map<string, { jobId: number; fileName: string | null }>();

  for (const slot of slots) {
    if (slot.status === "active" && slot.jobId) {
      activeByMonth.set(slot.month, {
        jobId: slot.jobId,
        fileName: slot.fileName,
      });
    }
  }

  for (const file of files) {
    if (file.is_deleted) continue;
    for (const month of file.active_months) {
      if (!isValidMonth(month)) continue;
      activeByMonth.set(month, {
        jobId: file.id,
        fileName: file.original_file_name,
      });
    }
  }

  const latestMonth = windowEndMonth;
  const actualLatestMonth = lastCompletedMonth();
  const firstMonth = addMonths(latestMonth, -11);

  const calendar: PmsCalendarMonth[] = [];
  for (let month = firstMonth; month <= latestMonth; month = addMonths(month, 1)) {
    const owner = activeByMonth.get(month);
    const isLatest = month === actualLatestMonth;
    calendar.push({
      month,
      status: owner ? "active" : isLatest ? "ready" : "missing",
      jobId: owner?.jobId ?? null,
      fileName: owner?.fileName ?? null,
      isLatest,
    });
  }
  return calendar;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function lastCompletedMonth() {
  return addMonths(currentMonth(), -1);
}

function isValidMonth(month: string) {
  return /^\d{4}-\d{2}$/.test(month);
}

function addMonths(ym: string, delta: number): string {
  const [year, month] = ym.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

function formatMonth(month: string) {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}
