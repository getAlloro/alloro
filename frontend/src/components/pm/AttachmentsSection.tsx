/**
 * AttachmentsSection — inline file attachments for a PM task.
 *
 * Mounted inside TaskDetailPanel. Provides:
 * - Drag-and-drop + click-to-browse upload with progress bar
 * - List of attachments with per-type icon, uploader, size, timestamp
 * - Click → open preview modal (AttachmentPreviewModal)
 * - Hover-reveal Download + Delete buttons (Delete only for the uploader)
 *
 * All I/O goes through the /api/pm/tasks/:id/attachments endpoints in
 * src/routes/pm/attachments.ts. Downloads/previews use server-issued
 * presigned URLs (1h) so we never expose raw S3 URLs.
 */

import { useEffect, useState, useRef } from "react";
import {
  File as FileIcon,
  FileImage,
  FileText,
  FileSpreadsheet,
  Film,
  Upload,
  Download,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { PmTaskAttachment } from "../../types/pm";
import type { PmTaskAttachmentsState } from "../../hooks/queries/usePmTaskAttachments";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { getCurrentUserId } from "../../utils/currentUser";
import { PmContextMenu } from "./PmContextMenu";
import { PmConfirmDialog } from "./PmConfirmDialog";
import { Eye } from "lucide-react";
import {
  canDeletePmAttachment,
  formatPmAttachmentBytes,
} from "./pmTaskFeed.utils";

export type AttachmentsSectionProps = {
  taskId: string;
  taskCreatedBy: number;
  attachmentState: PmTaskAttachmentsState;
};

function iconForMime(mime: string) {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("video/")) return Film;
  if (
    mime === "text/csv" ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  )
    return FileSpreadsheet;
  if (
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime.includes("word") ||
    mime === "application/json"
  )
    return FileText;
  return FileIcon;
}

export function AttachmentsSection({
  taskId,
  taskCreatedBy,
  attachmentState,
}: AttachmentsSectionProps) {
  const {
    attachments,
    uploads,
    isLoading,
    error,
    uploadFiles,
    remove,
    download,
    getPreviewUrl,
  } = attachmentState;
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewing, setPreviewing] = useState<PmTaskAttachment | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    att: PmTaskAttachment;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PmTaskAttachment | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUserId = getCurrentUserId();

  // Fetch presigned URLs for image thumbnails on first sight of each image.
  // Presigned URLs are good for 1h — plenty for a panel session.
  useEffect(() => {
    const missing = attachments.filter(
      (a) => a.mime_type.startsWith("image/") && !thumbs[a.id],
    );
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        missing.map(async (a) => {
          try {
            next[a.id] = await getPreviewUrl(a.id);
          } catch {
            /* skip */
          }
        }),
      );
      if (!cancelled && Object.keys(next).length > 0) {
        setThumbs((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachments, getPreviewUrl, thumbs]);

  const onBrowseClick = () => fileInputRef.current?.click();
  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void uploadFiles(e.target.files);
      e.target.value = "";
    }
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
  };

  const canDelete = (att: PmTaskAttachment): boolean => {
    return canDeletePmAttachment(att, currentUserId, taskCreatedBy);
  };

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-pm-text-secondary">
        Attachments
      </label>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        onClick={onBrowseClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onBrowseClick();
        }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed py-4 text-xs transition-colors"
        style={{
          borderColor: isDragOver
            ? "var(--color-pm-accent)"
            : "var(--color-pm-border)",
          backgroundColor: isDragOver
            ? "var(--color-pm-bg-hover)"
            : "var(--color-pm-bg-primary)",
          color: "var(--color-pm-text-muted)",
        }}
      >
        <Upload className="mb-1 h-4 w-4" />
        <span>
          <span className="font-medium text-pm-text-primary">
            Click to upload
          </span>{" "}
          or drag & drop
        </span>
        <span className="mt-0.5 text-[11px]">Up to 100 MB per file</span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {error && <p className="mt-2 text-[11px] text-pm-danger">{error}</p>}

      {/* In-flight uploads */}
      {uploads.length > 0 && (
        <div className="mt-3 space-y-2">
          {uploads.map((u) => (
            <div
              key={u.id}
              className="rounded-lg border p-2 text-xs"
              style={{
                borderColor: "var(--color-pm-border)",
                backgroundColor: "var(--color-pm-bg-primary)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-pm-text-primary">
                  {u.filename}
                </span>
                <span className="text-pm-text-muted">
                  {u.error ? "failed" : `${Math.round(u.progress * 100)}%`}
                </span>
              </div>
              <div
                className="mt-1 h-1 overflow-hidden rounded-full"
                style={{ backgroundColor: "var(--color-pm-border)" }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.round(u.progress * 100)}%`,
                    backgroundColor: u.error
                      ? "var(--color-pm-danger)"
                      : "var(--color-pm-accent)",
                  }}
                />
              </div>
              {u.error && (
                <p className="mt-1 text-[11px] text-pm-danger">{u.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <p className="mt-3 text-[11px] text-pm-text-muted">Loading...</p>
      ) : attachments.length === 0 && uploads.length === 0 ? null : (
        <ul className="mt-3 grid grid-cols-2 gap-3">
          {attachments.map((att) => {
            const Icon = iconForMime(att.mime_type);
            const thumbUrl = thumbs[att.id];
            const isImage = att.mime_type.startsWith("image/");
            const deletable = canDelete(att);
            return (
              <li
                key={att.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, att });
                }}
                className="group relative overflow-hidden rounded-lg border transition-colors hover:border-pm-border-hover"
                style={{
                  borderColor: "var(--color-pm-border)",
                  backgroundColor: "var(--color-pm-bg-primary)",
                }}
              >
                {/* Preview area (clickable → open modal) */}
                <button
                  onClick={() => setPreviewing(att)}
                  className="block w-full"
                >
                  <div
                    className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden"
                    style={{
                      backgroundColor: "var(--color-pm-bg-hover)",
                    }}
                  >
                    {isImage && thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={att.filename}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Icon
                        className="h-10 w-10"
                        style={{ color: "var(--color-pm-text-muted)" }}
                      />
                    )}
                  </div>
                </button>

                {/* Meta row */}
                <div className="flex items-center gap-2 px-2.5 py-2 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-pm-text-primary">
                      {att.filename}
                    </p>
                    <p className="truncate text-[10px] text-pm-text-muted">
                      {att.uploaded_by_name} ·{" "}
                      {formatPmAttachmentBytes(att.size_bytes)} ·{" "}
                      {formatDistanceToNow(new Date(att.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>

                {/* Always-visible action buttons — top-right overlay */}
                <div className="absolute top-1.5 right-1.5 flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void download(att);
                    }}
                    title="Download"
                    aria-label="Download attachment"
                    className="rounded-md p-1 backdrop-blur-sm transition-colors"
                    style={{
                      backgroundColor: "rgba(0,0,0,0.45)",
                      color: "#FFFFFF",
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  {deletable && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(att);
                      }}
                      title="Delete"
                      aria-label="Delete attachment"
                      className="rounded-md p-1 backdrop-blur-sm transition-colors hover:bg-red-500/80"
                      style={{
                        backgroundColor: "rgba(0,0,0,0.45)",
                        color: "#FFFFFF",
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {previewing && (
        <AttachmentPreviewModal
          taskId={taskId}
          attachment={previewing}
          onClose={() => setPreviewing(null)}
          onDownload={(attachment) => void download(attachment)}
        />
      )}

      {ctxMenu && (
        <PmContextMenu
          open
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              id: "preview",
              label: "Preview",
              icon: <Eye className="h-3.5 w-3.5" />,
              onClick: () => setPreviewing(ctxMenu.att),
            },
            {
              id: "download",
              label: "Download",
              icon: <Download className="h-3.5 w-3.5" />,
              onClick: () => void download(ctxMenu.att),
            },
            {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="h-3.5 w-3.5" />,
              danger: true,
              disabled: !canDelete(ctxMenu.att),
              onClick: () => setPendingDelete(ctxMenu.att),
            },
          ]}
        />
      )}

      <PmConfirmDialog
        open={!!pendingDelete}
        danger
        title="Delete attachment?"
        message={
          pendingDelete
            ? `"${pendingDelete.filename}" will be removed from this task and its file deleted from storage. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => !deleting && setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          setDeleting(true);
          try {
            await remove(pendingDelete);
          } finally {
            setDeleting(false);
            setPendingDelete(null);
          }
        }}
      />
    </div>
  );
}
