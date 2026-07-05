import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OsAssetService } from "./feature-services/OsAssetService";
import { OsAssetModel } from "../../models/OsAssetModel";
import { OsDocumentModel } from "../../models/OsDocumentModel";
import { generatePresignedUrl } from "../../utils/core/s3";
import { getOsKnowledgeBaseConfig } from "../../config/osKnowledgeBase";
import { ok, handleOsError } from "./feature-utils/osResponses";
import { osActorId } from "./feature-utils/osRequestParams";
import { OsError } from "./feature-utils/OsError";

/**
 * Admin OS — asset upload + delivery (plans/07042026-alloro-os-admin-port P6
 * T5; §2.4 split by resource). Editor paste/drop images are uploaded here;
 * both editor images and import-extracted images are served through the
 * presigned-redirect GET so the S3 bucket/keys never leak into markdown or the
 * client. Thin orchestration only (§7.3).
 */
export class AdminOsAssetsController {
  /** POST /api/admin/os/documents/:id/assets — editor image (field `file`). */
  static async upload(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const documentId = req.params.id;
      const document = await OsDocumentModel.findDocumentById(documentId);
      if (!document) {
        throw new OsError("OS_DOCUMENT_NOT_FOUND", "Document not found.", {
          documentId,
        });
      }
      const file = req.file;
      if (!file) {
        throw new OsError(
          "OS_ASSET_NO_FILE",
          "No image was uploaded. Attach a PNG, JPG, GIF, or WebP file."
        );
      }
      const asset = await OsAssetService.uploadEditorImage(
        documentId,
        {
          buffer: file.buffer,
          mimetype: file.mimetype,
          size: file.size,
          originalname: file.originalname,
        },
        osActorId(req)
      );
      return ok(res, { asset }, 201);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /**
   * GET /api/admin/os/assets/:id — 302 redirect to a short-expiry presigned S3
   * URL. The §8.1 envelope is intentionally NOT applied here (documented
   * exception, master spec constraints): browsers and <img> tags follow the
   * redirect and load the object directly. 404 (as an envelope) on an unknown
   * asset id.
   */
  static async serve(req: AuthRequest, res: Response): Promise<Response | void> {
    try {
      const asset = await OsAssetModel.findAssetById(req.params.id);
      if (!asset || !asset.s3_key) {
        throw new OsError("OS_ASSET_NOT_FOUND", "Asset not found.", {
          assetId: req.params.id,
        });
      }
      const url = await generatePresignedUrl(
        asset.s3_key,
        getOsKnowledgeBaseConfig().assetUrlTtlSeconds
      );
      return res.redirect(302, url);
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
