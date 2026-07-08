import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { MouseEvent } from "react";
import type {
  OsDocumentListItem,
  OsUpdateMetaPatch,
} from "../../../../api/admin-os";
import {
  OsDocumentDragChip,
  OsDraggableDocumentRow,
} from "./OsDraggableDocumentRow";
import { useOsLibraryDndSensors } from "./useOsLibraryDndSensors";
import {
  mapOsDragToMetaPatch,
  osCategoryDropId,
  OS_DND_DOC_PREFIX,
  OS_DRAG_CLICK_SUPPRESS_MS,
} from "./osLibraryDnd.utils";

/**
 * Grouped-by-category view (P3 T2): every category is a droppable section of
 * hairline rows; dragging a row between sections PATCHes its meta category.
 * "Uncategorized" is always present as the clear-category target.
 */

const OS_UNCATEGORIZED_LABEL = "Uncategorized";

type OsCategoryGroup = {
  /** null = the Uncategorized group. */
  category: string | null;
  label: string;
  documents: OsDocumentListItem[];
};

function buildGroups(
  documents: OsDocumentListItem[],
  categoryOptions: string[],
): OsCategoryGroup[] {
  const byCategory = new Map<string, OsDocumentListItem[]>();
  const uncategorized: OsDocumentListItem[] = [];
  documents.forEach((doc) => {
    if (!doc.category) {
      uncategorized.push(doc);
      return;
    }
    const bucket = byCategory.get(doc.category) ?? [];
    bucket.push(doc);
    byCategory.set(doc.category, bucket);
  });
  // Known-but-empty categories still render, so a doc can be dragged into them.
  categoryOptions.forEach((category) => {
    if (!byCategory.has(category)) byCategory.set(category, []);
  });
  const named: OsCategoryGroup[] = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, docs]) => ({ category, label: category, documents: docs }));
  return [
    ...named,
    {
      category: null,
      label: OS_UNCATEGORIZED_LABEL,
      documents: uncategorized,
    },
  ];
}

function OsCategoryDropSection({
  group,
  onLinkClick,
}: {
  group: OsCategoryGroup;
  onLinkClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: osCategoryDropId(group.category),
  });
  return (
    <section
      ref={setNodeRef}
      className={`rounded-xl px-2 transition-colors duration-150 ${
        isOver ? "bg-accent-soft/70" : ""
      }`}
    >
      <header className="flex items-baseline justify-between pt-6 pb-1">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-gray-400">
          {group.label}
        </h3>
        <span className="font-mono text-[11px] tabular-nums text-gray-300">
          {group.documents.length}
        </span>
      </header>
      {group.documents.map((doc) => (
        <OsDraggableDocumentRow key={doc.id} doc={doc} onLinkClick={onLinkClick} />
      ))}
      {group.documents.length === 0 && (
        <p className="border-t border-line-soft py-4 text-xs text-gray-400">
          Drop a document here
        </p>
      )}
    </section>
  );
}

export function OsGroupedView({
  documents,
  categoryOptions,
  onMoveDocument,
}: {
  documents: OsDocumentListItem[];
  categoryOptions: string[];
  onMoveDocument: (documentId: string, patch: OsUpdateMetaPatch) => void;
}) {
  const sensors = useOsLibraryDndSensors();
  const [activeDoc, setActiveDoc] = useState<OsDocumentListItem | null>(null);
  const lastDragEndAtRef = useRef(0);

  const groups = useMemo(
    () => buildGroups(documents, categoryOptions),
    [documents, categoryOptions],
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (!id.startsWith(OS_DND_DOC_PREFIX)) return;
    const documentId = id.slice(OS_DND_DOC_PREFIX.length);
    setActiveDoc(documents.find((doc) => doc.id === documentId) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    lastDragEndAtRef.current = Date.now();
    setActiveDoc(null);
    const move = mapOsDragToMetaPatch({
      activeId: String(event.active.id),
      overId: event.over ? String(event.over.id) : null,
      documents,
    });
    if (move) onMoveDocument(move.documentId, move.patch);
  };

  // A drop can fire a click on the row link right after — swallow that tail.
  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (Date.now() - lastDragEndAtRef.current < OS_DRAG_CLICK_SUPPRESS_MS) {
      event.preventDefault();
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDoc(null)}
    >
      <div className="-mx-2">
        {groups.map((group) => (
          <OsCategoryDropSection
            key={group.category ?? "__uncategorized__"}
            group={group}
            onLinkClick={handleLinkClick}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDoc && <OsDocumentDragChip title={activeDoc.title} />}
      </DragOverlay>
    </DndContext>
  );
}
