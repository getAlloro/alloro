import { uploadToS3, deleteFromS3 } from "../../../utils/core/s3";
import { IOsAsset, OsAssetModel } from "../../../models/OsAssetModel";
import { OsActivityModel } from "../../../models/OsActivityModel";
import { OsError } from "../feature-utils/OsError";
import { OsExtractedImage } from "../feature-utils/osConversionTypes";
import logger from "../../../lib/logger";

/**
 * OS assets — image objects embedded in a document (P6 T2/T5). Two entry
 * points share the S3 + os.assets write:
 *   - uploadEditorImage: an author pastes/drops an image in the editor.
 *   - embedExtractedImages: the import converter pulled images out of a docx.
 *
 * D9 key namespace: os/assets/{documentId}/{assetId} — the asset id (a real
 * os.assets row id) is in the key, so keys never collide. Delivery is a
 * presigned-redirect endpoint keyed by that id (AdminOsAssetsController), so
 * markdown refs point at /api/admin/os/assets/{assetId}, never a raw S3 URL.
 * All DB access rides Os*Model (§7.4).
 */

// Raster image types a browser renders inline. SVG is intentionally excluded
// (script-bearing). Extension is only for the S3 key's readability.
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export interface OsUploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

export interface OsUploadedAsset {
  id: string;
  url: string;
  mime: string;
}

/** The markdown src an editor/import ref points at (presigned-redirect route). */
export function osAssetUrl(assetId: string): string {
  return `/api/admin/os/assets/${assetId}`;
}

function assertSupportedImageMime(mime: string): string {
  const ext = MIME_EXT[mime];
  if (!ext) {
    throw new OsError(
      "OS_ASSET_TYPE_UNSUPPORTED",
      "Only PNG, JPG, GIF, or WebP images are supported.",
      { mime }
    );
  }
  return ext;
}

/**
 * Persist one image (row first for the id, then the S3 object at a key that
 * embeds it). If the S3 write fails, the orphan row is removed so a dangling
 * asset id never 404s later. Returns the persisted row.
 */
async function persistImage(
  documentId: string,
  data: Buffer,
  mime: string,
  size: number,
  userId: number | null
): Promise<IOsAsset> {
  const ext = assertSupportedImageMime(mime);
  const asset = await OsAssetModel.createAsset({
    document_id: documentId,
    // Placeholder key; rewritten below once we know the generated id.
    s3_key: "",
    mime,
    size_bytes: size,
    uploaded_by: userId,
  });
  const key = `os/assets/${documentId}/${asset.id}.${ext}`;
  try {
    await uploadToS3(key, data, mime);
  } catch (error) {
    // Roll back the orphan row so its id can never resolve to a missing object.
    await OsAssetModel.deleteById(asset.id).catch(() => undefined);
    throw error;
  }
  await OsAssetModel.setS3Key(asset.id, key);
  return { ...asset, s3_key: key };
}

export interface OsEmbedResult {
  markdown: string;
  warnings: string[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace `![any alt](placeholder)` with the resolved image, or drop the ref
 * entirely when url is null (the image couldn't be stored).
 */
function rewritePlaceholder(
  md: string,
  placeholder: string,
  url: string | null,
  alt: string
): string {
  const re = new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegExp(placeholder)}\\)`, "g");
  if (url === null) return md.replace(re, "");
  const safeAlt = alt.replace(/[[\]\r\n]/g, " ").trim();
  return md.replace(re, `![${safeAlt}](${url})`);
}

export const OsAssetService = {
  /**
   * Editor paste/drop upload → S3 + os.assets row → the presigned-redirect URL
   * to embed in the markdown. Logs an activity row like the OS source did.
   */
  async uploadEditorImage(
    documentId: string,
    file: OsUploadedImage,
    userId: number | null
  ): Promise<OsUploadedAsset> {
    const asset = await persistImage(
      documentId,
      file.buffer,
      file.mimetype,
      file.size,
      userId
    );
    await OsActivityModel.log({
      actor_id: userId,
      action: "asset.uploaded",
      target_type: "asset",
      target_id: asset.id,
      metadata: { document_id: documentId },
    });
    return { id: asset.id, url: osAssetUrl(asset.id), mime: asset.mime };
  },

  /**
   * Upload each import-extracted image to S3 (an os.assets row, exactly like an
   * editor image) and rewrite each placeholder in the markdown to the real
   * asset URL. Best-effort: a failed image is dropped with a warning rather
   * than failing the whole import. Alt-text vision description is DEFERRED
   * (no LLM call) — the source alt (if any) is kept.
   */
  async embedExtractedImages(
    documentId: string,
    markdown: string,
    images: OsExtractedImage[],
    userId: number | null
  ): Promise<OsEmbedResult> {
    const warnings: string[] = [];
    let out = markdown;

    for (const img of images) {
      let asset: IOsAsset;
      try {
        asset = await persistImage(
          documentId,
          img.data,
          img.mime,
          img.data.length,
          userId
        );
      } catch (error) {
        logger.warn(
          { err: error, documentId },
          "[ADMIN-OS] import image upload failed — dropping image"
        );
        warnings.push("An embedded image could not be stored and was skipped.");
        out = rewritePlaceholder(out, img.placeholder, null, "");
        continue;
      }
      out = rewritePlaceholder(
        out,
        img.placeholder,
        osAssetUrl(asset.id),
        (img.alt ?? "").trim()
      );
    }

    return { markdown: out, warnings };
  },

  /** Remove an asset's S3 object (best-effort) — used only in test cleanup. */
  async deleteAssetObject(key: string): Promise<void> {
    if (!key) return;
    await deleteFromS3(key);
  },
};
