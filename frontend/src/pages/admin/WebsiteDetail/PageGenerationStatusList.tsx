import { Link } from "react-router-dom";
import { Loader2, FileText, Check, X } from "lucide-react";
import type { PageGenerationStatusItem } from "../../../api/websites";
import { getGenStatusStyles } from "../websiteDetail.utils";

export function PageGenerationStatusList({
  id,
  isCreatingAll,
  gbpData,
  pageGenStatuses,
  handleCancelGeneration,
}: {
  id: string | undefined;
  isCreatingAll: boolean;
  gbpData: Record<string, string | number | null> | null;
  pageGenStatuses: PageGenerationStatusItem[];
  handleCancelGeneration: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-alloro-orange animate-spin" />
          <span className="text-sm font-medium text-gray-900">
            {isCreatingAll ? "Creating pages…" : "Pages in progress"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {gbpData?.name && (
            <span className="text-xs text-gray-500 truncate max-w-[200px]">
              {String(gbpData.name)}
            </span>
          )}
          {pageGenStatuses.some((p) => p.generation_status === "queued" || p.generation_status === "generating") && (
            <button
              onClick={handleCancelGeneration}
              className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1 rounded border border-red-200 hover:bg-red-50 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Project-level progress bar */}
      {pageGenStatuses.length > 0 && (() => {
        const readyCount = pageGenStatuses.filter((p) => p.generation_status === "ready").length;
        const totalCount = pageGenStatuses.length;
        const pct = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0;
        return (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{readyCount} of {totalCount} pages complete</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-alloro-orange rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })()}

      {pageGenStatuses.length > 0 ? (
        <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 overflow-hidden">
          {pageGenStatuses.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 bg-white">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-700 truncate">
                  {p.template_page_name || p.path}
                </span>
                <span className="text-xs text-gray-400">{p.path}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(p.generation_status === "generating" || p.generation_status === "queued") && (
                  <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
                )}
                {p.generation_status === "ready" && (
                  <Check className="h-3.5 w-3.5 text-green-500 stroke-[3]" />
                )}
                {p.generation_status === "cancelled" && (
                  <X className="h-3.5 w-3.5 text-gray-500 stroke-[3]" />
                )}
                {/* Per-page component progress */}
                {p.generation_status === "generating" && p.generation_progress && (
                  <span className="text-[10px] text-amber-600 font-medium">
                    {p.generation_progress.current_component} ({p.generation_progress.completed}/{p.generation_progress.total})
                  </span>
                )}
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getGenStatusStyles(p.generation_status)}`}>
                  {p.generation_status}
                </span>
                {(p.generation_status === "ready" || p.generation_status === "generating") && (
                  <Link
                    to={`/admin/websites/${id}/pages/${p.id}/edit`}
                    className="text-xs text-alloro-orange hover:underline font-medium"
                  >
                    {p.generation_status === "generating" ? "Preview" : "View"}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">Waiting for page generation status…</p>
      )}
    </div>
  );
}
