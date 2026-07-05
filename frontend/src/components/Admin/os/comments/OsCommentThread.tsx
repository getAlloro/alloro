import { useState } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";
import { useAuth } from "../../../../hooks/useAuth";
import type { OsCommentNode } from "../../../../api/admin-os";
import {
  useAdminOsComments,
  useCreateOsComment,
  useDeleteOsComment,
  useEditOsComment,
} from "../../../../hooks/queries/useAdminOsComments";
import { OsErrorState } from "../shared/OsErrorState";
import { OsCommentComposer } from "./OsCommentComposer";
import { OsCommentItem } from "./OsCommentItem";

/**
 * Comments section of the read rail (plans/07042026-alloro-os-admin-port P7 T2)
 * — replaces the P3 placeholder. Threaded (one reply level), hairline-divided,
 * with a collapse chevron in the same header language as History/Related. The
 * root composer always shows; empty state is "No comments yet" + the composer.
 * Server state is React Query only (§15.1); errors surface via toast (§16.3).
 * Edit/Delete render only on the viewer's own comments, matched by author
 * email — but the SERVER is the real author gate (§5.4). No task fields.
 */

function OsCommentSkeleton() {
  return (
    <div className="space-y-3 pl-6" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-start gap-2">
          <div className="h-6 w-6 shrink-0 rounded-full bg-gray-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-24 rounded bg-gray-100" />
            <div className="h-2.5 w-full rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function countComments(comments: OsCommentNode[]): number {
  return comments.reduce(
    (total, root) =>
      total +
      (root.deleted ? 0 : 1) +
      root.replies.filter((reply) => !reply.deleted).length,
    0,
  );
}

export function OsCommentThread({ documentId }: { documentId: string }) {
  const { userProfile } = useAuth();
  const viewerEmail = userProfile?.email ?? null;

  const commentsQuery = useAdminOsComments(documentId);
  const createComment = useCreateOsComment(documentId);
  const editComment = useEditOsComment(documentId);
  const deleteComment = useDeleteOsComment(documentId);

  const [isOpen, setIsOpen] = useState(true);

  const comments = commentsQuery.data?.comments ?? [];
  const commentCount = countComments(comments);

  const canModify = (authorEmail: string | null | undefined): boolean =>
    Boolean(viewerEmail && authorEmail && authorEmail === viewerEmail);

  return (
    <section className="py-4">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 text-sm font-semibold text-gray-700"
      >
        <MessageSquare className="h-4 w-4" strokeWidth={1.5} />
        Comments
        {commentCount > 0 && (
          <span className="font-mono text-[11px] font-normal text-gray-400">
            {commentCount}
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 text-gray-400 transition-transform duration-150 ${
            isOpen ? "" : "-rotate-90"
          }`}
          strokeWidth={1.5}
        />
      </button>

      {isOpen && (
        <div className="mt-2 pl-6">
          {commentsQuery.isLoading && <OsCommentSkeleton />}
          {commentsQuery.isError && (
            <OsErrorState
              message="Couldn't load comments"
              onRetry={() => void commentsQuery.refetch()}
            />
          )}

          {commentsQuery.data && (
            <>
              {comments.length === 0 ? (
                <p className="font-mono text-[11px] text-gray-300">
                  No comments yet.
                </p>
              ) : (
                <div className="divide-y divide-line-soft">
                  {comments.map((root) => (
                    <div key={root.id}>
                      <OsCommentItem
                        comment={root}
                        isReply={false}
                        canReply
                        canModify={canModify(root.author?.email)}
                        isSavingEdit={editComment.isPending}
                        isReplying={createComment.isPending}
                        onEdit={(commentId, body) =>
                          editComment.mutate({ commentId, bodyMd: body })
                        }
                        onDelete={(commentId) => deleteComment.mutate(commentId)}
                        onReply={(parentCommentId, body) =>
                          createComment.mutate({
                            bodyMd: body,
                            parentCommentId,
                          })
                        }
                      />
                      {root.replies.map((reply) => (
                        <OsCommentItem
                          key={reply.id}
                          comment={reply}
                          isReply
                          canReply={false}
                          canModify={canModify(reply.author?.email)}
                          isSavingEdit={editComment.isPending}
                          isReplying={createComment.isPending}
                          onEdit={(commentId, body) =>
                            editComment.mutate({ commentId, bodyMd: body })
                          }
                          onDelete={(commentId) =>
                            deleteComment.mutate(commentId)
                          }
                          onReply={() => undefined}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <OsCommentComposer
                isSubmitting={createComment.isPending}
                onSubmit={(body) =>
                  createComment.mutate({ bodyMd: body, parentCommentId: null })
                }
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
