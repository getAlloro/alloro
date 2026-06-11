import { Clock, Loader2, Trash2 } from "lucide-react";
import type { AiSeoAuditRun } from "../../../api/aiSeoAudit";
import {
  formatDate,
  formatLabel,
  formatScore,
  getRunStatusClass,
} from "./aiSeoAuditFormatters";

const ACTIVE_STATUSES = ["queued", "running"];

export type AiSeoAuditRunListProps = {
  runs: AiSeoAuditRun[];
  selectedRunId: string | null;
  isLoading: boolean;
  onSelect: (runId: string) => void;
  onDelete: (runId: string) => void;
  onClearAll: () => void;
  isClearing?: boolean;
  deletingRunId?: string | null;
};

export function AiSeoAuditRunList({
  runs,
  selectedRunId,
  isLoading,
  onSelect,
  onDelete,
  onClearAll,
  isClearing = false,
  deletingRunId = null,
}: AiSeoAuditRunListProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading runs
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-600">
        No audit runs yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-black uppercase tracking-wide text-gray-400">
          {runs.length} run{runs.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={onClearAll}
          disabled={isClearing}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isClearing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Clear all
        </button>
      </div>

      {runs.map((run) => {
        const isSelected = selectedRunId === run.id;
        const isActive = ACTIVE_STATUSES.includes(run.status);
        const isDeleting = deletingRunId === run.id;
        return (
          <div key={run.id} className="flex items-stretch gap-1">
            <button
              type="button"
              onClick={() => onSelect(run.id)}
              className={`min-w-0 flex-1 rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-alloro-orange/40 ${
                isSelected
                  ? "border-alloro-orange bg-alloro-orange/5 shadow-sm"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {run.requested_url || formatLabel(run.scope)}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(run.completed_at || run.created_at)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {isActive ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  ) : (
                    <p className="text-xl font-black tabular-nums text-alloro-navy">
                      {formatScore(run.score)}
                    </p>
                  )}
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${getRunStatusClass(run.status)}`}
                  >
                    {run.status}
                  </span>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onDelete(run.id)}
              disabled={isDeleting}
              aria-label="Delete run"
              className="flex w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
