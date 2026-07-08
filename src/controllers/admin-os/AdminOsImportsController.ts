import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OsImportService } from "./feature-services/OsImportService";
import { OsDocumentImportModel } from "../../models/OsDocumentImportModel";
import { ok, handleOsError } from "./feature-utils/osResponses";
import { osActorId } from "./feature-utils/osRequestParams";
import { OsError } from "./feature-utils/OsError";

/**
 * Admin OS — file imports (plans/07042026-alloro-os-admin-port P6 T1; §2.4
 * split by resource). Thin orchestration only (§7.3): parse the multipart
 * request, call OsImportService, answer with the §8.1 envelope. Size/count
 * caps and the 413 mapping live in the route's multer error handler; the mime
 * + extension allowlist is enforced in the service (§5.2).
 */
export class AdminOsImportsController {
  /** POST /api/admin/os/imports — batch upload (field name `files`). */
  static async create(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const uploaded = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (uploaded.length === 0) {
        throw new OsError(
          "OS_IMPORT_NO_FILES",
          "No files were uploaded. Attach at least one docx, xlsx, pdf, or md file."
        );
      }
      const category =
        typeof req.body?.category === "string" && req.body.category.trim()
          ? String(req.body.category)
          : null;
      const folderId =
        typeof req.body?.folder_id === "string" && req.body.folder_id.trim()
          ? String(req.body.folder_id)
          : null;

      const result = await OsImportService.intake(
        uploaded.map((file) => ({
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          buffer: file.buffer,
        })),
        osActorId(req),
        { category, folderId }
      );
      return ok(res, result, 202);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /**
   * GET /api/admin/os/documents/:id/import — the latest provenance row for a
   * document, so the import modal can poll per-file status + warnings until it
   * reaches converted/failed.
   */
  static async getForDocument(
    req: AuthRequest,
    res: Response
  ): Promise<Response> {
    try {
      const record = await OsDocumentImportModel.byDocument(req.params.id);
      return ok(res, { import: record ?? null });
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
