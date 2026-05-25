import { useState, type ReactNode } from "react";
import { Loader2, MessageSquareText, Sparkles, Star } from "lucide-react";
import type { GbpReview } from "../../../api/gbpAutomation";

export type GbpEligibleReviewRowProps = {
  review: GbpReview;
  isDisabled: boolean;
  isLoading?: boolean;
  hasDraftAvailable?: boolean;
  actionLabel?: string;
  actionTone?: "orange" | "navy";
  reviewSlot?: ReactNode;
  onGenerate: (reviewId: string) => void;
  onCreatePostDraft?: (reviewId: string) => void;
  onEscalationChange?: (
    reviewId: string,
    status: "open" | "resolved" | "dismissed",
    reason: string
  ) => void;
};

function reviewDateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function GbpEligibleReviewRow({
  review,
  isDisabled,
  isLoading = false,
  hasDraftAvailable = false,
  actionLabel = "Draft",
  actionTone = "orange",
  reviewSlot,
  onGenerate,
}: GbpEligibleReviewRowProps) {
  const dateLabel = reviewDateLabel(review.review_created_at);
  const reviewText = review.text || "No written review text.";
  const canExpandReview = Boolean(review.text && reviewText.length > 180);
  const [isReviewExpanded, setIsReviewExpanded] = useState(false);
  const isReplyAction = actionLabel.toLowerCase().includes("reply");
  const actionClass =
    actionTone === "navy"
      ? "bg-alloro-navy hover:bg-alloro-navy/90"
      : "bg-alloro-orange hover:bg-alloro-orange/90";

  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-alloro-orange">
              {Array.from({ length: review.stars }).map((_, index) => (
                <Star key={index} size={12} fill="currentColor" />
              ))}
            </div>
            {dateLabel && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                {dateLabel}
              </span>
            )}
            {hasDraftAvailable && (
              <span className="rounded-full bg-alloro-orange/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-alloro-orange">
                Draft available
              </span>
            )}
            {review.insight?.urgency && review.insight.urgency !== "normal" && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-700">
                {review.insight.urgency}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-bold text-alloro-navy">
            {review.reviewer_name || "Google reviewer"}
          </p>
          <p
            className={`mt-1 text-xs leading-5 text-slate-600 ${
              canExpandReview && !isReviewExpanded ? "line-clamp-2" : ""
            }`}
          >
            {reviewText}
          </p>
          {canExpandReview && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsReviewExpanded((current) => !current);
              }}
              className="mt-1 text-[11px] font-bold text-alloro-orange transition-colors hover:text-alloro-orange/80"
            >
              {isReviewExpanded ? "Show less" : "Read more"}
            </button>
          )}
          {review.insight?.themes && review.insight.themes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {review.insight.themes.slice(0, 3).map((theme) => (
                <span
                  key={theme}
                  className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold capitalize text-slate-500"
                >
                  {theme}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            disabled={isDisabled}
            aria-busy={isLoading}
            onClick={(event) => {
              event.stopPropagation();
              if (isLoading) return;
              onGenerate(review.id);
            }}
            className={`inline-flex items-center justify-center gap-1.5 rounded-[9px] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${actionClass}`}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isReplyAction ? (
              <MessageSquareText size={12} />
            ) : (
              <Sparkles size={12} />
            )}
            {isLoading ? "Generating" : actionLabel}
          </button>
        </div>
      </div>
      {reviewSlot && <div className="mt-3">{reviewSlot}</div>}
    </div>
  );
}
