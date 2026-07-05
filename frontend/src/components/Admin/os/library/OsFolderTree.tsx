import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { MouseEvent } from "react";
import {
  ChevronRight,
  Folder,
  FolderPlus,
  Inbox,
  Trash2,
} from "lucide-react";
import type {
  OsDocumentListItem,
  OsFolderNode,
  OsUpdateMetaPatch,
} from "../../../../api/admin-os";
import { useConfirm } from "../../../ui/ConfirmModal";
import {
  useCreateOsFolder,
  useDeleteOsFolder,
} from "../../../../hooks/queries/useAdminOsFolders";
import {
  OsDocumentDragChip,
  OsDraggableDocumentRow,
} from "./OsDraggableDocumentRow";
import { useOsLibraryDndSensors } from "./useOsLibraryDndSensors";
import {
  mapOsDragToMetaPatch,
  osFolderDropId,
  OS_DND_DOC_PREFIX,
  OS_DRAG_CLICK_SUPPRESS_MS,
} from "./osLibraryDnd.utils";

/**
 * Folders view (P3 T2): expandable folder tree on the left (every node is a
 * droppable — dropping a row PATCHes meta folder_id; "All documents" clears
 * it), the selected folder's rows on the right. Folder create + leaf delete
 * live here; rename stays API-only until a later pass.
 */

const TREE_INDENT_PX = 14;

function OsFolderNodeRow({
  node,
  depth,
  selectedFolderId,
  onSelectFolder,
  onDeleteFolder,
}: {
  node: OsFolderNode;
  depth: number;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string) => void;
  onDeleteFolder: (node: OsFolderNode) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(depth === 0);
  const { isOver, setNodeRef } = useDroppable({ id: osFolderDropId(node.id) });
  const isSelected = selectedFolderId === node.id;
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        ref={setNodeRef}
        className={`group flex items-center gap-1 rounded-[9px] px-1.5 py-1.5 transition-colors duration-150 ${
          isOver
            ? "bg-accent-soft"
            : isSelected
              ? "bg-accent-soft/70"
              : "hover:bg-gray-100/70"
        }`}
        style={{ paddingLeft: `${6 + depth * TREE_INDENT_PX}px` }}
      >
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-transform duration-150 ${
            hasChildren ? "" : "invisible"
          } ${isExpanded ? "rotate-90" : ""}`}
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => onSelectFolder(node.id)}
          className={`flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] ${
            isSelected ? "font-semibold text-alloro-orange" : "text-gray-700"
          }`}
        >
          <Folder className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{node.name}</span>
        </button>
        <span className="font-mono text-[11px] tabular-nums text-gray-300">
          {node.document_count}
        </span>
        {!hasChildren && (
          <button
            type="button"
            onClick={() => onDeleteFolder(node)}
            aria-label={`Delete folder ${node.name}`}
            className="ml-0.5 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-gray-300 transition-colors duration-150 hover:text-alloro-danger group-hover:flex"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>
      {hasChildren && isExpanded && (
        <ul>
          {node.children.map((child) => (
            <OsFolderNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function OsRootDropNode({
  isSelected,
  totalCount,
  onSelect,
}: {
  isSelected: boolean;
  totalCount: number;
  onSelect: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: osFolderDropId(null) });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-1.5 rounded-[9px] px-1.5 py-1.5 transition-colors duration-150 ${
        isOver
          ? "bg-accent-soft"
          : isSelected
            ? "bg-accent-soft/70"
            : "hover:bg-gray-100/70"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`flex min-w-0 flex-1 items-center gap-1.5 pl-6 text-left text-[13px] ${
          isSelected ? "font-semibold text-alloro-orange" : "text-gray-700"
        }`}
      >
        <Inbox className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
        All documents
      </button>
      <span className="font-mono text-[11px] tabular-nums text-gray-300">
        {totalCount}
      </span>
    </div>
  );
}

function collectFolderIds(nodes: OsFolderNode[], into: Set<string>): Set<string> {
  nodes.forEach((node) => {
    into.add(node.id);
    collectFolderIds(node.children, into);
  });
  return into;
}

function OsFolderSidebar({
  folderTree,
  totalCount,
  selectedFolderId,
  onSelectFolder,
  isCreating,
  onToggleCreating,
  newFolderName,
  onNewFolderNameChange,
  onCreateFolder,
  onDeleteFolder,
}: {
  folderTree: OsFolderNode[];
  totalCount: number;
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  isCreating: boolean;
  onToggleCreating: () => void;
  newFolderName: string;
  onNewFolderNameChange: (name: string) => void;
  onCreateFolder: () => void;
  onDeleteFolder: (node: OsFolderNode) => void;
}) {
  return (
    <aside>
      <div className="flex items-center justify-between gap-2 pb-2.5">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-gray-400">
          Folders
        </p>
        <button
          type="button"
          onClick={onToggleCreating}
          aria-label="New folder"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-150 ${
            isCreating
              ? "border-alloro-orange bg-accent-soft text-alloro-orange"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800"
          }`}
        >
          <FolderPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
          New folder
        </button>
      </div>
      {isCreating && (
        <input
          autoFocus
          value={newFolderName}
          onChange={(event) => onNewFolderNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onCreateFolder();
            if (event.key === "Escape") onToggleCreating();
          }}
          placeholder={
            selectedFolderId ? "New folder inside selection" : "New root folder"
          }
          aria-label="New folder name"
          className="mb-2 w-full rounded-lg border border-line-medium bg-alloro-surface px-2.5 py-1.5 text-[13px] text-gray-800 outline-none transition-colors duration-150 focus:border-alloro-orange"
        />
      )}
      <OsRootDropNode
        isSelected={selectedFolderId === null}
        totalCount={totalCount}
        onSelect={() => onSelectFolder(null)}
      />
      <ul className="mt-0.5 space-y-0.5">
        {folderTree.map((node) => (
          <OsFolderNodeRow
            key={node.id}
            node={node}
            depth={0}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            onDeleteFolder={onDeleteFolder}
          />
        ))}
      </ul>
      {folderTree.length === 0 && (
        <p className="mt-2 border-t border-line-soft pt-3 text-xs text-gray-400">
          No folders yet — create one to organize the library.
        </p>
      )}
    </aside>
  );
}

function OsFolderDocumentsPane({
  title,
  documents,
  onLinkClick,
}: {
  title: string;
  documents: OsDocumentListItem[];
  onLinkClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <section className="min-w-0">
      <header className="flex items-baseline justify-between pb-1">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-gray-400">
          {title}
        </h3>
        <span className="font-mono text-[11px] tabular-nums text-gray-300">
          {documents.length}
        </span>
      </header>
      {documents.map((doc) => (
        <OsDraggableDocumentRow key={doc.id} doc={doc} onLinkClick={onLinkClick} />
      ))}
      {documents.length === 0 && (
        <p className="border-t border-line-soft py-8 text-center text-sm text-gray-400">
          No documents in this folder — drag rows onto a folder to move them.
        </p>
      )}
    </section>
  );
}

export function OsFolderTree({
  documents,
  folderTree,
  onMoveDocument,
}: {
  documents: OsDocumentListItem[];
  folderTree: OsFolderNode[];
  onMoveDocument: (documentId: string, patch: OsUpdateMetaPatch) => void;
}) {
  const sensors = useOsLibraryDndSensors();
  const confirm = useConfirm();
  const createFolder = useCreateOsFolder();
  const deleteFolder = useDeleteOsFolder();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [activeDoc, setActiveDoc] = useState<OsDocumentListItem | null>(null);
  const lastDragEndAtRef = useRef(0);

  const knownFolderIds = useMemo(
    () => collectFolderIds(folderTree, new Set<string>()),
    [folderTree],
  );
  const effectiveSelectedId =
    selectedFolderId && knownFolderIds.has(selectedFolderId)
      ? selectedFolderId
      : null;

  const visibleDocuments = useMemo(
    () =>
      effectiveSelectedId === null
        ? documents
        : documents.filter((doc) => doc.folder_id === effectiveSelectedId),
    [documents, effectiveSelectedId],
  );

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name || createFolder.isPending) return;
    createFolder.mutate(
      { name, parent_id: effectiveSelectedId },
      {
        onSuccess: () => {
          setNewFolderName("");
          setIsCreating(false);
        },
      },
    );
  };

  const handleDeleteFolder = async (node: OsFolderNode) => {
    const confirmed = await confirm({
      title: `Delete "${node.name}"?`,
      message:
        node.document_count > 0
          ? `Its ${node.document_count} document${
              node.document_count === 1 ? "" : "s"
            } will move to the root.`
          : "The folder is empty.",
      confirmLabel: "Delete folder",
      variant: "danger",
    });
    if (!confirmed) return;
    if (effectiveSelectedId === node.id) setSelectedFolderId(null);
    deleteFolder.mutate(node.id);
  };

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

  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (Date.now() - lastDragEndAtRef.current < OS_DRAG_CLICK_SUPPRESS_MS) {
      event.preventDefault();
    }
  };

  const selectedName =
    effectiveSelectedId === null
      ? "All documents"
      : (findFolderName(folderTree, effectiveSelectedId) ?? "Folder");

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDoc(null)}
    >
      <div className="grid gap-8 pt-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <OsFolderSidebar
          folderTree={folderTree}
          totalCount={documents.length}
          selectedFolderId={effectiveSelectedId}
          onSelectFolder={setSelectedFolderId}
          isCreating={isCreating}
          onToggleCreating={() => setIsCreating((v) => !v)}
          newFolderName={newFolderName}
          onNewFolderNameChange={setNewFolderName}
          onCreateFolder={handleCreateFolder}
          onDeleteFolder={(target) => void handleDeleteFolder(target)}
        />

        <OsFolderDocumentsPane
          title={selectedName}
          documents={visibleDocuments}
          onLinkClick={handleLinkClick}
        />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeDoc && <OsDocumentDragChip title={activeDoc.title} />}
      </DragOverlay>
    </DndContext>
  );
}

function findFolderName(
  nodes: OsFolderNode[],
  folderId: string,
): string | null {
  for (const node of nodes) {
    if (node.id === folderId) return node.name;
    const nested = findFolderName(node.children, folderId);
    if (nested) return nested;
  }
  return null;
}
