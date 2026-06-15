import { Link } from "react-router-dom";
import { Check, Loader2, RefreshCw, Sparkles, Code, Pencil } from "lucide-react";
import type { LayoutsStatus } from "../../../api/websites";

export function LayoutsTab({
  id,
  layoutsStatus,
  onOpenLayoutsModal,
}: {
  id: string | undefined;
  layoutsStatus: LayoutsStatus | null;
  onOpenLayoutsModal: () => void;
}) {
  return (
    <>
      {/* Generate Layouts summary card — opens modal for inputs */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">Generate Layouts</h3>
              {layoutsStatus?.generated_at &&
                layoutsStatus?.status !== "generating" &&
                layoutsStatus?.status !== "queued" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                    <Check className="h-3 w-3" /> Ready
                  </span>
                )}
              {(layoutsStatus?.status === "generating" ||
                layoutsStatus?.status === "queued") && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <Loader2 className="h-3 w-3 animate-spin" /> Generating
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Wrapper, header, and footer — generated once, reused across pages.
            </p>
          </div>
          <button
            onClick={onOpenLayoutsModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            {layoutsStatus?.status === "generating" ||
            layoutsStatus?.status === "queued" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                View progress
              </>
            ) : layoutsStatus?.generated_at ? (
              <>
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate
              </>
            )}
          </button>
        </div>
      </div>

      {/* Existing per-layout editor links */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h3 className="text-lg font-semibold text-gray-900">Edit Layouts Directly</h3>
        <p className="text-xs text-gray-500 mt-1">
          Fine-tune wrapper, header, and footer manually.
        </p>
      </div>
      <div className="divide-y divide-gray-100">
        {(["wrapper", "header", "footer"] as const).map((field) => (
          <Link
            key={field}
            to={`/admin/websites/${id}/layout/${field}`}
            className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Code className="h-5 w-5 text-gray-400" />
              <div>
                <p className="font-medium text-gray-900 capitalize">
                  {field}
                </p>
                <p className="text-xs text-gray-500">
                  {field === "wrapper"
                    ? "HTML shell with {{slot}} placeholder"
                    : field === "header"
                      ? "Site header rendered on all pages"
                      : "Site footer rendered on all pages"}
                </p>
              </div>
            </div>
            <Pencil className="h-4 w-4 text-gray-400" />
          </Link>
        ))}
      </div>
      </div>
    </>
  );
}
