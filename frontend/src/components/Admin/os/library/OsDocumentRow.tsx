import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { MouseEvent } from "react";
import type { OsDocumentListItem } from "../../../../api/admin-os";
import { OsStatusDot } from "../shared/OsStatusDot";
import { formatOsRelativeTime, osOwnerLabel } from "../shared/osFormat";

/**
 * One Library entry — a hairline-divided row, not a card (D13): status dot,
 * Spectral title, quiet category pill, then a mono meta cluster (relative
 * time · owner). Wrapped by the dnd views; plain in the list view.
 */
export function OsDocumentRow({
  doc,
  onLinkClick,
}: {
  doc: OsDocumentListItem;
  onLinkClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const isArchived = doc.status === "archived";
  const ownerLabel = osOwnerLabel(doc.owner);

  return (
    <Link
      to={`/admin/os/doc/${doc.id}`}
      onClick={onLinkClick}
      className="group -mx-2 flex items-center justify-between gap-3 border-t border-line-soft px-2 py-3.5 transition-colors duration-150 hover:bg-accent-soft/60"
    >
      <div className="flex min-w-0 items-center gap-2.5">
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
