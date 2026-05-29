import { useState } from "react";

export type GbpLatestReviewQuoteProps = {
  text: string | null;
};

const REVIEW_PREVIEW_LIMIT = 190;

export function GbpLatestReviewQuote({ text }: GbpLatestReviewQuoteProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const reviewText = text?.trim() || "No written review text.";
  const canExpand = reviewText.length > REVIEW_PREVIEW_LIMIT;

  return (
    <div className="mt-2 rounded-[10px] border border-line-soft bg-alloro-navy/[0.02] px-3 py-2.5">
      <p className={`text-[11px] font-medium leading-5 text-alloro-navy/65 ${!isExpanded ? "line-clamp-3" : ""}`}>
        {reviewText}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className="mt-1.5 text-[9px] font-black uppercase tracking-widest text-alloro-orange transition hover:text-alloro-orange/80 focus:outline-none focus:ring-2 focus:ring-alloro-orange/25"
        >
          {isExpanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
