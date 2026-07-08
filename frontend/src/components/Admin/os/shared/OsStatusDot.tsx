import type { OsDocumentStatus } from "../../../../api/admin-os";

/**
 * Status dot + optional mono label (D13): indexed = green, processing = amber
 * pulse, failed = red, archived = muted. The label keeps the signal readable
 * without relying on color alone.
 */

const OS_STATUS_LABELS: Record<OsDocumentStatus, string> = {
  processing: "Processing",
  indexed: "Indexed",
  archived: "Archived",
  processing_failed: "Failed",
};

const OS_STATUS_DOTS: Record<OsDocumentStatus, string> = {
  processing: "bg-amber motion-safe:animate-pulse",
  indexed: "bg-alloro-success",
  archived: "bg-gray-300",
  processing_failed: "bg-alloro-danger",
};

const OS_STATUS_TEXT: Record<OsDocumentStatus, string> = {
  processing: "text-gray-500",
  indexed: "text-gray-500",
  archived: "text-gray-400",
  processing_failed: "text-alloro-danger",
};

export function OsStatusDot({
  status,
  withLabel = false,
}: {
  status: OsDocumentStatus;
  withLabel?: boolean;
}) {
  const dot = (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${OS_STATUS_DOTS[status]}`}
      aria-hidden="true"
    />
  );
  if (!withLabel) {
    return (
      <span title={OS_STATUS_LABELS[status]} className="inline-flex">
        {dot}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums ${OS_STATUS_TEXT[status]}`}
    >
      {dot}
      {OS_STATUS_LABELS[status]}
    </span>
  );
}
