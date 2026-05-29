import { useMemo, useState } from "react";
import type {
  GbpReview,
  GbpReviewMonthBucket,
  GbpReplyOpsMetrics,
  GbpWorkItem,
} from "../../../api/gbpAutomation";
import { GbpEligibleReviewRow } from "../../dashboard/gbp-automation/GbpEligibleReviewRow";
import { GbpReviewListSkeleton } from "../../dashboard/gbp-automation/GbpReviewListSkeleton";
import { GbpReviewMonthSidebar } from "../../dashboard/gbp-automation/GbpReviewMonthSidebar";
import { GbpReviewReplySlot } from "../../dashboard/gbp-automation/GbpReviewReplySlot";
import type { DraftDeployInput, DraftSaveInput } from "./AdminGbpReviewsPanel";
type ReviewRange = "latest" | "last30" | "all";
const RANGE_OPTIONS: Array<{ key: ReviewRange; label: string }> = [
  { key: "latest", label: "Latest 10" },
  { key: "last30", label: "Last 30 days" },
  { key: "all", label: "All loaded" },
];
const DRAFT_AVAILABLE_STATUSES = new Set(["draft", "awaiting_approval", "approved"]);
const HIDDEN_FROM_NEEDS_REPLY_STATUSES = new Set(["deploying", "published"]);
const ACTIVE_REVIEW_WORK_ITEM_STATUSES = new Set(["draft", "awaiting_approval", "approved", "deploying"]);
const WORK_ITEM_STATUS_PRIORITY: Record<string, number> = {
  deploying: 4,
  approved: 3,
  awaiting_approval: 2,
  draft: 1,
};
function isRecentReview(review: GbpReview): boolean {
  if (!review.review_created_at) return false;
  const createdAt = new Date(review.review_created_at).getTime();
  return Number.isFinite(createdAt) && createdAt >= Date.now() - 30 * 24 * 60 * 60 * 1000;
}

function reviewCountLabel(count: number): string {
  return `${count} Review${count === 1 ? "" : "s"}`;
}
const selectedMonthLabel = (months: GbpReviewMonthBucket[], selectedMonth: string | null): string =>
  months.find((month) => month.month === selectedMonth)?.label || "selected month";
const selectedMonthCount = (months: GbpReviewMonthBucket[], selectedMonth: string | null): number =>
  months.find((month) => month.month === selectedMonth)?.count || 0;

function workItemTimestamp(item: GbpWorkItem): number {
  const time = item.created_at ? new Date(item.created_at).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function shouldUseWorkItem(current: GbpWorkItem | undefined, next: GbpWorkItem): boolean {
  if (!current) return true;
  const nextPriority = WORK_ITEM_STATUS_PRIORITY[next.status] || 0;
  const currentPriority = WORK_ITEM_STATUS_PRIORITY[current.status] || 0;
  if (nextPriority !== currentPriority) return nextPriority > currentPriority;
  return workItemTimestamp(next) > workItemTimestamp(current);
}

export function AdminGbpNeedsReplyPanel({
  reviews,
  workItems,
  monthBuckets,
  selectedMonth,
  isReady,
  isLoading,
  isBusy,
  replyOps,
  onGenerate,
  onCreatePostDraft,
  onEscalationChange,
  onSaveDraft,
  onDeployDraft,
  onSelectedMonthChange,
}: {
  reviews: GbpReview[];
  workItems: GbpWorkItem[];
  monthBuckets: GbpReviewMonthBucket[];
  selectedMonth: string | null;
  isReady: boolean;
  isLoading: boolean;
  isBusy: boolean;
  replyOps?: GbpReplyOpsMetrics;
  onGenerate: (reviewId: string) => Promise<unknown>;
  onCreatePostDraft?: (reviewId: string) => Promise<unknown>;
  onEscalationChange?: (
    reviewId: string,
    status: "open" | "resolved" | "dismissed",
    reason: string
  ) => Promise<unknown>;
  onSaveDraft: (input: DraftSaveInput) => Promise<unknown>;
  onDeployDraft: (input: DraftDeployInput) => Promise<unknown>;
  onSelectedMonthChange: (month: string | null) => void;
}) {
  const [range, setRange] = useState<ReviewRange>("latest");
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [generatingReviewId, setGeneratingReviewId] = useState<string | null>(null);
  const workItemByReviewId = useMemo(
    () => {
      const itemsByReviewId = new Map<string, GbpWorkItem>();
      workItems.forEach((item) => {
        if (item.content_type && item.content_type !== "review_reply") return;
        if (!item.source_review_id) return;
        if (!ACTIVE_REVIEW_WORK_ITEM_STATUSES.has(item.status)) return;
        const current = itemsByReviewId.get(item.source_review_id);
        if (shouldUseWorkItem(current, item)) itemsByReviewId.set(item.source_review_id, item);
      });
      return itemsByReviewId;
    },
    [workItems]
  );
  const actionableReviews = useMemo(
    () =>
      reviews.filter((review) => {
        const item = workItemByReviewId.get(review.id);
        if (review.has_reply) return false;
        return !item || !HIDDEN_FROM_NEEDS_REPLY_STATUSES.has(item.status);
      }),
    [reviews, workItemByReviewId]
  );
  const visibleReviews = useMemo(() => {
    if (range === "last30") return actionableReviews.filter(isRecentReview);
    if (range === "all") return selectedMonth ? actionableReviews : [];
    return actionableReviews.slice(0, 10);
  }, [actionableReviews, range, selectedMonth]);
  const isAllLoaded = range === "all";
  const displayedReviewCount = isLoading && isAllLoaded
    ? selectedMonthCount(monthBuckets, selectedMonth)
    : visibleReviews.length;
  const handleRangeChange = (nextRange: ReviewRange) => {
    setRange(nextRange);
    if (nextRange !== "all") {
      onSelectedMonthChange(null);
      return;
    }
    onSelectedMonthChange(selectedMonth || monthBuckets[0]?.month || null);
  };
  return (
    <div className="mt-4 space-y-3">
      {replyOps && (
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["Waiting 7d+", replyOps.unrepliedOver7d],
            ["Waiting 30d+", replyOps.unrepliedOver30d],
            ["Last 30d", replyOps.unrepliedLast30d],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {label}
              </p>
              <p className="mt-1 text-lg font-black text-gray-900">
                {Number(value).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-xs font-bold text-gray-500">
          {reviewCountLabel(displayedReviewCount)}
        </span>
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => handleRangeChange(option.key)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
              range === option.key
                ? "bg-slate-100 text-alloro-navy ring-1 ring-slate-200"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {isAllLoaded && (
        <p className="text-right text-[11px] font-bold text-slate-500">
          Showing {selectedMonthLabel(monthBuckets, selectedMonth)}
        </p>
      )}
      <div className={isAllLoaded ? "grid gap-3 lg:grid-cols-[190px_1fr]" : "space-y-3"}>
        {isAllLoaded && (
          <GbpReviewMonthSidebar
            months={monthBuckets}
            selectedMonth={selectedMonth}
            onMonthChange={onSelectedMonthChange}
          />
        )}
        <div className="space-y-3" aria-busy={isLoading}>
          {isLoading ? (
            <GbpReviewListSkeleton
              rows={
                isAllLoaded ? Math.max(selectedMonthCount(monthBuckets, selectedMonth), 4) : 4
              }
            />
          ) : (
            visibleReviews.map((review) => {
              const item = workItemByReviewId.get(review.id);
              const isExpanded = expandedReviewId === review.id;
              const isDeploying = item?.status === "deploying";
              const isGenerating = generatingReviewId === review.id;
              return (
                <div
                  key={review.id}
                  onClick={() => setExpandedReviewId(isExpanded ? null : review.id)}
                >
                  <GbpEligibleReviewRow
                    review={review}
                    isDisabled={!isReady || (isBusy && !isGenerating) || isDeploying}
                    hasDraftAvailable={Boolean(
                      item && DRAFT_AVAILABLE_STATUSES.has(item.status)
                    )}
                    actionLabel="Reply"
                    actionTone="navy"
                    reviewSlot={
                      isExpanded ? (
                        <GbpReviewReplySlot
                          review={review}
                          item={item}
                          isBusy={isBusy}
                          isGenerating={isGenerating}
                          onGenerateDraft={async (reviewId) => {
                            setGeneratingReviewId(reviewId);
                            try {
                              await onGenerate(reviewId);
                            } finally {
                              setGeneratingReviewId(null);
                            }
                          }}
                          onSaveDraft={onSaveDraft}
                          onDeployDraft={onDeployDraft}
                        />
                      ) : null
                    }
                    onGenerate={(reviewId) =>
                      setExpandedReviewId(isExpanded ? null : reviewId)
                    }
                    onCreatePostDraft={
                      onCreatePostDraft
                        ? (reviewId) => {
                            void onCreatePostDraft(reviewId);
                          }
                        : undefined
                    }
                    onEscalationChange={
                      onEscalationChange
                        ? (reviewId, status, reason) => {
                            void onEscalationChange(reviewId, status, reason);
                          }
                        : undefined
                    }
                  />
                </div>
              );
            })
          )}
          {!isLoading && visibleReviews.length === 0 && (
            <p className="rounded-lg bg-gray-50 p-3 text-sm font-medium text-gray-500">
              No unreplied OAuth reviews match this view.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
