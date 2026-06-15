/**
 * AttachmentPreviewModal — renders a single attachment inline when possible.
 *
 * Fetches a fresh 1-hour presigned URL on mount for image/pdf/video
 * previews. Text-based previews (csv, txt, html, css, js, json, xml,
 * yaml, markdown) go through the server-side /text proxy endpoint so
 * the browser never hits S3 directly (avoids CORS). Text previews
 * include a Copy-to-clipboard button.
 *
 * Close: backdrop click or ESC.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, File as FileIcon, Copy, Check } from "lucide-react";
import Papa from "papaparse";
import {
  getAttachmentDownloadUrl,
  getAttachmentTextContent,
} from "../../api/pm";
import type { PmTaskAttachment } from "../../types/pm";
import { logger } from "../../lib/logger";

interface AttachmentPreviewModalProps {
  taskId: string;
  attachment: PmTaskAttachment;
  onClose: () => void;
  onDownload: (att: PmTaskAttachment) => void;
}

const CSV_ROW_CAP = 1000;

type PreviewKind = "image" | "pdf" | "video" | "csv" | "text" | "none";

// Extension → preview kind fallback. Some uploads arrive with MIME
// application/octet-stream (browsers fail to detect), so we also
// consider the filename extension.
const TEXT_EXTS = new Set([
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "json",
  "xml",
  "yaml",
  "yml",
  "log",
  "ini",
  "conf",
  "env",
  "sh",
  "sql",
]);

function getExt(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

function getPreviewKind(mime: string, filename: string): PreviewKind {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "video/mp4" || mime.startsWith("video/")) return "video";
  if (mime === "text/csv" || getExt(filename) === "csv") return "csv";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/javascript" ||
    mime === "application/xml" ||
    mime === "application/yaml"
  ) {
    return "text";
  }
  // Extension fallback for octet-stream / unknown MIME
  if (TEXT_EXTS.has(getExt(filename))) return "text";
  return "none";
}

export function AttachmentPreviewModal({
  taskId,
  attachment,
  onClose,
  onDownload,
}: AttachmentPreviewModalProps) {
  const kind = useMemo(
    () => getPreviewKind(attachment.mime_type, attachment.filename),
    [attachment.mime_type, attachment.filename]
  );
  const [url, setUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textTruncated, setTextTruncated] = useState(false);
  const [csvRows, setCsvRows] = useState<string[][] | null>(null);
  const [csvTruncated, setCsvTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Non-text previews (image/pdf/video) use the direct presigned URL.
        if (kind === "image" || kind === "pdf" || kind === "video") {
          const { url: presigned } = await getAttachmentDownloadUrl(
            taskId,
            attachment.id
          );
          if (!cancelled) setUrl(presigned);
          return;
        }

        // Text & CSV go through the server proxy — no browser→S3 CORS.
        if (kind === "text" || kind === "csv") {
          const { text, truncated } = await getAttachmentTextContent(
            taskId,
            attachment.id
          );
          if (cancelled) return;
          if (kind === "csv") {
            const parsed = Papa.parse<string[]>(text, {
              skipEmptyLines: true,
            });
            const rows = (parsed.data as string[][]) || [];
            const cappedOut = rows.length > CSV_ROW_CAP;
            setCsvRows(cappedOut ? rows.slice(0, CSV_ROW_CAP) : rows);
            setCsvTruncated(cappedOut || truncated);
            setTextContent(text); // kept for Copy button
          } else {
            setTextContent(text);
            setTextTruncated(truncated);
          }
          // Non-null URL unlocks the body render branch — any value works.
          setUrl("server-proxy");
          return;
        }

        // Non-previewable: fetch URL so the Download button has a target.
        const { url: presigned } = await getAttachmentDownloadUrl(
          taskId,
          attachment.id
        );
        if (!cancelled) setUrl(presigned);
      } catch (err) {
        if (!cancelled) {
          logger.error("[AttachmentPreview] fetch failed:", err);
          setError("Failed to load preview");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, attachment.id, kind]);

  const handleCopy = async () => {
    const toCopy =
      kind === "csv" && csvRows
        ? textContent ?? ""
        : textContent ?? "";
    if (!toCopy) return;
    try {
      await navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard permission or insecure context */
    }
  };

  const canCopy = kind === "text" || kind === "csv";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-[90vh] w-[90vw] max-w-[1200px] flex-col overflow-hidden rounded-xl shadow-2xl"
          style={{
            backgroundColor: "var(--color-pm-bg-secondary)",
            border: "1px solid var(--color-pm-border)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between gap-3 border-b px-5 py-3"
            style={{ borderColor: "var(--color-pm-border)" }}
          >
            <p className="truncate text-sm font-medium text-pm-text-primary">
              {attachment.filename}
            </p>
            <div className="flex items-center gap-1">
              {canCopy && textContent !== null && (
                <button
                  onClick={handleCopy}
                  title="Copy to clipboard"
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-pm-text-secondary hover:bg-pm-bg-hover hover:text-pm-text-primary"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => onDownload(attachment)}
                title="Download"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-pm-text-secondary hover:bg-pm-bg-hover hover:text-pm-text-primary"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-pm-text-muted hover:bg-pm-bg-hover hover:text-pm-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div
            className="flex-1 overflow-auto"
            style={{ backgroundColor: "var(--color-pm-bg-primary)" }}
          >
            {error ? (
              <p className="p-6 text-sm text-pm-danger">{error}</p>
            ) : !url ? (
              <p className="p-6 text-sm text-pm-text-muted">Loading...</p>
            ) : kind === "image" ? (
              <div className="flex h-full w-full items-center justify-center p-4">
                <img
                  src={url}
                  alt={attachment.filename}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : kind === "pdf" ? (
              <embed
                src={url}
                type="application/pdf"
                className="h-full w-full"
              />
            ) : kind === "video" ? (
              <div className="flex h-full w-full items-center justify-center bg-black p-4">
                <video
                  src={url}
                  controls
                  className="max-h-full max-w-full"
                />
              </div>
            ) : kind === "csv" ? (
              <div className="p-4">
                {csvRows === null ? (
                  <p className="text-sm text-pm-text-muted">Parsing...</p>
                ) : (
                  <>
                    <div
                      className="overflow-auto rounded-lg border"
                      style={{ borderColor: "var(--color-pm-border)" }}
                    >
                      <table className="min-w-full text-xs">
                        <tbody>
                          {csvRows.map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className={
                                rIdx === 0
                                  ? "font-semibold"
                                  : rIdx % 2 === 0
                                  ? ""
                                  : "bg-pm-bg-secondary"
                              }
                            >
                              {row.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="border px-2 py-1 text-pm-text-primary"
                                  style={{
                                    borderColor: "var(--color-pm-border)",
                                  }}
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {csvTruncated && (
                      <p className="mt-3 text-[11px] text-pm-text-muted">
                        Showing first {CSV_ROW_CAP} rows — download for full file
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : kind === "text" ? (
              <>
                <pre
                  className="h-full w-full overflow-auto p-4 text-xs text-pm-text-primary"
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                  }}
                >
                  {textContent ?? "Loading..."}
                </pre>
                {textTruncated && (
                  <p className="border-t p-2 text-center text-[11px] text-pm-text-muted"
                     style={{ borderColor: "var(--color-pm-border)" }}>
                    File truncated — download for full content
                  </p>
                )}
              </>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
                <FileIcon className="h-16 w-16 text-pm-text-muted" />
                <div>
                  <p className="text-sm font-medium text-pm-text-primary">
                    {attachment.filename}
                  </p>
                  <p className="mt-1 text-xs text-pm-text-muted">
                    Preview not available for this file type.
                  </p>
                </div>
                <button
                  onClick={() => onDownload(attachment)}
                  className="flex items-center gap-2 rounded-lg bg-pm-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
