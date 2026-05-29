export type GbpReviewListSkeletonProps = {
  rows?: number;
  hasReplyPreview?: boolean;
};

export function GbpReviewListSkeleton({
  rows = 4,
  hasReplyPreview = false,
}: GbpReviewListSkeletonProps) {
  return (
    <div className="space-y-3" aria-live="polite" aria-label="Loading reviews">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="min-h-[128px] rounded-[10px] border border-slate-200 bg-slate-50 p-3"
        >
          <div className="flex items-center gap-2">
            <div className="h-3 w-20 animate-pulse rounded-full bg-slate-200" />
            <div className="h-5 w-32 animate-pulse rounded-full bg-white" />
          </div>
          <div className="mt-3 h-3 w-36 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full animate-pulse rounded-full bg-slate-200" />
            <div className="h-3 w-5/6 animate-pulse rounded-full bg-slate-200" />
          </div>
          {hasReplyPreview && (
            <div className="mt-4 rounded-[9px] bg-white p-3">
              <div className="h-3 w-11/12 animate-pulse rounded-full bg-slate-200" />
              <div className="mt-2 h-3 w-2/3 animate-pulse rounded-full bg-slate-200" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
