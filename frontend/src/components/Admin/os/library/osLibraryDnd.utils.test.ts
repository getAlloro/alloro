import { describe, expect, it } from "vitest";
import {
  mapOsDragToMetaPatch,
  osCategoryDropId,
  osDocDragId,
  osFolderDropId,
  OS_DND_ROOT_FOLDER_ID,
  OS_DND_UNCATEGORIZED_ID,
  type OsDndDocumentSnapshot,
} from "./osLibraryDnd.utils";

const documents: OsDndDocumentSnapshot[] = [
  { id: "doc-1", category: "Playbooks", folder_id: "folder-a" },
  { id: "doc-2", category: null, folder_id: null },
];

describe("mapOsDragToMetaPatch", () => {
  it("maps a category drop to a category meta patch", () => {
    expect(
      mapOsDragToMetaPatch({
        activeId: osDocDragId("doc-1"),
        overId: osCategoryDropId("SOPs"),
        documents,
      }),
    ).toEqual({ documentId: "doc-1", patch: { category: "SOPs" } });
  });

  it("maps the Uncategorized group to category: null", () => {
    expect(
      mapOsDragToMetaPatch({
        activeId: osDocDragId("doc-1"),
        overId: OS_DND_UNCATEGORIZED_ID,
        documents,
      }),
    ).toEqual({ documentId: "doc-1", patch: { category: null } });
  });

  it("maps a folder drop to a folder_id meta patch", () => {
    expect(
      mapOsDragToMetaPatch({
        activeId: osDocDragId("doc-2"),
        overId: osFolderDropId("folder-b"),
        documents,
      }),
    ).toEqual({ documentId: "doc-2", patch: { folder_id: "folder-b" } });
  });

  it("maps the root node to folder_id: null", () => {
    expect(
      mapOsDragToMetaPatch({
        activeId: osDocDragId("doc-1"),
        overId: OS_DND_ROOT_FOLDER_ID,
        documents,
      }),
    ).toEqual({ documentId: "doc-1", patch: { folder_id: null } });
  });

  it("returns null when dropped on the document's current category", () => {
    expect(
      mapOsDragToMetaPatch({
        activeId: osDocDragId("doc-1"),
        overId: osCategoryDropId("Playbooks"),
        documents,
      }),
    ).toBeNull();
  });

  it("returns null when dropped on the document's current folder", () => {
    expect(
      mapOsDragToMetaPatch({
        activeId: osDocDragId("doc-1"),
        overId: osFolderDropId("folder-a"),
        documents,
      }),
    ).toBeNull();
  });

  it("returns null when an unfoldered document is dropped on root", () => {
    expect(
      mapOsDragToMetaPatch({
        activeId: osDocDragId("doc-2"),
        overId: OS_DND_ROOT_FOLDER_ID,
        documents,
      }),
    ).toBeNull();
  });

  it("returns null when dropped outside any zone", () => {
    expect(
      mapOsDragToMetaPatch({
        activeId: osDocDragId("doc-1"),
        overId: null,
        documents,
      }),
    ).toBeNull();
  });

  it("returns null for unknown draggables and unknown documents", () => {
    expect(
      mapOsDragToMetaPatch({
        activeId: "folder:folder-a",
        overId: osCategoryDropId("SOPs"),
        documents,
      }),
    ).toBeNull();
    expect(
      mapOsDragToMetaPatch({
        activeId: osDocDragId("missing"),
        overId: osCategoryDropId("SOPs"),
        documents,
      }),
    ).toBeNull();
  });

  it("returns null for a non-category, non-folder droppable", () => {
    expect(
      mapOsDragToMetaPatch({
        activeId: osDocDragId("doc-1"),
        overId: "row:doc-2",
        documents,
      }),
    ).toBeNull();
  });
});
