/**
 * PM Task Attachments — Constants
 *
 * MIME whitelists and upload limits for the per-task attachment system.
 * Server-side validation against these constants is the single source of
 * truth; client-side UI hints are advisory only.
 */

/** 100 MB — per-file upload cap. Mirrored in multer config. */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/**
 * Full whitelist of MIME types that may be uploaded. Anything not on this
 * list is rejected with 400. `application/octet-stream` is included as an
 * escape hatch for browsers that fail to detect a MIME; pair this with
 * the blocked list to prevent obvious abuse.
 */
export const ALLOWED_MIME_TYPES: string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/csv",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
  "text/xml",
  "application/xml",
  "text/yaml",
  "application/yaml",
  "video/mp4",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/json",
  "application/octet-stream",
];

/**
 * Subset of ALLOWED that the UI will render inline. Everything else gets a
 * download-only treatment.
 */
export const PREVIEWABLE_MIME_TYPES: string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/csv",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
  "text/xml",
  "application/xml",
  "text/yaml",
  "application/yaml",
  "application/json",
  "video/mp4",
];

export const COMMENT_IMAGE_MIME_TYPES: string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * Explicitly rejected — even if somehow they squeak onto the allowed list,
 * these are hard-denied. Guards against executable/script upload abuse.
 */
/**
 * Hard-deny list. These are kept out even though some (text/html,
 * application/javascript) look "text-ish" — they're risky enough that
 * we deliberately never let the browser render them. NOTE: user-visible
 * HTML/JS/CSS uploads ARE allowed now (text/html, text/css, etc.) and
 * are previewed via the server-side /text proxy as plain text — never
 * via a URL the browser could execute.
 */
export const BLOCKED_MIME_TYPES: string[] = [
  "application/x-msdownload",
  "application/x-sh",
  "application/xhtml+xml",
  "application/x-executable",
];

export function isMimeAllowed(mime: string): boolean {
  if (BLOCKED_MIME_TYPES.includes(mime)) return false;
  return ALLOWED_MIME_TYPES.includes(mime);
}

export function isMimePreviewable(mime: string): boolean {
  return PREVIEWABLE_MIME_TYPES.includes(mime);
}

export function isCommentImageMime(mime: string): boolean {
  return COMMENT_IMAGE_MIME_TYPES.includes(mime);
}
