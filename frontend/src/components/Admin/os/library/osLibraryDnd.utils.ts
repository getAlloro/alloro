import type { OsUpdateMetaPatch } from "../../../../api/admin-os";

/**
 * Drag-and-drop id scheme + drop→mutation mapping for the Library views
 * (plans/07042026-alloro-os-admin-port P3 T2). Pure functions — the views
 * feed @dnd-kit ids through mapOsDragToMetaPatch and fire the returned
 * PATCH /documents/:id/meta payload. Unit-tested (osLibraryDnd.utils.test.ts).
 */

export const OS_DND_DOC_PREFIX = "doc:";
/** Clicks landing this soon after a drop are the drag's tail — suppress them. */
export const OS_DRAG_CLICK_SUPPRESS_MS = 250;
export const OS_DND_CATEGORY_PREFIX = "category:";
export const OS_DND_FOLDER_PREFIX = "folder:";
/** Droppable id for the "Uncategorized" group (clears category). */
export const OS_DND_UNCATEGORIZED_ID = `${OS_DND_CATEGORY_PREFIX}__none__`;
/** Droppable id for the root "All documents" node (clears folder). */
export const OS_DND_ROOT_FOLDER_ID = `${OS_DND_FOLDER_PREFIX}__root__`;

export function osDocDragId(documentId: string): string {
  return `${OS_DND_DOC_PREFIX}${documentId}`;
}

export function osCategoryDropId(category: string | null): string {
  return category === null
    ? OS_DND_UNCATEGORIZED_ID
    : `${OS_DND_CATEGORY_PREFIX}${category}`;
}

export function osFolderDropId(folderId: string | null): string {
  return folderId === null
    ? OS_DND_ROOT_FOLDER_ID
    : `${OS_DND_FOLDER_PREFIX}${folderId}`;
}

export type OsDndDocumentSnapshot = {
  id: string;
  category: string | null;
  folder_id: string | null;
};

export type OsDndMove = {
  documentId: string;
  patch: OsUpdateMetaPatch;
} | null;

/**
 * Map a drag-end (active draggable id + droppable id under the pointer) to
 * the meta PATCH it implies. Returns null for no-ops: unknown ids, drops
 * outside any zone, or drops onto the document's current group/folder.
 */
export function mapOsDragToMetaPatch(args: {
  activeId: string;
  overId: string | null;
  documents: OsDndDocumentSnapshot[];
}): OsDndMove {
  const { activeId, overId, documents } = args;
  if (!overId || !activeId.startsWith(OS_DND_DOC_PREFIX)) return null;

  const documentId = activeId.slice(OS_DND_DOC_PREFIX.length);
  const document = documents.find((doc) => doc.id === documentId);
  if (!document) return null;

  if (overId.startsWith(OS_DND_CATEGORY_PREFIX)) {
    const nextCategory =
      overId === OS_DND_UNCATEGORIZED_ID
        ? null
        : overId.slice(OS_DND_CATEGORY_PREFIX.length);
    if (document.category === nextCategory) return null;
    return { documentId, patch: { category: nextCategory } };
  }

  if (overId.startsWith(OS_DND_FOLDER_PREFIX)) {
    const nextFolderId =
      overId === OS_DND_ROOT_FOLDER_ID
        ? null
        : overId.slice(OS_DND_FOLDER_PREFIX.length);
    if (document.folder_id === nextFolderId) return null;
    return { documentId, patch: { folder_id: nextFolderId } };
  }

  return null;
}
