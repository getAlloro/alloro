import { useDraggable } from "@dnd-kit/core";
import type { MouseEvent } from "react";
import type { OsDocumentListItem } from "../../../../api/admin-os";
import { OsDocumentRow } from "./OsDocumentRow";
import { osDocDragId } from "./osLibraryDnd.utils";

/**
 * Draggable wrapper + DragOverlay chip shared by the grouped and folders
 * views (P3 T2). Sensors live in useOsLibraryDndSensors, timings in
 * osLibraryDnd.utils (fast-refresh: components only in this file).
 */

export function OsDraggableDocumentRow({
  doc,
  onLinkClick,
}: {
  doc: OsDocumentListItem;
  onLinkClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: osDocDragId(doc.id),
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      style={{ touchAction: "none" }}
      className={`cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <OsDocumentRow doc={doc} onLinkClick={onLinkClick} draggable />
    </div>
  );
}

export function OsDocumentDragChip({ title }: { title: string }) {
  return (
    <div className="max-w-xs truncate rounded-[9px] border border-line-medium bg-alloro-surface px-3 py-2 font-display text-sm font-semibold text-alloro-textDark shadow-lg">
      {title || "Untitled"}
    </div>
  );
}
