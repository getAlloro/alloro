import type { PmTaskAttachment, PmTaskComment } from "../../types/pm";

export type PmTaskUpload = {
  id: string;
  filename: string;
  progress: number;
  startedAt: string;
  error?: string;
};

export type PmTaskFeedItem =
  | { kind: "comment"; id: string; createdAt: string; comment: PmTaskComment }
  | {
      kind: "attachment";
      id: string;
      createdAt: string;
      attachment: PmTaskAttachment;
    }
  | { kind: "upload"; id: string; createdAt: string; upload: PmTaskUpload };

const compareFeedItems = (a: PmTaskFeedItem, b: PmTaskFeedItem): number => {
  const timeDifference =
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  return (
    timeDifference || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id)
  );
};

export function buildPmTaskFeed(
  comments: PmTaskComment[],
  attachments: PmTaskAttachment[],
  uploads: PmTaskUpload[],
): PmTaskFeedItem[] {
  const persisted: PmTaskFeedItem[] = [
    ...comments.map((comment): PmTaskFeedItem => ({
      kind: "comment",
      id: comment.id,
      createdAt: comment.created_at,
      comment,
    })),
    ...attachments.map((attachment): PmTaskFeedItem => ({
      kind: "attachment",
      id: attachment.id,
      createdAt: attachment.created_at,
      attachment,
    })),
  ].sort(compareFeedItems);

  const queued = uploads
    .map((upload): PmTaskFeedItem => ({
      kind: "upload",
      id: upload.id,
      createdAt: upload.startedAt,
      upload,
    }))
    .sort(compareFeedItems);

  return [...persisted, ...queued];
}

export function formatPmAttachmentBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function canDeletePmAttachment(
  attachment: PmTaskAttachment,
  currentUserId: number | null,
  taskCreatedBy: number,
): boolean {
  if (typeof attachment.can_delete === "boolean") {
    return attachment.can_delete;
  }
  if (currentUserId === null) return false;
  return (
    attachment.uploaded_by === currentUserId || taskCreatedBy === currentUserId
  );
}
