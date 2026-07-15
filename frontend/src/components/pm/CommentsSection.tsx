/**
 * CommentsSection — chronological comments + task attachments.
 *
 * Comment markdown remains raw-HTML-off. Attachments are the same canonical
 * task records shown in AttachmentsSection; this component never creates a
 * synthetic comment or a second file relationship.
 */

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { formatDistanceToNow } from "date-fns";
import {
  Download,
  Eye,
  MessageCircle,
  Paperclip,
  Pencil,
  Trash2,
} from "lucide-react";
import type { PmTaskAttachmentsState } from "../../hooks/queries/usePmTaskAttachments";
import type { PmTaskCommentsState } from "../../hooks/queries/usePmTaskComments";
import type { PmTaskAttachment, PmTaskComment } from "../../types/pm";
import { getCurrentUserId } from "../../utils/currentUser";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
import { CommentComposer, CommentEditor } from "./CommentComposer";
import { PmConfirmDialog } from "./PmConfirmDialog";
import { PmContextMenu } from "./PmContextMenu";
import { PmTaskFeed } from "./PmTaskFeed";
import {
  canDeletePmAttachment,
  formatPmAttachmentBytes,
} from "./pmTaskFeed.utils";

export type CommentsSectionProps = {
  taskId: string;
  taskCreatedBy: number;
  commentState: PmTaskCommentsState;
  attachmentState: PmTaskAttachmentsState;
};

/** id="pm-comments-section" anchor target for notification click-through */
export const COMMENTS_SECTION_ANCHOR_ID = "pm-comments-section";

const MENTION_TOKEN_PREFIX = "\u2063@MENTION\u2063";
const MENTION_TOKEN_SUFFIX = "\u2063/MENTION\u2063";

function wrapMentions(
  body: string,
  mentionNames: Record<number, string>,
): string {
  const names = Object.values(mentionNames);
  if (names.length === 0) return body;
  const sorted = [...names].sort((a, b) => b.length - a.length);
  let output = body;
  for (const name of sorted) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(
      new RegExp(`@${escaped}\\b`, "g"),
      `${MENTION_TOKEN_PREFIX}${name}${MENTION_TOKEN_SUFFIX}`,
    );
  }
  return output;
}

function urlTransform(url: string): string {
  const lower = url.trim().toLowerCase();
  return lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("/") ||
    lower.startsWith("#")
    ? url
    : "";
}

const DISALLOWED_ELEMENTS = ["script", "iframe", "object", "embed", "style"];

type SafeMarkdownProps = {
  body: string;
  mentionNames: Record<number, string>;
};

function SafeMarkdown({ body, mentionNames }: SafeMarkdownProps) {
  const wrapped = useMemo(
    () => wrapMentions(body, mentionNames),
    [body, mentionNames],
  );
  return (
    <div className="pm-comment-md">
      <ReactMarkdown
        disallowedElements={DISALLOWED_ELEMENTS}
        urlTransform={urlTransform}
        components={{
          p: ({ children }: React.HTMLAttributes<HTMLParagraphElement>) => (
            <p>{renderWithMentions(children)}</p>
          ),
          li: ({ children }: React.HTMLAttributes<HTMLLIElement>) => (
            <li>{renderWithMentions(children)}</li>
          ),
          a: ({
            children,
            href,
          }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#D66853]"
            >
              {renderWithMentions(children)}
            </a>
          ),
        }}
      >
        {wrapped}
      </ReactMarkdown>
      <style>{`
        .pm-comment-md { font-size: 13px; color: var(--color-pm-text-primary); line-height: 1.55; }
        .pm-comment-md p { margin: 0 0 6px; }
        .pm-comment-md p:last-child { margin-bottom: 0; }
        .pm-comment-md ul, .pm-comment-md ol { margin: 0 0 6px; padding-left: 20px; }
        .pm-comment-md code { background: var(--color-pm-bg-hover); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
        .pm-comment-md pre { background: var(--color-pm-bg-hover); padding: 8px 10px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
        .pm-mention { color: #D66853; font-weight: 600; }
      `}</style>
    </div>
  );
}

function renderWithMentions(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") return substituteMentions(children);
  if (Array.isArray(children)) {
    return children.map((child, index) =>
      typeof child === "string" ? (
        <span key={index}>{substituteMentions(child)}</span>
      ) : (
        child
      ),
    );
  }
  return children;
}

function substituteMentions(text: string): React.ReactNode {
  if (!text.includes(MENTION_TOKEN_PREFIX)) return text;
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    const start = rest.indexOf(MENTION_TOKEN_PREFIX);
    if (start < 0) {
      parts.push(rest);
      break;
    }
    const end = rest.indexOf(
      MENTION_TOKEN_SUFFIX,
      start + MENTION_TOKEN_PREFIX.length,
    );
    if (end < 0) {
      parts.push(rest);
      break;
    }
    if (start > 0) parts.push(rest.slice(0, start));
    const name = rest.slice(start + MENTION_TOKEN_PREFIX.length, end);
    parts.push(
      <span key={`mention-${key++}`} className="pm-mention">
        @{name}
      </span>,
    );
    rest = rest.slice(end + MENTION_TOKEN_SUFFIX.length);
  }
  return parts;
}

export function CommentsSection({
  taskId,
  taskCreatedBy,
  commentState,
  attachmentState,
}: CommentsSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingCommentDelete, setPendingCommentDelete] = useState<
    string | null
  >(null);
  const [pendingAttachmentDelete, setPendingAttachmentDelete] =
    useState<PmTaskAttachment | null>(null);
  const [previewing, setPreviewing] = useState<PmTaskAttachment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    comment: PmTaskComment;
  } | null>(null);
  const currentUserId = getCurrentUserId();

  const isCommentAuthor = (comment: PmTaskComment): boolean =>
    typeof comment.is_mine === "boolean"
      ? comment.is_mine
      : currentUserId !== null && comment.author_id === currentUserId;

  const renderComment = (comment: PmTaskComment) => {
    const isAuthor = isCommentAuthor(comment);
    const isEditing = editingId === comment.id;
    return (
      <article
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            comment,
          });
        }}
        className="group rounded-lg border border-pm-border bg-pm-bg-primary px-3 py-2.5"
      >
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-pm-border bg-pm-bg-secondary text-[10px] font-semibold text-[#D66853]">
            {comment.author_name.charAt(0).toUpperCase()}
          </span>
          <span className="text-[12px] font-semibold text-pm-text-primary">
            {comment.author_name}
          </span>
          <span className="text-[11px] text-pm-text-muted">
            {formatDistanceToNow(new Date(comment.created_at), {
              addSuffix: true,
            })}
          </span>
          {comment.edited_at && (
            <span
              className="text-[10px] text-pm-text-muted"
              title={`Edited ${new Date(comment.edited_at).toLocaleString()}`}
            >
              (edited)
            </span>
          )}
          {isAuthor && !isEditing && (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditingId(comment.id)}
                title="Edit"
                aria-label="Edit comment"
                className="rounded p-1 text-pm-text-muted hover:bg-pm-bg-secondary hover:text-pm-text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPendingCommentDelete(comment.id)}
                title="Delete"
                aria-label="Delete comment"
                className="rounded p-1 text-pm-text-muted hover:bg-red-500/10 hover:text-pm-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
        {isEditing ? (
          <CommentEditor
            taskId={taskId}
            users={commentState.users}
            initialBody={comment.body}
            initialMentions={comment.mentions}
            submitting={commentState.isSubmitting}
            onSubmit={async (body, mentions) => {
              try {
                await commentState.update(comment.id, body, mentions);
                setEditingId(null);
              } catch {
                // The query hook reports the API error through a visible toast.
              }
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <SafeMarkdown
            body={comment.body}
            mentionNames={comment.mention_names}
          />
        )}
      </article>
    );
  };

  const renderAttachment = (attachment: PmTaskAttachment) => {
    const deletable = canDeletePmAttachment(
      attachment,
      currentUserId,
      taskCreatedBy,
    );
    return (
      <article className="rounded-lg border border-pm-border bg-pm-bg-primary px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 shrink-0 text-pm-text-muted" />
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setPreviewing(attachment)}
          >
            <span className="block truncate text-[12px] font-semibold text-pm-text-primary">
              {attachment.filename}
            </span>
            <span className="block truncate text-[10px] text-pm-text-muted">
              {attachment.uploaded_by_name} ·{" "}
              {formatPmAttachmentBytes(attachment.size_bytes)} ·{" "}
              {formatDistanceToNow(new Date(attachment.created_at), {
                addSuffix: true,
              })}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewing(attachment)}
            title="Preview"
            aria-label={`Preview ${attachment.filename}`}
            className="rounded p-1 text-pm-text-muted hover:bg-pm-bg-hover hover:text-pm-text-primary"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void attachmentState.download(attachment)}
            title="Download"
            aria-label={`Download ${attachment.filename}`}
            className="rounded p-1 text-pm-text-muted hover:bg-pm-bg-hover hover:text-pm-text-primary"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          {deletable && (
            <button
              type="button"
              onClick={() => setPendingAttachmentDelete(attachment)}
              title="Delete"
              aria-label={`Delete ${attachment.filename}`}
              className="rounded p-1 text-pm-text-muted hover:bg-red-500/10 hover:text-pm-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div id={COMMENTS_SECTION_ANCHOR_ID}>
      <label className="mb-2 block text-xs font-medium text-pm-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5" />
          Comments
          {commentState.comments.length > 0 && (
            <span className="text-[11px] text-pm-text-muted">
              ({commentState.comments.length})
            </span>
          )}
        </span>
      </label>

      <PmTaskFeed
        comments={commentState.comments}
        attachments={attachmentState.attachments}
        uploads={attachmentState.uploads}
        isLoading={commentState.isLoading || attachmentState.isLoading}
        onFiles={attachmentState.uploadFiles}
        renderComment={renderComment}
        renderAttachment={renderAttachment}
      />

      {(commentState.error || attachmentState.error) && (
        <p className="mt-2 text-[11px] text-pm-danger">
          {commentState.error || attachmentState.error}
        </p>
      )}

      <div className="mt-3">
        <CommentComposer
          taskId={taskId}
          users={commentState.users}
          submitting={commentState.isSubmitting}
          onSubmit={async (body, mentions) => {
            try {
              await commentState.create(body, mentions);
            } catch {
              // The query hook reports the API error through a visible toast.
            }
          }}
        />
      </div>

      {contextMenu && (
        <PmContextMenu
          open
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              id: "edit",
              label: "Edit",
              icon: <Pencil className="h-3.5 w-3.5" />,
              disabled: !isCommentAuthor(contextMenu.comment),
              onClick: () => setEditingId(contextMenu.comment.id),
            },
            {
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="h-3.5 w-3.5" />,
              danger: true,
              disabled: !isCommentAuthor(contextMenu.comment),
              onClick: () => setPendingCommentDelete(contextMenu.comment.id),
            },
          ]}
        />
      )}

      {previewing && (
        <AttachmentPreviewModal
          taskId={taskId}
          attachment={previewing}
          onClose={() => setPreviewing(null)}
          onDownload={(attachment) => void attachmentState.download(attachment)}
        />
      )}

      <PmConfirmDialog
        open={Boolean(pendingCommentDelete)}
        danger
        title="Delete comment?"
        message="This comment will be removed permanently. This can't be undone."
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => !deleting && setPendingCommentDelete(null)}
        onConfirm={async () => {
          if (!pendingCommentDelete) return;
          setDeleting(true);
          try {
            await commentState.remove(pendingCommentDelete);
          } catch {
            // The query hook reports the API error through a visible toast.
          } finally {
            setDeleting(false);
            setPendingCommentDelete(null);
          }
        }}
      />

      <PmConfirmDialog
        open={Boolean(pendingAttachmentDelete)}
        danger
        title="Delete attachment?"
        message={
          pendingAttachmentDelete
            ? `"${pendingAttachmentDelete.filename}" will be removed from this task and its file deleted from storage. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => !deleting && setPendingAttachmentDelete(null)}
        onConfirm={async () => {
          if (!pendingAttachmentDelete) return;
          setDeleting(true);
          try {
            await attachmentState.remove(pendingAttachmentDelete);
          } catch {
            // The query hook reports the API error through a visible toast.
          } finally {
            setDeleting(false);
            setPendingAttachmentDelete(null);
          }
        }}
      />
    </div>
  );
}
