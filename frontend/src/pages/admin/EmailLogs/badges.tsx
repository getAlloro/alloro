import { OPENED_TOOLTIP, STATUS_STYLE } from "./constants";

/**
 * Email Logs — status + category pills (plans/07082026-email-logs-ui-polish).
 * Shared by the list table and the detail modal.
 */

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] ?? "bg-gray-100 text-gray-700";
  const isOpened = status === "opened";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}
      title={isOpened ? OPENED_TOOLTIP : undefined}
    >
      {status}
      {isOpened ? " *" : ""}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-black/10 bg-alloro-bg px-2 py-0.5 text-xs font-medium text-alloro-textDark/70">
      {category}
    </span>
  );
}
