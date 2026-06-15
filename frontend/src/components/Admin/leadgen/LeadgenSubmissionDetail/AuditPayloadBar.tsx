import { FileText, ChevronUp } from "lucide-react";
import type { SubmissionDetail } from "../../../../types/leadgen";

/**
 * Dark sticky bottom bar — one-line tag for the audit payload. Click flips
 * a slide-up deck (`AuditPayloadSheet`) that renders the raw JSON in a
 * dark-mode viewer with light syntax highlighting. Replaces the old
 * cluttered score-pluck snapshot — power users want the raw data, casual
 * admins don't need a dashboard here.
 */
export default function AuditPayloadBar({
  audit,
  onOpen,
}: {
  audit: NonNullable<SubmissionDetail["audit"]>;
  onOpen: () => void;
}) {
  const status = audit.status || "unknown";
  const statusColor =
    status === "completed"
      ? "text-emerald-300"
      : status === "failed"
        ? "text-red-300"
        : "text-amber-300";
  const retryCount = typeof audit.retry_count === "number" ? audit.retry_count : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="sticky bottom-0 -mx-6 mt-6 block w-[calc(100%+3rem)] bg-slate-900 text-white px-6 py-4 text-left shadow-[0_-8px_24px_rgba(15,23,42,0.2)] hover:bg-slate-800 active:bg-slate-900 transition-colors border-t border-slate-800"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Audit payload
            </span>
            <span className="text-sm text-white truncate">
              Status:{" "}
              <span className={`font-semibold ${statusColor}`}>{status}</span>
              <span className="text-slate-500 ml-2">
                · Retries: {retryCount}/3
              </span>
              <span className="text-slate-500 ml-2">— tap to view raw JSON</span>
            </span>
          </div>
        </div>
        <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
      </div>
    </button>
  );
}
