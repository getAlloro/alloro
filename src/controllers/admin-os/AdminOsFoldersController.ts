import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OsFolderService } from "./feature-services/OsFolderService";
import { ok, handleOsError } from "./feature-utils/osResponses";
import { osActorId } from "./feature-utils/osRequestParams";

/**
 * Admin OS — folders: nested tree with document counts, create, rename/move
 * (cycle-guarded), delete (plans/07042026-alloro-os-admin-port P2 T3).
 * Thin orchestration only (§7.3).
 */
export class AdminOsFoldersController {
  /** GET /api/admin/os/folders — nested tree + flat list. */
  static async tree(_req: AuthRequest, res: Response): Promise<Response> {
    try {
      const result = await OsFolderService.getFolderTree();
      return ok(res, result);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** POST /api/admin/os/folders */
  static async create(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const folder = await OsFolderService.createFolder(
        { name: String(req.body.name), parentId: req.body.parent_id ?? null },
        osActorId(req)
      );
      return ok(res, { folder }, 201);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** PATCH /api/admin/os/folders/:id — rename and/or move. */
  static async update(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const folder = await OsFolderService.updateFolder(
        req.params.id,
        { name: req.body.name, parentId: req.body.parent_id },
        osActorId(req)
      );
      return ok(res, { folder });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** DELETE /api/admin/os/folders/:id — leaf only; documents move to root. */
  static async remove(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const result = await OsFolderService.deleteFolder(
        req.params.id,
        osActorId(req)
      );
      return ok(res, result);
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
