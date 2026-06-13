import { useMemo, useState } from "react";
import type { GbpReview, GbpReviewMonthBucket } from "../../../api/gbpAutomation";
import { GbpClientRepliedReviewRow } from "./GbpClientRepliedReviewRow";
import { GbpReviewListSkeleton } from "./GbpReviewListSkeleton";
import { GbpReviewMonthSidebar } from "./GbpReviewMonthSidebar";
import { GbpReviewRangeControls, type GbpReviewRange } from "./GbpReviewRangeControls";

export type GbpClientRepliedReviewsPanelProps = {
  reviews: GbpReview[];
  monthBuckets: GbpReviewMonthBucket[];
  selectedMonth: string | null;
  isLoading: boolean;
  isBusy: boolean;
  onUpdatePublishedReply: (input: { reviewId: string; replyContent: string }) => Promise<unknown>;
  onDeletePublishedReply: (reviewId: string) => Promise<unknown>;
  onSelectedMonthChange: (month: string | null) => void;
};

function isRecentReply(review: GbpReview): boolean {
  const value = review.reply_date || review.review_created_at;
  if (!value) return false;
  const date = new Date(value).getTime();
  return Number.isFinite(date) && date >= Date.now() - 30 * 24 * 60 * 60 * 1000;
}

function selectedMonthLabel(months: GbpReviewMonthBucket[], selectedMonth: string | null): string {
  return months.find((month) => month.month === selectedMonth)?.label || "selected month";
}

function selectedMonthCount(months: GbpReviewMonthBucket[], selectedMonth: string | null): number {
  return months.find((month) => month.month === selectedMonth)?.count || 0;
}

export function GbpClientRepliedReviewsPanel({
  reviews,
  monthBuckets,
  selectedMonth,
  isLoading,
  isBusy,
  onUpdatePublishedReply,
  onDeletePublishedReply,
  onSelectedMonthChange,
}: GbpClientRepliedReviewsPanelProps) {
  const [range, setRange] = useState<GbpReviewRange>("latest");
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const visibleReviews = useMemo(() => {
    if (range === "last30") return reviews.filter(isRecentReply);
    if (range === "all") return selectedMonth ? reviews : [];
    return reviews.slice(0, 10);
  }, [range, reviews, selectedMonth]);
  const isAllLoaded = range === "all";
  const handleRangeChange = (nextRange: GbpReviewRange) => {
    setRange(nextRange);
    onSelectedMonthChange(
      nextRange === "all" ? selectedMonth || monthBuckets[0]?.month || null : null
    );
  };

  return (
    <div className="space-y-3">
      <GbpReviewRangeControls
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
              hasReplyPreview
            />
          ) : (
            visibleReviews.map((review) => (
              <GbpClientRepliedReviewRow
                key={review.id}
                review={review}
                isExpanded={expandedReviewId === review.id}
                isBusy={isBusy}
                onToggle={() =>
                  setExpandedReviewId(expandedReviewId === review.id ? null : review.id)
                }
                onUpdatePublishedReply={onUpdatePublishedReply}
                onDeletePublishedReply={onDeletePublishedReply}
              />
            ))
          )}
          {!isLoading && visibleReviews.length === 0 && (
            <p className="rounded-[10px] bg-slate-50 p-3 text-sm font-bold text-slate-500">
              No replied Google reviews match this view.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
