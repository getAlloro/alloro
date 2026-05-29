import { motion } from "framer-motion";
import type { ReactNode } from "react";

export type GbpEngagementActionNoticeProps = {
  agentContent?: {
    title?: string | null;
    text?: string | null;
    highlights?: string[] | null;
    sentiment?: string | null;
  } | null;
  needsAttention: boolean;
  reviewNeedsAttention: boolean;
  postNeedsAttention: boolean;
  postCheckPending: boolean;
  postCheckUnavailable: boolean;
  needsReplyLast30: number;
  needsReplyTotal: number;
  latestPostAgeDays: number | null;
};

const POST_FRESHNESS_WINDOW_DAYS = 15;

function plural(value: number, singular: string, pluralText = `${singular}s`): string {
  return value === 1 ? singular : pluralText;
}

function daysAgoLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days.toLocaleString()} days ago`;
}

function Highlight({ children }: { children: ReactNode }) {
  return (
    <motion.span
      key={String(children)}
      className="inline-block font-display text-[19px] font-semibold text-alloro-orange tabular-nums"
      animate={{ scale: [1, 1.12, 1] }}
      transition={{ duration: 0.36, ease: "easeOut" }}
    >
      {children}
    </motion.span>
  );
}

export function GbpEngagementActionNotice({
  needsAttention,
  reviewNeedsAttention,
  postNeedsAttention,
  postCheckPending,
  postCheckUnavailable,
  needsReplyLast30,
  needsReplyTotal,
  latestPostAgeDays,
}: GbpEngagementActionNoticeProps) {
  const hasReplyBacklog = reviewNeedsAttention && needsReplyTotal > 0;
  const hasRecentReplyBacklog = hasReplyBacklog && needsReplyLast30 > 0;
  const jointAction = reviewNeedsAttention && postNeedsAttention
    ? "posting weekly and catching up on replies will strengthen the profile."
    : reviewNeedsAttention
      ? "catching up on replies will strengthen trust with patients."
      : "posting weekly will keep the profile fresh for patients and Google.";
  const standaloneAction = reviewNeedsAttention && postNeedsAttention
    ? "Posting weekly and catching up on replies will strengthen the profile."
    : reviewNeedsAttention
      ? "Catching up on replies will strengthen trust with patients."
      : "Posting weekly will keep the profile fresh for patients and Google.";

  return (
    <div className="min-w-0">
      <p className="font-display text-[19px] font-medium leading-8 text-[#2C2A26] [&_mark.hl]:text-[19px] [&_mark.hl]:font-semibold [&_mark.hl]:text-alloro-orange">
        {needsAttention ? (
          <>
            {hasReplyBacklog ? (
              hasRecentReplyBacklog ? (
                <>
                  <Highlight>{needsReplyLast30.toLocaleString()}</Highlight>{" "}
                  Google {plural(needsReplyLast30, "review")} from the last 30 days{" "}
                  {plural(needsReplyLast30, "needs", "need")} a reply
                  {needsReplyTotal > needsReplyLast30 ? (
                    <>
                      , with <Highlight>{needsReplyTotal.toLocaleString()}</Highlight>{" "}
                      total unanswered {plural(needsReplyTotal, "review")} waiting.
                    </>
                  ) : (
                    "."
                  )}{" "}
                </>
              ) : (
                <>
                  <Highlight>{needsReplyTotal.toLocaleString()}</Highlight> total unanswered{" "}
                  {plural(needsReplyTotal, "review")}{" "}
                  {plural(needsReplyTotal, "is", "are")} waiting.{" "}
                </>
              )
            ) : (
              <>Every replyable Google review is handled. </>
            )}

            {postCheckUnavailable ? (
              <>Google post freshness could not be checked right now. {standaloneAction}</>
            ) : postCheckPending ? (
              <>Google post freshness is still checking. {standaloneAction}</>
            ) : latestPostAgeDays === null ? (
              <>No Google post is on record yet, so {jointAction}</>
            ) : latestPostAgeDays > POST_FRESHNESS_WINDOW_DAYS ? (
              <>
                Your last Google post was{" "}
                <Highlight>{daysAgoLabel(latestPostAgeDays)}</Highlight>, so{" "}
                {jointAction}
              </>
            ) : postNeedsAttention ? (
              <>Google posts need attention, so {jointAction}</>
            ) : (
              <>
                The latest Google post went live{" "}
                <Highlight>{daysAgoLabel(latestPostAgeDays)}</Highlight>.{" "}
                {reviewNeedsAttention ? standaloneAction : "Keep the same rhythm going."}
              </>
            )}
          </>
        ) : (
          <>
            Every replyable Google review is handled, and Google posts are current. Keep
            the same rhythm going.
          </>
        )}
      </p>
    </div>
  );
}
