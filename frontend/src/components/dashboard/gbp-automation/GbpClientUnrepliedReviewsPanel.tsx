import { useMemo, useState } from "react";
import type {
  GbpReview,
  GbpReviewMonthBucket,
  GbpReplyOpsMetrics,
  GbpWorkItem,
} from "../../../api/gbpAutomation";
import { GbpEligibleReviewRow } from "./GbpEligibleReviewRow";
import { GbpReviewListSkeleton } from "./GbpReviewListSkeleton";
import { GbpReviewMonthSidebar } from "./GbpReviewMonthSidebar";
import { GbpReviewRangeControls, type GbpReviewRange } from "./GbpReviewRangeControls";
import {
  GbpReviewReplySlot,
  type GbpDraftDeployInput,
  type GbpDraftSaveInput,
} from "./GbpReviewReplySlot";
import { GbpClientReplyOpsCards } from "./GbpClientReplyOpsCards";

export type GbpClientUnrepliedReviewsPanelProps = {
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
  onSaveDraft: (input: GbpDraftSaveInput) => Promise<unknown>;
  onDeployDraft: (input: GbpDraftDeployInput) => Promise<unknown>;
  onSelectedMonthChange: (month: string | null) => void;
};

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

function selectedMonthCount(months: GbpReviewMonthBucket[], selectedMonth: string | null): number {
  return months.find((month) => month.month === selectedMonth)?.count || 0;
}

function selectedMonthLabel(months: GbpReviewMonthBucket[], selectedMonth: string | null): string {
  return months.find((month) => month.month === selectedMonth)?.label || "selected month";
}

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

export function GbpClientUnrepliedReviewsPanel({
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
}: GbpClientUnrepliedReviewsPanelProps) {
  const [range, setRange] = useState<GbpReviewRange>("latest");
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [generatingReviewId, setGeneratingReviewId] = useState<string | null>(null);
  const workItemByReviewId = useMemo(() => {
    const itemsByReviewId = new Map<string, GbpWorkItem>();
    workItems.forEach((item) => {
      if (item.content_type && item.content_type !== "review_reply") return;
      if (!item.source_review_id) return;
      if (!ACTIVE_REVIEW_WORK_ITEM_STATUSES.has(item.status)) return;
      const current = itemsByReviewId.get(item.source_review_id);
      if (shouldUseWorkItem(current, item)) itemsByReviewId.set(item.source_review_id, item);
    });
    return itemsByReviewId;
  }, [workItems]);
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
  const displayedReviewCount =
    isLoading && isAllLoaded
      ? selectedMonthCount(monthBuckets, selectedMonth)
      : visibleReviews.length;
  const handleRangeChange = (nextRange: GbpReviewRange) => {
    setRange(nextRange);
    onSelectedMonthChange(
      nextRange === "all" ? selectedMonth || monthBuckets[0]?.month || null : null
    );
  };

  return (
    <div className="space-y-3">
      {replyOps && <GbpClientReplyOpsCards replyOps={replyOps} />}
      <GbpReviewRangeControls
        count={displayedReviewCount}
        range={range}
        onRangeChange={handleRangeChange}
      />
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
              rows={isAllLoaded ? Math.max(selectedMonthCount(monthBuckets, selectedMonth), 4) : 4}
            />
          ) : (
            visibleReviews.map((review) => {
              const item = workItemByReviewId.get(review.id);
              const isExpanded = expandedReviewId === review.id;
              const isDeploying = item?.status === "deploying";
              const isGenerating = generatingReviewId === review.id;
              return (
                <GbpEligibleReviewRow
                  key={review.id}
                  review={review}
                  isDisabled={!isReady || (isBusy && !isGenerating) || isDeploying}
                  hasDraftAvailable={Boolean(item && DRAFT_AVAILABLE_STATUSES.has(item.status))}
                  actionLabel="Reply"
                  actionTone="navy"
                  reviewSlot={
                    isExpanded ? (
                      <GbpReviewReplySlot
                        review={review}
                        item={item}
                        isBusy={isBusy}
                        isGenerating={isGenerating}
                        onSaveDraft={onSaveDraft}
                        onDeployDraft={onDeployDraft}
                        onGenerateDraft={async (reviewId) => {
                          setGeneratingReviewId(reviewId);
                          try {
                            await onGenerate(reviewId);
                          } finally {
                            setGeneratingReviewId(null);
                          }
                        }}
                      />
                    ) : null
                  }
                  onGenerate={(reviewId) => setExpandedReviewId(isExpanded ? null : reviewId)}
                  onCreatePostDraft={
                    onCreatePostDraft
                      ? (reviewId) => void onCreatePostDraft(reviewId)
                      : undefined
                  }
                  onEscalationChange={
                    onEscalationChange
                      ? (reviewId, status, reason) => void onEscalationChange(reviewId, status, reason)
                      : undefined
                  }
                />
              );
            })
          )}
          {!isLoading && visibleReviews.length === 0 && (
            <p className="rounded-[10px] bg-slate-50 p-3 text-sm font-bold text-slate-500">
              No unreplied Google reviews match this view.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
