import { useMemo } from "react";
import type { GbpReview, GbpWorkItem, GbpWorkItemStatus } from "../../../api/gbpAutomation";
import { GbpReplyWorkItemCard } from "../../dashboard/gbp-automation/GbpReplyWorkItemCard";

export type AdminGbpWorkItemsPanelProps = {
  workItems: GbpWorkItem[];
  reviews: GbpReview[];
  statusFilter: GbpWorkItemStatus | "all";
  statusOptions: Array<GbpWorkItemStatus | "all">;
  isBusy: boolean;
  onStatusFilterChange: (status: GbpWorkItemStatus | "all") => void;
  onSave: (workItemId: string, draftContent: string) => void;
  onApprove: (workItemId: string, approvedContent: string) => void;
  onDeploy: (workItemId: string) => void;
  onRetry: (workItemId: string) => void;
  onDelete: (workItemId: string) => void | Promise<unknown>;
};

export function AdminGbpWorkItemsPanel({
  workItems,
  reviews,
  statusFilter,
  statusOptions,
  isBusy,
  onStatusFilterChange,
  onSave,
  onApprove,
  onDeploy,
  onRetry,
  onDelete,
}: AdminGbpWorkItemsPanelProps) {
  const reviewById = useMemo(
    () => new Map(reviews.map((review) => [review.id, review])),
    [reviews]
  );
  const replyItems = useMemo(
    () => workItems.filter((item) => !item.content_type || item.content_type === "review_reply"),
    [workItems]
  );
  const postItems = useMemo(
    () => workItems.filter((item) => item.content_type === "local_post"),
    [workItems]
  );

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-bold text-gray-900">Review Reply Drafts</h3>
        <select
          value={statusFilter}
          onChange={(event) =>
            onStatusFilterChange(event.target.value as GbpWorkItemStatus | "all")
          }
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700"
        >
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

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
            {item.attempts && item.attempts.length > 0 && (
              <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
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
        {postItems.map((item) => (
          <div key={item.id} className="rounded-[12px] border border-gray-200 bg-white p-4">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-gray-500">
              Local post draft
            </span>
            <p className="mt-3 whitespace-pre-wrap rounded-[10px] bg-gray-50 p-3 text-sm font-medium leading-6 text-gray-800">
              {item.draft_content}
            </p>
          </div>
        ))}
        {replyItems.length === 0 && postItems.length === 0 && (
          <p className="rounded-lg bg-gray-50 p-3 text-sm font-medium text-gray-500">
            No work items match this filter.
          </p>
        )}
      </div>
    </section>
  );
}
