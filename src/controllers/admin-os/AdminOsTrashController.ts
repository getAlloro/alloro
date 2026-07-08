import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OsTrashService } from "./feature-services/OsTrashService";
import { ok, handleOsError } from "./feature-utils/osResponses";
import { osActorId } from "./feature-utils/osRequestParams";
import {
  buildOsPaginationMeta,
  parseOsPagination,
} from "./feature-utils/osPagination";

/**
 * Admin OS — trash: paginated archived list, restore (→ processing +
 * re-ingest), queued purge (plans/07042026-alloro-os-admin-port P2 T3).
 * Thin orchestration only (§7.3). Archiving itself is
 * DELETE /documents/:id on AdminOsDocumentsController.
 */
export class AdminOsTrashController {
  /** GET /api/admin/os/trash */
  static async list(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { page, limit, offset } = parseOsPagination(
        req.query.page,
        req.query.limit
      );
      const { documents, total } = await OsTrashService.listTrash({
        limit,
        offset,
      });
      return ok(res, {
        documents,
        pagination: buildOsPaginationMeta(total, page, limit),
      });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** POST /api/admin/os/trash/:id/restore */
  static async restore(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const document = await OsTrashService.restoreFromTrash(
        req.params.id,
        osActorId(req)
      );
      return ok(res, { document });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** DELETE /api/admin/os/trash/:id — 202, purge job queued. */
  static async purge(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const result = await OsTrashService.requestPurge(
        req.params.id,
        osActorId(req)
      );
      return ok(res, result, 202);
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
