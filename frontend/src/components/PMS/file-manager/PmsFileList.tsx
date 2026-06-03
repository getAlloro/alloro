import {
  Download,
  Eye,
  FileSpreadsheet,
  History,
  Pencil,
  Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import type { PmsFileManagerFile } from "../../../api/pms";

export type PmsFileListProps = {
  files: PmsFileManagerFile[];
  selectedMonth: string | null;
  canManage: boolean;
  isProcessing: boolean;
  pendingDeleteId: number | null;
  onEdit: (jobId: number) => void;
  onViewOriginal: (jobId: number) => void;
  onDownload: (jobId: number) => void;
  onHistory: (jobId: number) => void;
  onAskDelete: (jobId: number) => void;
  onConfirmDelete: (jobId: number) => void;
  onCancelDelete: () => void;
};

export function PmsFileList({
  files,
  selectedMonth,
  canManage,
  isProcessing,
  pendingDeleteId,
  onEdit,
  onViewOriginal,
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
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-alloro-orange" />
                  <h3 className="truncate text-sm font-black text-alloro-navy">
                    {file.original_file_name ?? `PMS job #${file.id}`}
                  </h3>
                  <StatusPill file={file} />
                </div>
                <p className="mt-2 text-xs font-semibold text-[color:var(--color-pm-text-secondary)]">
                  {formatDate(file.timestamp)} by{" "}
                  {file.uploaded_by_name ?? file.uploaded_by_email ?? "Unknown"}
                  {file.original_file_size_bytes
                    ? ` · ${formatFileSize(file.original_file_size_bytes)}`
                    : ""}
                </p>
                <p className="mt-1.5 text-xs font-bold text-alloro-navy">
                  {formatMonths(file.months)}
                </p>
                {file.superseded_months.length > 0 && !isDeleted && (
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-amber-700">
                    Superseded: {formatMonths(file.superseded_months)}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <IconButton label="Edit current data" disabled={!canMutate} onClick={() => onEdit(file.id)}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton label="View original parse" onClick={() => onViewOriginal(file.id)}>
                  <Eye className="h-4 w-4" />
                </IconButton>
                <IconButton label="View history" onClick={() => onHistory(file.id)}>
                  <History className="h-4 w-4" />
                </IconButton>
                <IconButton label="Download original file" disabled={!file.has_original_file} onClick={() => onDownload(file.id)}>
                  <Download className="h-4 w-4" />
                </IconButton>
                <div className="relative">
                  <IconButton label="Delete file" disabled={!canMutate} onClick={() => onAskDelete(file.id)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                  {isPendingDelete && (
                    <div className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-red-200 bg-white p-3 text-left shadow-xl">
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
                          className="rounded-lg bg-red-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:brightness-110"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={onCancelDelete}
                          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 transition hover:bg-red-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function IconButton({
  label,
  disabled = false,
  children,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line-soft bg-white text-alloro-navy transition-all hover:scale-[1.02] hover:border-alloro-orange/50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
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

function formatFileSize(value: number | string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
