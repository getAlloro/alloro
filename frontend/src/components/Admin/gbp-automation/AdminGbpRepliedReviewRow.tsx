import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { GbpReview } from "../../../api/gbpAutomation";

export type AdminGbpRepliedReviewRowProps = {
  review: GbpReview;
  isExpanded: boolean;
  isBusy: boolean;
  onToggle: () => void;
  onUpdatePublishedReply: (input: { reviewId: string; replyContent: string }) => Promise<unknown>;
  onDeletePublishedReply: (reviewId: string) => Promise<unknown>;
};

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function AdminGbpRepliedReviewRow({
  review,
  isExpanded,
  isBusy,
  onToggle,
  onUpdatePublishedReply,
  onDeletePublishedReply,
}: AdminGbpRepliedReviewRowProps) {
  const [value, setValue] = useState(review.reply_text || "");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDirty = value.trim() !== (review.reply_text || "").trim();

  useEffect(() => {
    setValue(review.reply_text || "");
    setIsConfirmingDelete(false);
    setIsDeleting(false);
  }, [review.id, review.reply_text]);

  const handleDeleteClick = async () => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }

    setIsDeleting(true);
    try {
      await onDeletePublishedReply(review.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-[10px] border border-slate-200 bg-slate-50 p-3" onClick={onToggle}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-alloro-orange">
              {Array.from({ length: review.stars }).map((_, index) => (
                <Star key={index} size={12} fill="currentColor" />
              ))}
            </div>
            {dateLabel(review.reply_date) && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                Replied {dateLabel(review.reply_date)}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-bold text-alloro-navy">
            {review.reviewer_name || "Google reviewer"}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
            {review.text || "No written review text."}
          </p>
          {!isExpanded && (
            <p className="mt-2 line-clamp-2 rounded-lg bg-white p-2 text-xs font-semibold leading-5 text-slate-600">
              {review.reply_text || "No reply text stored."}
            </p>
          )}
        </div>
      </div>
      {isExpanded && (
        <div
          className="mt-3 rounded-lg border border-gray-200 bg-white p-3"
          onClick={(event) => event.stopPropagation()}
        >
          <textarea
            value={value}
            disabled={isBusy}
            onChange={(event) => setValue(event.target.value)}
            className="min-h-[92px] w-full resize-y rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm font-medium leading-6 text-gray-700 outline-none transition focus:border-alloro-orange disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isBusy || !isDirty || !value.trim()}
              onClick={() => onUpdatePublishedReply({ reviewId: review.id, replyContent: value })}
              className="rounded-lg bg-alloro-orange px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Update GBP
            </button>
            <button
              type="button"
              disabled={isBusy || isDeleting}
              onClick={handleDeleteClick}
              className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? "Deleting..." : isConfirmingDelete ? "Confirm delete" : "Delete reply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
