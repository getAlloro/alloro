import { useMemo, useState } from "react";
import type { GbpReview, GbpReviewMonthBucket } from "../../../api/gbpAutomation";
import { GbpReviewListSkeleton } from "../../dashboard/gbp-automation/GbpReviewListSkeleton";
import { GbpReviewMonthSidebar } from "../../dashboard/gbp-automation/GbpReviewMonthSidebar";
import { AdminGbpRepliedReviewRow } from "./AdminGbpRepliedReviewRow";

type RepliedRange = "last30" | "all";

const RANGE_OPTIONS: Array<{ key: RepliedRange; label: string }> = [
  { key: "last30", label: "Last 30 days" },
  { key: "all", label: "All loaded" },
];

function isRecentReply(review: GbpReview): boolean {
  const value = review.reply_date || review.review_created_at;
  if (!value) return false;
  const date = new Date(value).getTime();
  return Number.isFinite(date) && date >= Date.now() - 30 * 24 * 60 * 60 * 1000;
}

function reviewCountLabel(count: number): string {
  return `${count} Review${count === 1 ? "" : "s"}`;
}

function selectedMonthLabel(months: GbpReviewMonthBucket[], selectedMonth: string | null): string {
  return months.find((month) => month.month === selectedMonth)?.label || "selected month";
}

function selectedMonthCount(months: GbpReviewMonthBucket[], selectedMonth: string | null): number {
  return months.find((month) => month.month === selectedMonth)?.count || 0;
}

export function AdminGbpRepliedReviewsPanel({
  reviews,
  monthBuckets,
  selectedMonth,
  isLoading,
  isBusy,
  onUpdatePublishedReply,
  onDeletePublishedReply,
  onSelectedMonthChange,
}: {
  reviews: GbpReview[];
  monthBuckets: GbpReviewMonthBucket[];
  selectedMonth: string | null;
  isLoading: boolean;
  isBusy: boolean;
  onUpdatePublishedReply: (input: { reviewId: string; replyContent: string }) => Promise<unknown>;
  onDeletePublishedReply: (reviewId: string) => Promise<unknown>;
  onSelectedMonthChange: (month: string | null) => void;
}) {
  const [range, setRange] = useState<RepliedRange>("last30");
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const visibleReviews = useMemo(
    () => {
      if (range === "last30") return reviews.filter(isRecentReply);
      return selectedMonth ? reviews : [];
    },
    [range, reviews, selectedMonth]
  );
  const isAllLoaded = range === "all";
  const displayedReviewCount =
    isLoading && isAllLoaded
      ? selectedMonthCount(monthBuckets, selectedMonth)
      : visibleReviews.length;

  const handleRangeChange = (nextRange: RepliedRange) => {
    setRange(nextRange);
    if (nextRange !== "all") {
      onSelectedMonthChange(null);
      return;
    }
    onSelectedMonthChange(selectedMonth || monthBuckets[0]?.month || null);
  };

  return (
    <div className="mt-4 space-y-3">
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
              hasReplyPreview
            />
          ) : (
            visibleReviews.map((review) => (
              <AdminGbpRepliedReviewRow
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
            <p className="rounded-lg bg-gray-50 p-3 text-sm font-medium text-gray-500">
              No replied GBP reviews match this view.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
