import { useMemo } from "react";
import type { GbpReview, GbpWorkItem } from "../../../api/gbpAutomation";
import { GbpReplyWorkItemCard } from "./GbpReplyWorkItemCard";

export type GbpReplyDraftsPanelProps = {
  reviews: GbpReview[];
  workItems: GbpWorkItem[];
  isBusy: boolean;
  showAttempts?: boolean;
  onSave: (workItemId: string, draftContent: string) => void | Promise<unknown>;
  onApprove: (workItemId: string, approvedContent: string) => void | Promise<unknown>;
  onDeploy: (workItemId: string) => void | Promise<unknown>;
  onRetry: (workItemId: string) => void | Promise<unknown>;
  onDelete: (workItemId: string) => void | Promise<unknown>;
};

export function GbpReplyDraftsPanel({
  reviews,
  workItems,
  isBusy,
  showAttempts = false,
  onSave,
  onApprove,
  onDeploy,
  onRetry,
  onDelete,
}: GbpReplyDraftsPanelProps) {
  const reviewById = useMemo(
    () => new Map(reviews.map((review) => [review.id, review])),
    [reviews]
  );
  const replyItems = useMemo(
    () =>
      workItems.filter(
        (item) =>
          item.status !== "published" &&
          item.status !== "rejected" &&
          (!item.content_type || item.content_type === "review_reply")
      ),
    [workItems]
  );

  return (
    <div className="mt-4 space-y-3">
      {replyItems.map((item) => (
        <div key={item.id}>
          <GbpReplyWorkItemCard
            item={item}
            sourceReview={
              item.source_review_id ? reviewById.get(item.source_review_id) : undefined
            }
            isBusy={isBusy}
            onSave={onSave}
            onApprove={onApprove}
            onDeploy={onDeploy}
            onRetry={onRetry}
            onDelete={onDelete}
          />
          {showAttempts && item.attempts && item.attempts.length > 0 && (
            <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              {item.attempts.map((attempt) => (
                <p key={attempt.id}>
                  Attempt {attempt.attempt_number}: {attempt.status}
                  {attempt.error_message ? ` - ${attempt.error_message}` : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
      {replyItems.length === 0 && (
        <p className="rounded-[10px] bg-slate-50 p-3 text-sm font-bold text-slate-500">
          No reply drafts are waiting right now.
        </p>
      )}
    </div>
  );
}
