import { motion } from "framer-motion";
import type { ReactNode } from "react";
import HighlightedText from "../focus/HighlightedText";

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

function daysDurationLabel(days: number): string {
  if (days === 1) return "1 day";
  return `${days.toLocaleString()} days`;
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
  agentContent,
  needsAttention,
  reviewNeedsAttention,
  postNeedsAttention,
  postCheckPending,
  postCheckUnavailable,
  needsReplyLast30,
  needsReplyTotal,
  latestPostAgeDays,
}: GbpEngagementActionNoticeProps) {
  const sentiment = reviewNeedsAttention
    ? needsReplyLast30 > 0
      ? "Newer reviews are where trust is won, so this is the fastest place to clean up the public profile."
      : "This is older cleanup work, but it still leaves public conversations unfinished."
    : postNeedsAttention
      ? "A fresh post gives patients and Google a clearer signal that the practice is active."
      : "This is the steady state: patients see answers, and Google sees an active profile.";
  const finalSentiment =
    needsAttention && agentContent?.sentiment ? agentContent.sentiment : sentiment;
  const generatedText =
    needsAttention && agentContent?.text ? agentContent.text.trim() : "";

  return (
    <div className="min-w-0">
      <p className="font-display text-[19px] font-medium leading-8 text-[#2C2A26] [&_mark.hl]:text-[19px] [&_mark.hl]:font-semibold [&_mark.hl]:text-alloro-orange">
          {generatedText ? (
            <HighlightedText
              text={generatedText}
              highlights={agentContent?.highlights ?? []}
            />
          ) : reviewNeedsAttention ? (
            <>
              {needsReplyLast30 > 0 && (
                <>
                  <Highlight>{needsReplyLast30.toLocaleString()}</Highlight>{" "}
                  Google {plural(needsReplyLast30, "review")} from the last 30 days{" "}
                  {plural(needsReplyLast30, "needs", "need")} a reply
                  {needsReplyTotal > needsReplyLast30 ? ", with " : ". "}
                </>
              )}
              {needsReplyTotal > needsReplyLast30 && (
                <>
                  <Highlight>{needsReplyTotal.toLocaleString()}</Highlight> total unanswered{" "}
                  {plural(needsReplyTotal, "review")} waiting.{" "}
                </>
              )}
            </>
          ) : (
            "Every replyable Google review is handled. "
          )}
          {postCheckUnavailable ? (
            "Google post freshness could not be checked right now. "
          ) : postCheckPending ? (
            "Google post freshness is still checking. "
          ) : latestPostAgeDays === null ? (
            "No Google post is on record yet. "
          ) : latestPostAgeDays > POST_FRESHNESS_WINDOW_DAYS ? (
            <>
              The profile has been quiet for <Highlight>{daysDurationLabel(latestPostAgeDays)}</Highlight>.{" "}
            </>
          ) : (
            <>
              The latest Google post went live <Highlight>{daysAgoLabel(latestPostAgeDays)}</Highlight>.{" "}
            </>
          )}
          {finalSentiment}
      </p>
    </div>
  );
}
