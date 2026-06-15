/**
 * PM Task Attachments Controller
 *
 * HTTP handlers for per-task file attachments. Bytes live in S3 under
 * `pm-attachments/{taskId}/{uuid}-{sanitized-filename}`; DB stores metadata
 * only. All downloads/previews are served via short-lived presigned URLs
 * (1 hour) — we never expose permanent S3 URLs.
 *
 * Endpoints (mounted under /api/pm):
 * - POST   /tasks/:id/attachments                       → uploadAttachment
 * - GET    /tasks/:id/attachments                       → listAttachments
 * - GET    /tasks/:id/attachments/:attachmentId/url     → getAttachmentDownloadUrl
 * - DELETE /tasks/:id/attachments/:attachmentId         → deleteAttachment
 *
 * Auth: authenticateToken + superAdminMiddleware, same as every other PM route.
 */

import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { PmTaskAttachmentModel } from "../../models/PmTaskAttachmentModel";
import { PmTaskModel } from "../../models/PmTaskModel";
import { UserModel } from "../../models/UserModel";
import {
  uploadToS3,
  deleteFromS3,
  generatePresignedUrl,
  getFromS3,
} from "../../utils/core/s3";
import {
  ALLOWED_MIME_TYPES,
  BLOCKED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  isMimePreviewable,
} from "./pm-attachments-utils/constants";
import { buildAttachmentS3Key } from "./pm-attachments-utils/s3-key";
import { logPmActivity } from "./pmActivityLogger";
import logger from "../../lib/logger";

function handleError(res: Response, error: unknown, operation: string): Response {
  logger.error({ err: error }, `[PM-ATTACHMENTS] ${operation} failed:`);
  const message = error instanceof Error ? error.message : String(error);
  return res.status(500).json({ success: false, error: message });
}

async function enrichAttachment(row: any): Promise<any> {
  if (!row) return row;
  const user = await UserModel.findEmailById(row.uploaded_by);
  const uploaded_by_name = user?.email
    ? user.email.split("@")[0]
    : `user ${row.uploaded_by}`;
  return {
    ...row,
    uploaded_by_name,
    is_previewable: isMimePreviewable(row.mime_type),
  };
}

// POST /api/pm/tasks/:id/attachments
export async function uploadAttachment(
  req: AuthRequest,
  res: Response
): Promise<any> {
  try {
    const taskId = req.params.id;

    const task = await PmTaskModel.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, error: "No file uploaded (field name: file)" });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return res.status(413).json({
        success: false,
        error: `File exceeds ${MAX_FILE_SIZE_BYTES} bytes`,
      });
    }

    const mime = file.mimetype || "application/octet-stream";
    if (BLOCKED_MIME_TYPES.includes(mime)) {
      return res
        .status(400)
        .json({ success: false, error: `MIME type not allowed: ${mime}` });
    }
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      return res
        .status(400)
        .json({ success: false, error: `MIME type not allowed: ${mime}` });
    }

    const originalName = file.originalname || "upload";
    const s3Key = buildAttachmentS3Key(taskId, originalName);

    await uploadToS3(s3Key, file.buffer, mime);

    // PmTaskAttachmentModel.insertMetadata bypasses BaseModel.create — it
    // auto-stamps updated_at, and pm_task_attachments has no such column
    // (attachments are immutable once uploaded).
    const created = await PmTaskAttachmentModel.insertMetadata({
      task_id: taskId,
      uploaded_by: req.user!.userId,
      filename: originalName,
      s3_key: s3Key,
      mime_type: mime,
      size_bytes: file.size,
    });

    await logPmActivity({
      project_id: task.project_id,
      task_id: taskId,
      user_id: req.user!.userId,
      action: "attachment_added",
      metadata: {
        attachment_id: created.id,
        filename: originalName,
        mime_type: mime,
        size_bytes: file.size,
      },
    });

    const enriched = await enrichAttachment(created);
    // The uploader can always delete their own upload; task creator also can.
    enriched.can_delete = true;
    return res.status(201).json({ success: true, data: enriched });
  } catch (error) {
    return handleError(res, error, "uploadAttachment");
  }
}

// GET /api/pm/tasks/:id/attachments
export async function listAttachments(
  req: AuthRequest,
  res: Response
): Promise<any> {
  try {
    const taskId = req.params.id;

    const task = await PmTaskModel.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const rows = await PmTaskAttachmentModel.listByTaskWithUploader(taskId);

    // users.id is BIGINT → pg driver returns it as string on the JWT,
    // but uploaded_by (INTEGER) comes back as number. Coerce once so all
    // strict-equality checks below line up.
    const callerId = Number(req.user!.userId);
    const attachments = rows.map((row: any) => ({
      id: row.id,
      task_id: row.task_id,
      uploaded_by: row.uploaded_by,
      uploaded_by_name: row.uploader_email
        ? row.uploader_email.split("@")[0]
        : `user ${row.uploaded_by}`,
      filename: row.filename,
      s3_key: row.s3_key,
      mime_type: row.mime_type,
      size_bytes:
        typeof row.size_bytes === "string"
          ? parseInt(row.size_bytes, 10)
          : row.size_bytes,
      is_previewable: isMimePreviewable(row.mime_type),
      created_at: row.created_at,
      // Server-verified: matches the check enforced by deleteAttachment
      // (uploader OR task creator can delete).
      can_delete:
        row.uploaded_by === callerId || task.created_by === callerId,
    }));

    return res.json({ success: true, data: { attachments } });
  } catch (error) {
    return handleError(res, error, "listAttachments");
  }
}

// GET /api/pm/tasks/:id/attachments/:attachmentId/url
export async function getAttachmentDownloadUrl(
  req: AuthRequest,
  res: Response
): Promise<any> {
  try {
    const { id: taskId, attachmentId } = req.params;

    const attachment = await PmTaskAttachmentModel.findOne({
      id: attachmentId,
      task_id: taskId,
    });
    if (!attachment) {
      return res
        .status(404)
        .json({ success: false, error: "Attachment not found" });
    }

    const expiresInSeconds = 3600;
    // ?download=1 → sign URL with Content-Disposition: attachment so the
    // browser forces a file download instead of rendering inline. The
    // default (no query) is a preview-friendly URL.
    const forceDownload = req.query?.download === "1";
    const url = await generatePresignedUrl(
      attachment.s3_key,
      expiresInSeconds,
      forceDownload ? attachment.filename : undefined
    );
    const expires_at = new Date(
      Date.now() + expiresInSeconds * 1000
    ).toISOString();

    return res.json({ success: true, data: { url, expires_at } });
  } catch (error) {
    return handleError(res, error, "getAttachmentDownloadUrl");
  }
}

// GET /api/pm/tasks/:id/attachments/:attachmentId/text
// Server-side proxy that streams the S3 object body as plain text up to
// a safe byte cap (default 2MB). Avoids browser CORS against S3 for
// text-based previews (csv, txt, html, css, js, json, xml, yaml, md).
export async function getAttachmentTextContent(
  req: AuthRequest,
  res: Response
): Promise<any> {
  try {
    const { id: taskId, attachmentId } = req.params;
    const capRaw = parseInt(String(req.query?.cap || ""), 10);
    const MAX = 2 * 1024 * 1024; // 2 MB hard ceiling
    const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.min(capRaw, MAX) : MAX;

    const attachment = await PmTaskAttachmentModel.findOne({
      id: attachmentId,
      task_id: taskId,
    });
    if (!attachment) {
      return res
        .status(404)
        .json({ success: false, error: "Attachment not found" });
    }

    const obj = await getFromS3(attachment.s3_key);
    const chunks: Buffer[] = [];
    let total = 0;
    let truncated = false;

    await new Promise<void>((resolve, reject) => {
      const stream = obj.body as NodeJS.ReadableStream;
      stream.on("data", (chunk: Buffer | string) => {
        const buf = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as string);
        if (total + buf.length > cap) {
          const remaining = cap - total;
          if (remaining > 0) chunks.push(buf.subarray(0, remaining));
          total = cap;
          truncated = true;
          // Stop reading more bytes; mark as ended.
          (stream as any).destroy?.();
          resolve();
          return;
        }
        chunks.push(buf);
        total += buf.length;
      });
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });

    const text = Buffer.concat(chunks).toString("utf8");
    return res.json({
      success: true,
      data: { text, truncated, total_bytes: total },
    });
  } catch (error) {
    return handleError(res, error, "getAttachmentTextContent");
  }
}

// DELETE /api/pm/tasks/:id/attachments/:attachmentId
export async function deleteAttachment(
  req: AuthRequest,
  res: Response
): Promise<any> {
  try {
    const { id: taskId, attachmentId } = req.params;

    const attachment = await PmTaskAttachmentModel.findOne({
      id: attachmentId,
      task_id: taskId,
    });
    if (!attachment) {
      return res
        .status(404)
        .json({ success: false, error: "Attachment not found" });
    }

    const task = await PmTaskModel.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    // JWT userId comes as a string (bigint); uploaded_by is integer.
    const callerId = Number(req.user!.userId);
    const isUploader = attachment.uploaded_by === callerId;
    const isTaskCreator = task.created_by === callerId;
    if (!isUploader && !isTaskCreator) {
      return res.status(403).json({
        success: false,
        error: "Only the uploader or task creator can delete this attachment",
      });
    }

    try {
      await deleteFromS3(attachment.s3_key);
    } catch (s3Err) {
      logger.error({ err: s3Err }, `[PM-ATTACHMENTS] S3 delete failed for ${attachment.s3_key}:`);
      // fall through — still remove the row so the UI reflects the intent
    }

    await PmTaskAttachmentModel.deleteById(attachmentId);

    await logPmActivity({
      project_id: task.project_id,
      task_id: taskId,
      user_id: callerId,
      action: "attachment_deleted",
      metadata: {
        attachment_id: attachmentId,
        filename: attachment.filename,
      },
    });

    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return handleError(res, error, "deleteAttachment");
  }
}
