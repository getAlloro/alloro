import { useState } from "react";
import { CornerDownRight, Pencil, Trash2 } from "lucide-react";
import type { OsComment, OsCommentAuthor } from "../../../../api/admin-os";
import { OsMarkdownBody } from "../read/OsMarkdownBody";
import { formatOsDateTime, formatOsRelativeTime } from "../shared/osFormat";
import { OsCommentComposer } from "./OsCommentComposer";

/**
 * One comment row (plans/07042026-alloro-os-admin-port P7 T2). Avatar initial
 * from the author name/email, Jakarta chrome + mono meta, markdown body via the
 * house react-markdown renderer. Reply/Edit/Delete appear on hover; Edit and
 * Delete only render on the viewer's own comments — but that is cosmetic, the
 * server is the real author gate (§5.4). A tombstone renders "Comment deleted"
 * and keeps its slot so the thread shape survives. No task affordances.
 */

/** First letter of name, else email, else a bullet. */
function authorInitial(author: OsCommentAuthor | null): string {
  const source = author?.name || author?.email || "";
  return source.trim().charAt(0).toUpperCase() || "•";
}

function authorLabel(author: OsCommentAuthor | null): string {
  return author?.name || author?.email || "Unknown";
}

function OsCommentAvatar({ author }: { author: OsCommentAuthor | null }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-sans text-[11px] font-semibold text-alloro-orange"
    >
      {authorInitial(author)}
    </span>
  );
}

function OsCommentAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-0.5 text-gray-300 transition-colors duration-150 hover:text-gray-700"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
    </button>
  );
}

export function OsCommentItem({
  comment,
  isReply,
  canModify,
  canReply,
  isSavingEdit,
  isReplying,
  onEdit,
  onDelete,
  onReply,
}: {
  comment: OsComment;
  isReply: boolean;
  canModify: boolean;
  canReply: boolean;
  isSavingEdit: boolean;
  isReplying: boolean;
  onEdit: (commentId: string, body: string) => void;
  onDelete: (commentId: string) => void;
  onReply: (parentCommentId: string, body: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isReplyOpen, setIsReplyOpen] = useState(false);

  if (comment.deleted) {
    return (
      <div className={`py-2 ${isReply ? "pl-8" : ""}`}>
        <p className="font-mono text-[11px] italic text-gray-300">
          Comment deleted
        </p>
      </div>
    );
  }

  return (
    <div className={`group py-2.5 ${isReply ? "pl-8" : ""}`}>
      <div className="flex items-start gap-2">
        <OsCommentAvatar author={comment.author} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-sans text-[12.5px] font-semibold text-alloro-textDark">
              {authorLabel(comment.author)}
            </span>
            <span
              className="font-mono text-[10px] tabular-nums text-gray-400"
              title={formatOsDateTime(comment.created_at)}
            >
              {formatOsRelativeTime(comment.created_at)}
            </span>
            {comment.version_tag !== null && (
              <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-gray-300">
                v{comment.version_tag}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {canReply && !isReply && (
                <OsCommentAction
                  icon={CornerDownRight}
                  label="Reply"
                  onClick={() => setIsReplyOpen((open) => !open)}
                />
              )}
              {canModify && (
                <>
                  <OsCommentAction
                    icon={Pencil}
                    label="Edit"
                    onClick={() => setIsEditing((editing) => !editing)}
                  />
                  <OsCommentAction
                    icon={Trash2}
                    label="Delete"
                    onClick={() => onDelete(comment.id)}
                  />
                </>
              )}
            </span>
          </div>

          {isEditing ? (
            <OsCommentComposer
              initialValue={comment.body_md}
              placeholder="Edit comment…"
              submitLabel="Save"
              autoFocus
              isSubmitting={isSavingEdit}
              onSubmit={(body) => {
                onEdit(comment.id, body);
                setIsEditing(false);
              }}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <div className="mt-0.5 text-[14px]">
              <OsMarkdownBody markdown={comment.body_md} />
            </div>
          )}

          {isReplyOpen && !isReply && (
            <OsCommentComposer
              placeholder="Write a reply…"
              submitLabel="Reply"
              autoFocus
              isSubmitting={isReplying}
              onSubmit={(body) => {
                onReply(comment.id, body);
                setIsReplyOpen(false);
              }}
              onCancel={() => setIsReplyOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
