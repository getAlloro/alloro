import { useEffect, useState } from "react";

export type UseOptimisticReplyQueueParams = {
  organizationId: number | null;
  locationId?: number | null;
  needsReplyTotal: number;
  needsReplyLast30: number;
};

function isWithinLast30Days(value: string | null): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= 30 * 86_400_000;
}

export function useOptimisticReplyQueue({
  organizationId,
  locationId,
  needsReplyTotal,
  needsReplyLast30,
}: UseOptimisticReplyQueueParams) {
  const [completedReplyCount, setCompletedReplyCount] = useState(0);
  const [completedReplyLast30Count, setCompletedReplyLast30Count] = useState(0);

  useEffect(() => {
    setCompletedReplyCount(0);
    setCompletedReplyLast30Count(0);
  }, [organizationId, locationId, needsReplyTotal, needsReplyLast30]);

  const onReplyDeployed = (reviewCreatedAt: string | null) => {
    setCompletedReplyCount((current) => Math.min(needsReplyTotal, current + 1));
    if (isWithinLast30Days(reviewCreatedAt)) {
      setCompletedReplyLast30Count((current) => Math.min(needsReplyLast30, current + 1));
    }
  };

  return {
    completedReplyCount,
    displayedNeedsReplyTotal: Math.max(0, needsReplyTotal - completedReplyCount),
    displayedNeedsReplyLast30: Math.max(0, needsReplyLast30 - completedReplyLast30Count),
    onReplyDeployed,
  };
}
