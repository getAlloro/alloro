import { v4 as uuidv4 } from "uuid";

export function buildSupportAttachmentS3Key(
  ticketId: string,
  filename: string,
): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uniqueId = uuidv4().slice(0, 8);
  return `support-attachments/${ticketId}/${uniqueId}-${sanitized}`;
}
