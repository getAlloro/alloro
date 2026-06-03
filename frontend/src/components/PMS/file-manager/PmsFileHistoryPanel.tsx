import { Clock3, History } from "lucide-react";
import type { PmsFileManagerFileDetail, PmsFileManagerEvent } from "../../../api/pms";

export type PmsFileHistoryPanelProps = {
  file: PmsFileManagerFileDetail | null;
  isLoading: boolean;
  onClose: () => void;
};

export function PmsFileHistoryPanel({
  file,
  isLoading,
  onClose,
}: PmsFileHistoryPanelProps) {
  if (!file && !isLoading) return null;

  return (
    <section className="rounded-[14px] border border-line-soft bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-alloro-orange">
            Edit History
          </p>
          <h3 className="mt-1 font-display text-xl font-semibold text-alloro-navy">
            {file?.original_file_name ?? "PMS file"}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-line-soft px-3 py-2 text-xs font-black uppercase tracking-widest text-alloro-navy transition hover:border-alloro-orange/50"
        >
          Close
        </button>
      </div>

      {isLoading ? (
        <div className="mt-5 space-y-3">
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : file?.events.length ? (
        <div className="mt-5 space-y-3">
          {file.events.map((event) => (
            <article
              key={event.id}
              className="rounded-xl border border-line-soft bg-slate-50/80 p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[color:var(--color-pm-text-secondary)]">
                <History className="h-3.5 w-3.5 text-alloro-orange" />
                <span>{event.actor_name ?? event.actor_email ?? "System"}</span>
                <Clock3 className="h-3.5 w-3.5" />
                <span>{formatDate(event.created_at)}</span>
              </div>
              <p className="mt-2 text-sm font-black text-alloro-navy">
                {formatEventType(event.event_type)}
              </p>
              <p className="mt-1 text-sm font-medium leading-6 text-[color:var(--color-pm-text-secondary)]">
                {describeEvent(event)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-line-soft p-5 text-sm font-semibold text-[color:var(--color-pm-text-secondary)]">
          No edit history has been recorded for this file yet.
        </p>
      )}
    </section>
  );
}

function describeEvent(event: PmsFileManagerEvent) {
  const changes = Array.isArray(event.metadata?.changes)
    ? (event.metadata.changes as Array<{ month?: string; field?: string }>)
    : [];

  if (changes.length > 0) {
    const months = [...new Set(changes.map((change) => change.month).filter(Boolean))];
    const fields = [...new Set(changes.map((change) => change.field).filter(Boolean))];
    return `${changes.length} field change${changes.length === 1 ? "" : "s"} across ${formatList(months)}: ${formatList(fields.map(formatField))}.`;
  }

  const months = Array.isArray(event.metadata?.months)
    ? (event.metadata.months as string[])
    : [];
  if (months.length > 0) {
    return `Months affected: ${formatList(months.map(formatMonth))}.`;
  }

  if (typeof event.metadata?.reason === "string" && event.metadata.reason) {
    return event.metadata.reason;
  }

  return "No additional details recorded.";
}

function formatEventType(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown time";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatField(value: string | undefined) {
  return (value ?? "unknown field").replaceAll("_", " ");
}

function formatMonth(month: string) {
  const parsed = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return month;
  return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatList(values: Array<string | undefined>) {
  const filtered = values.filter((value): value is string => Boolean(value));
  return filtered.length > 0 ? filtered.join(", ") : "unknown";
}
