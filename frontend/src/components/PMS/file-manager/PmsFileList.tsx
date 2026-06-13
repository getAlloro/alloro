import {
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PmsFileManagerFile } from "../../../api/pms";

export type PmsFileListProps = {
  files: PmsFileManagerFile[];
  /** Per-location run sequence (file id → 1-based "Analysis #N"). */
  analysisNumbers: Map<number, number>;
  selectedMonth: string | null;
  canManage: boolean;
  isProcessing: boolean;
  pendingDeleteId: number | null;
  isDeleting: boolean;
  onEdit: (jobId: number) => void;
  onDownload: (jobId: number) => void;
  onHistory: (jobId: number) => void;
  onAskDelete: (jobId: number) => void;
  onConfirmDelete: (jobId: number) => void;
  onCancelDelete: () => void;
};

export function PmsFileList({
  files,
  analysisNumbers,
  selectedMonth,
  canManage,
  isProcessing,
  pendingDeleteId,
  isDeleting,
  onEdit,
  onDownload,
  onHistory,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: PmsFileListProps) {
  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-soft bg-white p-5 text-center">
        <FileSpreadsheet className="mx-auto h-7 w-7 text-alloro-orange" />
        <p className="mt-3 text-sm font-bold text-alloro-navy">
          {selectedMonth
            ? `No PMS data saved for ${formatMonth(selectedMonth)}`
            : "No PMS files saved yet"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {files.map((file) => {
        const isDeleted = file.is_deleted;
        const isPendingDelete = pendingDeleteId === file.id;
        const canMutate = canManage && !isProcessing && !isDeleted;

        return (
          <article
            key={file.id}
            className={`rounded-xl border bg-white p-3 shadow-sm ${
              isDeleted ? "border-red-100 opacity-70" : "border-line-soft"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-alloro-orange" />
                  <h3 className="truncate text-sm font-black text-alloro-navy">
                    {file.months.length > 1 ? "Batch Analysis" : "Analysis"} #
                    {analysisNumbers.get(file.id) ?? file.id}
                  </h3>
                  <StatusPill file={file} />
                </div>
                <p className="mt-2 text-xs font-semibold text-[color:var(--color-pm-text-secondary)]">
                  Ran on{" "}
                  <span className="font-bold text-alloro-navy">
                    {formatDate(file.timestamp)}
                  </span>{" "}
                  with data included for{" "}
                  <span className="font-bold text-alloro-navy">
                    {formatMonths(file.months)}
                  </span>
                </p>
                {file.superseded_months.length > 0 && !isDeleted && (
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-amber-700">
                    Superseded: {formatMonths(file.superseded_months)}
                  </p>
                )}
              </div>

              <RowActionsMenu
                file={file}
                selectedMonth={selectedMonth}
                canMutate={canMutate}
                isPendingDelete={isPendingDelete}
                isDeleting={isDeleting}
                onEdit={onEdit}
                onDownload={onDownload}
                onHistory={onHistory}
                onAskDelete={onAskDelete}
                onConfirmDelete={onConfirmDelete}
                onCancelDelete={onCancelDelete}
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

/**
 * RowActionsMenu — single ⋯ trigger with the row actions as dropdown items
 * (replaces the old wrapping pile of icon buttons). The delete confirmation
 * popover anchors under the same trigger.
 */
function RowActionsMenu({
  file,
  selectedMonth,
  canMutate,
  isPendingDelete,
  isDeleting,
  onEdit,
  onDownload,
  onHistory,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  file: PmsFileManagerFile;
  selectedMonth: string | null;
  canMutate: boolean;
  isPendingDelete: boolean;
  isDeleting: boolean;
  onEdit: (jobId: number) => void;
  onDownload: (jobId: number) => void;
  onHistory: (jobId: number) => void;
  onAskDelete: (jobId: number) => void;
  onConfirmDelete: (jobId: number) => void;
  onCancelDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the overflow menu on outside-click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  // The editor opens scoped to the panel's selected month; with no selection
  // a single-month run still names its one month. Multi-month with no
  // selection falls back to the generic label.
  const updateMonth =
    selectedMonth ?? (file.months.length === 1 ? file.months[0] : null);

  const items: Array<{
    label: string;
    icon: React.ReactNode;
    disabled?: boolean;
    /** Muted helper line under the label (e.g. why an item is disabled). */
    caption?: string;
    onClick: () => void;
  }> = [
    {
      label: updateMonth ? `Update ${formatMonth(updateMonth)}` : "Edit current data",
      icon: <Pencil className="h-3.5 w-3.5" />,
      disabled: !canMutate,
      onClick: () => onEdit(file.id),
    },
    {
      label: "View history",
      icon: <History className="h-3.5 w-3.5" />,
      onClick: () => onHistory(file.id),
    },
    {
      label: "Download original file",
      icon: <Download className="h-3.5 w-3.5" />,
      disabled: !file.has_original_file,
      caption: !file.has_original_file
        ? "Downloads only work on data uploaded from June onwards"
        : undefined,
      onClick: () => onDownload(file.id),
    },
  ];

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Analysis actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-soft bg-white text-alloro-navy transition-all hover:scale-[1.02] hover:border-alloro-orange/50"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-line-soft bg-white py-1 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={run(item.onClick)}
              className="flex w-full items-start gap-2.5 px-3.5 py-2 text-left text-xs font-semibold text-alloro-navy transition-colors hover:bg-alloro-orange/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="mt-0.5 shrink-0">{item.icon}</span>
              <span className="min-w-0">
                <span className="block">{item.label}</span>
                {item.caption && (
                  <span className="mt-0.5 block text-[11px] font-medium normal-case leading-snug text-[color:var(--color-pm-text-secondary)]">
                    {item.caption}
                  </span>
                )}
              </span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            disabled={!canMutate}
            onClick={run(() => onAskDelete(file.id))}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete file
          </button>
        </div>
      )}

      {isPendingDelete && (
        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-red-200 bg-white p-3 text-left shadow-xl">
          <p className="text-xs font-black uppercase tracking-widest text-red-700">
            Confirm delete
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-alloro-navy">
            Remove this PMS file from active reporting?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onConfirmDelete(file.id)}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting && <Loader2 className="h-3 w-3 animate-spin" />}
              {isDeleting ? "Deleting" : "Delete"}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={isDeleting}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ file }: { file: PmsFileManagerFile }) {
  if (file.is_deleted) {
    return <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-red-700">Deleted</span>;
  }
  if (file.active_months.length === 0) {
    return <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">Superseded</span>;
  }
  return <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">Active</span>;
}

function formatMonths(months: string[]) {
  if (months.length === 0) return "No parsed months";
  return months.map((month) => formatMonth(month)).join(", ");
}

function formatMonth(month: string) {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
