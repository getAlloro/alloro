/**
 * Folder tree for the OS Library: nested tree reads (with live document
 * counts), create, rename/move with a cycle guard, and delete (children block
 * it; documents fall back to root via the FK's ON DELETE SET NULL).
 */

import { IOsFolder, OsFolderModel } from "../../../models/OsFolderModel";
import { OsActivityModel } from "../../../models/OsActivityModel";
import { OsError } from "../feature-utils/OsError";

export interface OsFolderNode extends IOsFolder {
  document_count: number;
  children: OsFolderNode[];
}

export interface OsFolderTreeResult {
  tree: OsFolderNode[];
  folders: OsFolderNode[];
}

async function requireFolder(folderId: string): Promise<IOsFolder> {
  const folder = await OsFolderModel.findFolderById(folderId);
  if (!folder) {
    throw new OsError("OS_FOLDER_NOT_FOUND", "Folder not found.", { folderId });
  }
  return folder;
}

function buildTree(nodes: OsFolderNode[]): OsFolderNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const roots: OsFolderNode[] = [];
  for (const node of nodes) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node); // unknown parent is defensive — FK is SET NULL
    }
  }
  return roots;
}

export class OsFolderService {
  /** Flat list + nested tree in one call (both sorted by name via the model). */
  static async getFolderTree(): Promise<OsFolderTreeResult> {
    const [folders, counts] = await Promise.all([
      OsFolderModel.listAll(),
      OsFolderModel.countDocumentsPerFolder(),
    ]);
    const nodes: OsFolderNode[] = folders.map((folder) => ({
      ...folder,
      document_count: counts.get(folder.id) ?? 0,
      children: [],
    }));
    return { tree: buildTree(nodes), folders: nodes };
  }

  static async createFolder(
    input: { name: string; parentId?: string | null },
    actorId: number
  ): Promise<IOsFolder> {
    const parentId = input.parentId ?? null;
    if (parentId) await requireFolder(parentId);
    const folder = await OsFolderModel.createFolder({
      name: input.name.trim(),
      parent_id: parentId,
      created_by: actorId,
    });
    await OsActivityModel.log({
      actor_id: actorId,
      action: "folder.created",
      target_type: "folder",
      target_id: folder.id,
    });
    return folder;
  }

  /**
   * Rename and/or move. Cycle guard: a folder cannot become its own parent,
   * and cannot move under any of its own descendants (i.e. the new parent's
   * ancestor chain must not contain the folder being moved).
   */
  static async updateFolder(
    folderId: string,
    patch: { name?: string; parentId?: string | null },
    actorId: number
  ): Promise<IOsFolder> {
    await requireFolder(folderId);

    const modelPatch: { name?: string; parent_id?: string | null } = {};
    if (patch.name !== undefined) modelPatch.name = patch.name.trim();
    if (patch.parentId !== undefined) {
      if (patch.parentId === folderId) {
        throw new OsError(
          "OS_FOLDER_CYCLE_CONFLICT",
          "A folder cannot be its own parent."
        );
      }
      if (patch.parentId !== null) {
        await requireFolder(patch.parentId);
        const ancestors = await OsFolderModel.listAncestorIds(patch.parentId);
        if (ancestors.includes(folderId)) {
          throw new OsError(
            "OS_FOLDER_CYCLE_CONFLICT",
            "A folder cannot be moved under one of its own sub-folders.",
            { folderId, parentId: patch.parentId }
          );
        }
      }
      modelPatch.parent_id = patch.parentId;
    }

    if (Object.keys(modelPatch).length) {
      await OsFolderModel.updateFolder(folderId, modelPatch);
      await OsActivityModel.log({
        actor_id: actorId,
        action: "folder.updated",
        target_type: "folder",
        target_id: folderId,
        metadata: { fields: Object.keys(modelPatch) },
      });
    }
    return requireFolder(folderId);
  }

  /** Delete a leaf folder; its documents move to root (FK SET NULL). */
  static async deleteFolder(
    folderId: string,
    actorId: number
  ): Promise<{ deleted: true; documents_moved_to_root: number }> {
    await requireFolder(folderId);
    if (await OsFolderModel.hasChildren(folderId)) {
      throw new OsError(
        "OS_FOLDER_HAS_CHILDREN_CONFLICT",
        "Remove or move the sub-folders first.",
        { folderId }
      );
    }
    const documentsMoved = await OsFolderModel.countDocumentsInFolder(folderId);
    await OsFolderModel.deleteFolder(folderId);
    await OsActivityModel.log({
      actor_id: actorId,
      action: "folder.deleted",
      target_type: "folder",
      target_id: folderId,
      metadata: { documents_moved_to_root: documentsMoved },
    });
    return { deleted: true, documents_moved_to_root: documentsMoved };
  }
}
