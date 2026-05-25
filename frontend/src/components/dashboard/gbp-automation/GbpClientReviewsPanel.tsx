import { useState } from "react";
import type {
  GbpReview,
  GbpReviewMonthBucket,
  GbpReplyOpsMetrics,
  GbpWorkItem,
} from "../../../api/gbpAutomation";
import { GbpClientRepliedReviewsPanel } from "./GbpClientRepliedReviewsPanel";
import { GbpClientUnrepliedReviewsPanel } from "./GbpClientUnrepliedReviewsPanel";
import type { GbpDraftDeployInput, GbpDraftSaveInput } from "./GbpReviewReplySlot";

export type GbpClientReviewsPanelProps = {
  reviews: GbpReview[];
  repliedReviews: GbpReview[];
  workItems: GbpWorkItem[];
  reviewMonths: {
    needsReply: GbpReviewMonthBucket[];
    replied: GbpReviewMonthBucket[];
  };
  needsReplyMonth: string | null;
  repliedMonth: string | null;
  isReady: boolean;
  isLoading: boolean;
  isBusy: boolean;
  replyOps?: GbpReplyOpsMetrics;
  onGenerate: (reviewId: string) => Promise<unknown>;
  onCreatePostDraft?: (reviewId: string) => Promise<unknown>;
  onEscalationChange?: (
    reviewId: string,
    status: "open" | "resolved" | "dismissed",
    reason: string
  ) => Promise<unknown>;
  onSaveDraft: (input: GbpDraftSaveInput) => Promise<unknown>;
  onDeployDraft: (input: GbpDraftDeployInput) => Promise<unknown>;
  onUpdatePublishedReply: (input: { reviewId: string; replyContent: string }) => Promise<unknown>;
  onDeletePublishedReply: (reviewId: string) => Promise<unknown>;
  onNeedsReplyMonthChange: (month: string | null) => void;
  onRepliedMonthChange: (month: string | null) => void;
};

type ReviewsManagerTab = "unreplied" | "replied";

const REVIEW_TABS: Array<{ key: ReviewsManagerTab; label: string }> = [
  { key: "unreplied", label: "Unreplied" },
  { key: "replied", label: "Replied" },
];

export function GbpClientReviewsPanel({
  reviews,
  repliedReviews,
  workItems,
  reviewMonths,
  needsReplyMonth,
  repliedMonth,
  isReady,
  isLoading,
  isBusy,
  replyOps,
  onGenerate,
  onCreatePostDraft,
  onEscalationChange,
  onSaveDraft,
  onDeployDraft,
  onUpdatePublishedReply,
  onDeletePublishedReply,
  onNeedsReplyMonthChange,
  onRepliedMonthChange,
}: GbpClientReviewsPanelProps) {
  const [activeTab, setActiveTab] = useState<ReviewsManagerTab>("unreplied");

  return (
    <div className="mt-4 space-y-4">
      <div className="inline-flex rounded-[10px] bg-slate-100 p-1">
        {REVIEW_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-[9px] px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === tab.key
                ? "bg-alloro-navy text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "unreplied" ? (
        <GbpClientUnrepliedReviewsPanel
          reviews={reviews}
          workItems={workItems}
          monthBuckets={reviewMonths.needsReply}
          selectedMonth={needsReplyMonth}
          isReady={isReady}
          isLoading={isLoading}
          isBusy={isBusy}
          replyOps={replyOps}
          onGenerate={onGenerate}
          onCreatePostDraft={onCreatePostDraft}
          onEscalationChange={onEscalationChange}
          onSaveDraft={onSaveDraft}
          onDeployDraft={onDeployDraft}
          onSelectedMonthChange={onNeedsReplyMonthChange}
        />
      ) : (
        <GbpClientRepliedReviewsPanel
          reviews={repliedReviews}
          monthBuckets={reviewMonths.replied}
          selectedMonth={repliedMonth}
          isLoading={isLoading}
          isBusy={isBusy}
          onUpdatePublishedReply={onUpdatePublishedReply}
          onDeletePublishedReply={onDeletePublishedReply}
          onSelectedMonthChange={onRepliedMonthChange}
        />
      )}
    </div>
  );
}
