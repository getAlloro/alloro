import { useMemo } from "react";
import type { GbpReview, GbpWorkItem } from "../../../api/gbpAutomation";
import { GbpReplyWorkItemCard } from "./GbpReplyWorkItemCard";

export type GbpClientDraftsPanelProps = {
  reviews: GbpReview[];
  workItems: GbpWorkItem[];
  isBusy: boolean;
  onSave: (workItemId: string, draftContent: string) => void;
  onApprove: (workItemId: string, approvedContent: string) => void;
  onDeploy: (workItemId: string) => void;
  onRetry: (workItemId: string) => void;
  onDelete: (workItemId: string) => void | Promise<unknown>;
};

export function GbpClientDraftsPanel({
  reviews,
  workItems,
  isBusy,
  onSave,
  onApprove,
  onDeploy,
  onRetry,
  onDelete,
}: GbpClientDraftsPanelProps) {
  const reviewById = useMemo(
    () => new Map(reviews.map((review) => [review.id, review])),
    [reviews]
  );
  const activeWorkItems = useMemo(
    () =>
      workItems.filter(
        (item) =>
          item.status !== "published" &&
          item.status !== "rejected" &&
          (!item.content_type || item.content_type === "review_reply")
      ),
    [workItems]
  );
  const postDrafts = useMemo(
    () =>
      workItems.filter(
        (item) =>
          item.content_type === "local_post" &&
          item.status !== "published" &&
          item.status !== "rejected"
      ),
    [workItems]
  );

  return (
    <div className="mt-4 space-y-3">
      {activeWorkItems.map((item) => (
        <GbpReplyWorkItemCard
          key={item.id}
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
      ))}
      {activeWorkItems.length === 0 && (
        <p className="rounded-[10px] bg-slate-50 p-3 text-sm font-bold text-slate-500">
          No review reply drafts are waiting right now.
        </p>
      )}
      {postDrafts.length > 0 && (
        <div className="space-y-2">
          <p className="pt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Post drafts
          </p>
          {postDrafts.map((item) => (
            <div key={item.id} className="rounded-[12px] border border-slate-200 bg-white p-4">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Local post
              </span>
              <p className="mt-3 whitespace-pre-wrap rounded-[10px] bg-slate-50 p-3 text-sm font-medium leading-6 text-alloro-navy">
                {item.draft_content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
