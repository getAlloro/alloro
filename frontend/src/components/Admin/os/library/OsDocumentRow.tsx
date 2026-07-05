import { Link } from "react-router-dom";
import { ChevronRight, GripVertical, RotateCw } from "lucide-react";
import type { MouseEvent } from "react";
import type { OsDocumentListItem } from "../../../../api/admin-os";
import { useReindexOsDocument } from "../../../../hooks/queries/useAdminOsDocumentMutations";
import { OsStatusDot } from "../shared/OsStatusDot";
import { formatOsRelativeTime, osOwnerLabel } from "../shared/osFormat";

/** Row-level Reindex control shown only for a failed document. Prevents the
 *  wrapping Link from navigating so the click just re-queues ingest (P4 T5). */
function OsRowReindexButton({ documentId }: { documentId: string }) {
  const reindex = useReindexOsDocument(documentId);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        reindex.mutate();
      }}
      disabled={reindex.isPending}
      className="inline-flex items-center gap-1 rounded-md border border-alloro-danger/30 px-2 py-0.5 text-[11px] font-semibold text-alloro-danger transition-colors duration-150 hover:bg-danger-soft disabled:opacity-60"
    >
      <RotateCw
        className={`h-3 w-3 ${reindex.isPending ? "motion-safe:animate-spin" : ""}`}
        strokeWidth={1.75}
      />
      {reindex.isPending ? "Reindexing…" : "Reindex"}
    </button>
  );
}

/**
 * One Library entry — a hairline-divided row, not a card (D13): status dot,
 * Spectral title, quiet category pill, then a mono meta cluster (relative
 * time · owner). Failed documents get an inline Reindex control. Wrapped by the
 * dnd views; plain in the list view.
 */
export function OsDocumentRow({
  doc,
  onLinkClick,
  draggable = false,
}: {
  doc: OsDocumentListItem;
  onLinkClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  draggable?: boolean;
}) {
  const isArchived = doc.status === "archived";
  const isFailed = doc.status === "processing_failed";
  const ownerLabel = osOwnerLabel(doc.owner);

  return (
    <Link
      to={`/admin/os/doc/${doc.id}`}
      onClick={onLinkClick}
      className="group -mx-2 flex items-center justify-between gap-3 rounded-lg border-t border-line-soft px-2 py-3.5 transition-colors duration-150 hover:bg-accent-soft/60"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {draggable && (
          <GripVertical
            className="h-4 w-4 shrink-0 text-gray-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        )}
        <OsStatusDot status={doc.status} />
        <h3
          className={`min-w-0 truncate font-display text-[17px] font-semibold ${
            isArchived ? "text-gray-400" : "text-alloro-textDark"
          }`}
        >
          {doc.title || "Untitled"}
        </h3>
        {doc.category && (
          <span className="hidden shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-alloro-orange sm:inline">
            {doc.category}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {isFailed && <OsRowReindexButton documentId={doc.id} />}
        {ownerLabel && (
          <span className="hidden max-w-[140px] truncate font-mono text-[11px] text-gray-400 md:inline">
            {ownerLabel}
          </span>
        )}
        <span className="font-mono text-[11px] tabular-nums text-gray-400">
          {formatOsRelativeTime(doc.updated_at)}
        </span>
        <ChevronRight
          className="h-4 w-4 text-gray-300 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
