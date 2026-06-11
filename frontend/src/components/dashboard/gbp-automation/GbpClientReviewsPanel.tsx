import { useState } from "react";
import type {
  GbpReview,
  GbpReviewMonthBucket,
  GbpReplyOpsMetrics,
  GbpWorkItem,
} from "../../../api/gbpAutomation";
import { GbpClientRepliedReviewsPanel } from "./GbpClientRepliedReviewsPanel";
import { GbpClientUnrepliedReviewsPanel } from "./GbpClientUnrepliedReviewsPanel";
import { GbpReplyDraftsPanel } from "./GbpReplyDraftsPanel";
import type { GbpReviewRange } from "./GbpReviewRangeControls";
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
  onSaveWorkItemDraft: (
    workItemId: string,
    draftContent: string
  ) => void | Promise<unknown>;
  onApproveWorkItemDraft: (
    workItemId: string,
    approvedContent: string
  ) => void | Promise<unknown>;
  onDeployWorkItemDraft: (workItemId: string) => void | Promise<unknown>;
  onRetryWorkItemDraft: (workItemId: string) => void | Promise<unknown>;
  onDeleteWorkItemDraft: (workItemId: string) => void | Promise<unknown>;
  onUpdatePublishedReply: (input: { reviewId: string; replyContent: string }) => Promise<unknown>;
  onDeletePublishedReply: (reviewId: string) => Promise<unknown>;
  onNeedsReplyMonthChange: (month: string | null) => void;
  onRepliedMonthChange: (month: string | null) => void;
  /** Days covered by the Needs-Reply recent window (default 30). */
  recentWindowDays?: number;
  /** Needs-Reply range tab selected on mount (default "latest"). */
  initialNeedsReplyRange?: GbpReviewRange;
};

type ReviewsManagerTab = "needsReply" | "drafts" | "replied";

const REVIEW_TABS: Array<{ key: ReviewsManagerTab; label: string }> = [
  { key: "needsReply", label: "Needs Reply" },
  { key: "drafts", label: "Reply Drafts" },
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
  onSaveWorkItemDraft,
  onApproveWorkItemDraft,
  onDeployWorkItemDraft,
  onRetryWorkItemDraft,
  onDeleteWorkItemDraft,
  onUpdatePublishedReply,
  onDeletePublishedReply,
  onNeedsReplyMonthChange,
  onRepliedMonthChange,
  recentWindowDays,
  initialNeedsReplyRange,
}: GbpClientReviewsPanelProps) {
  const [activeTab, setActiveTab] = useState<ReviewsManagerTab>("needsReply");
  const sourceReviews = [...reviews, ...repliedReviews];

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

      {activeTab === "needsReply" ? (
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
          recentWindowDays={recentWindowDays}
          initialRange={initialNeedsReplyRange}
        />
      ) : activeTab === "drafts" ? (
        <GbpReplyDraftsPanel
          reviews={sourceReviews}
          workItems={workItems}
          isBusy={isBusy}
          onSave={onSaveWorkItemDraft}
          onApprove={onApproveWorkItemDraft}
          onDeploy={onDeployWorkItemDraft}
          onRetry={onRetryWorkItemDraft}
          onDelete={onDeleteWorkItemDraft}
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
