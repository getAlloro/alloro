export type GbpLatestReviewEmptyStateProps = {
  onOpenEngage: () => void;
  queueRemaining: number;
};

export function GbpLatestReviewEmptyState({
  onOpenEngage,
  queueRemaining,
}: GbpLatestReviewEmptyStateProps) {
  const isCaughtUp = queueRemaining <= 0;

  return (
    <aside className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-[12px] border border-line-soft bg-white p-6 text-center shadow-[0_12px_28px_rgba(17,21,28,0.07)]">
      <p className="font-display text-xl font-medium text-alloro-navy">
        {isCaughtUp ? "You're all caught up" : "Continue in Alloro Engage"}
      </p>
      <p className="mt-2 max-w-xs text-sm font-medium leading-6 text-alloro-navy/60">
        {isCaughtUp
          ? "Every replyable Google review is handled right now."
          : `${queueRemaining.toLocaleString()} reviews still need a reply beyond this quick queue.`}
      </p>
      <button
        type="button"
        onClick={onOpenEngage}
        className="mt-5 inline-flex items-center justify-center rounded-[10px] bg-alloro-navy px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-alloro-navy/90"
      >
        Manage reviews
      </button>
    </aside>
  );
}
