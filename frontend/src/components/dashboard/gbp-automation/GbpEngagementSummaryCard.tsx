import { motion } from "framer-motion";
import { useGbpAutomation, useGbpPublishedLocalPosts } from "../../../hooks/queries/useGbpAutomationQueries";
import { GbpEngagementActionNotice } from "./GbpEngagementActionNotice";
import { GbpEngagementInfoTip } from "./GbpEngagementInfoTip";
import { GbpEngagementMetricCard } from "./GbpEngagementMetricCard";
import { GbpLatestReviewQuickAction } from "./GbpLatestReviewQuickAction";
import { useOptimisticReplyQueue } from "./useOptimisticReplyQueue";

export type GbpEngagementSummaryCardProps = {
  agentContent?: {
    title?: string | null;
    text?: string | null;
    highlights?: string[] | null;
    sentiment?: string | null;
  } | null;
  organizationId: number | null;
  locationId?: number | null;
  onOpenEngage: () => void;
};

const POST_FRESHNESS_WINDOW_DAYS = 15;

function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function durationLabel(days: number | null): string {
  if (days === null) return "-";
  if (days < 1) return "<1 day";
  const rounded = Math.round(days);
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

function postFreshnessLabel(params: {
  postCheckPending: boolean;
  postCheckUnavailable: boolean;
  latestPostAgeDays: number | null;
}): string {
  const { postCheckPending, postCheckUnavailable, latestPostAgeDays } = params;
  if (postCheckUnavailable) return "Unavailable";
  if (postCheckPending) return "Checking";
  if (latestPostAgeDays === null) return "No post yet";
  if (latestPostAgeDays === 0) return "Today";
  return durationLabel(latestPostAgeDays);
}

function SummarySkeleton() {
  return (
    <section className="rounded-[14px] border border-line-soft bg-white p-6 shadow-premium lg:p-7">
      <div className="h-24 animate-pulse rounded-[12px] bg-slate-100" />
    </section>
  );
}

export function GbpEngagementSummaryCard({
  agentContent,
  organizationId,
  locationId,
  onOpenEngage,
}: GbpEngagementSummaryCardProps) {
  const { data, isLoading, error } = useGbpAutomation(organizationId, locationId);
  const {
    data: publishedPostsData,
    isLoading: isLoadingPublishedPosts,
    isPlaceholderData: isPublishedPostsPlaceholder,
    error: publishedPostsError,
  } = useGbpPublishedLocalPosts(organizationId, locationId, true, {
    page: 1,
    limit: 1,
  });
  const counts = data?.readiness.counts;
  const needsReplyTotal = counts?.replyable_oauth ?? 0;
  const needsReplyLast30 = counts?.replyable_oauth_last_30d || 0;
  const {
    completedReplyCount,
    displayedNeedsReplyTotal,
    displayedNeedsReplyLast30,
    onReplyDeployed,
  } = useOptimisticReplyQueue({
    organizationId,
    locationId,
    needsReplyTotal,
    needsReplyLast30,
  });

  if (!organizationId || !locationId) return null;
  if (isLoading) return <SummarySkeleton />;
  if (error || !data) return null;

  const latestPost = publishedPostsData?.posts[0];
  const latestPostAt = latestPost?.createTime || latestPost?.updateTime || null;
  const latestPostAgeDays = daysSince(latestPostAt);
  const postFreshnessKnown =
    Boolean(publishedPostsData) &&
    !isLoadingPublishedPosts &&
    !isPublishedPostsPlaceholder &&
    !publishedPostsError;
  const postNeedsAttention =
    postFreshnessKnown &&
    (latestPostAgeDays === null || latestPostAgeDays > POST_FRESHNESS_WINDOW_DAYS);
  const postCheckPending = !publishedPostsError && !postFreshnessKnown;
  const reviewNeedsAttention = displayedNeedsReplyLast30 > 0 || displayedNeedsReplyTotal > 0;
  const needsAttention = reviewNeedsAttention || postNeedsAttention;

  const infoCards = [
    {
      label: "Need replies 30d",
      value: displayedNeedsReplyLast30.toLocaleString(),
      tooltip: "Google reviews from the last 30 days that can still receive a public reply.",
      tone: displayedNeedsReplyLast30 > 0 ? "attention" : "neutral",
    },
    {
      label: "Need replies total",
      value: displayedNeedsReplyTotal.toLocaleString(),
      tooltip: "All replyable Google reviews still waiting for a response.",
      tone: displayedNeedsReplyTotal > 0 ? "attention" : "neutral",
    },
    {
      label: "Last Google post",
      value: postFreshnessLabel({
        postCheckPending,
        postCheckUnavailable: Boolean(publishedPostsError),
        latestPostAgeDays,
      }),
      tooltip: "How long it has been since the last published Google Business Profile post.",
      tone: postNeedsAttention ? "attention" : "neutral",
    },
  ] as const;

  return (
    <motion.section
      className="rounded-[14px] border border-line-soft bg-white p-6 shadow-premium lg:p-7"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <header className="mb-5 flex items-center justify-between gap-3 border-b border-line-soft pb-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alloro-orange" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-display text-[15px] font-medium leading-tight tracking-tight text-alloro-navy lg:text-base">
                Alloro Engage™
              </p>
              <GbpEngagementInfoTip />
            </div>
          </div>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <div className="flex min-w-0 flex-col justify-between gap-4 lg:min-h-[360px]">
          <GbpEngagementActionNotice
            agentContent={completedReplyCount > 0 ? null : agentContent}
            needsAttention={needsAttention}
            reviewNeedsAttention={reviewNeedsAttention}
            postNeedsAttention={postNeedsAttention}
            postCheckPending={postCheckPending}
            postCheckUnavailable={Boolean(publishedPostsError)}
            needsReplyLast30={displayedNeedsReplyLast30}
            needsReplyTotal={displayedNeedsReplyTotal}
            latestPostAgeDays={latestPostAgeDays}
          />
          <div className="mt-auto grid gap-3 sm:grid-cols-3">
            {infoCards.map((card) => (
              <GbpEngagementMetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                tooltip={card.tooltip}
                tone={card.tone}
              />
            ))}
          </div>
        </div>
        <GbpLatestReviewQuickAction
          organizationId={organizationId}
          locationId={locationId}
          reviews={data.eligibleReviews}
          workItems={data.workItems}
          queueRemaining={displayedNeedsReplyTotal}
          onReplyDeployed={onReplyDeployed}
          onOpenEngage={onOpenEngage}
        />
      </div>
    </motion.section>
  );
}
