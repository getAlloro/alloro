export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TICKET = 5;

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export type SupportAttachmentMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isMimeAllowed(mime: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mime as SupportAttachmentMimeType);
}

export function isMimePreviewable(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf";
}
