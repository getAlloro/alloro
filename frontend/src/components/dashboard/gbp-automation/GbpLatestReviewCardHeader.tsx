import { motion } from "framer-motion";
import { Star } from "lucide-react";
import type { GbpReview } from "../../../api/gbpAutomation";

export type GbpLatestReviewCardHeaderProps = {
  review: GbpReview;
  reviewDate: string | null;
  remainingCount: number;
};

export function GbpLatestReviewCardHeader({
  review,
  reviewDate,
  remainingCount,
}: GbpLatestReviewCardHeaderProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-stretch gap-3">
        <div className="flex min-h-[54px] shrink-0 items-center pr-1">
          <motion.p
            key={remainingCount}
            className="font-display text-[34px] font-medium leading-none text-alloro-orange tabular-nums"
            animate={{ scale: [1, 1.18, 1] }}
            transition={{ duration: 0.36, ease: "easeOut" }}
          >
            {remainingCount.toLocaleString()}
          </motion.p>
        </div>
        <div className="min-w-0 self-center">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Latest review reply</p>
          <p className="mt-0.5 text-[13px] font-bold text-alloro-navy">{review.reviewer_name || "Google reviewer"}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 text-alloro-orange">
        {Array.from({ length: Math.max(1, Math.min(5, review.stars)) }).map((_, index) => (
          <Star key={index} size={12} fill="currentColor" />
        ))}
        {reviewDate && (
          <span className="ml-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
            {reviewDate}
          </span>
        )}
      </div>
    </div>
  );
}
