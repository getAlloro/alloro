import { useState } from "react";
import type {
  GbpReview,
  GbpReviewMonthBucket,
  GbpReplyOpsMetrics,
  GbpWorkItem,
} from "../../../api/gbpAutomation";
import { AdminGbpNeedsReplyPanel } from "./AdminGbpNeedsReplyPanel";
import { AdminGbpRepliedReviewsPanel } from "./AdminGbpRepliedReviewsPanel";

export type DraftSaveInput = {
  reviewId: string;
  workItemId: string | null;
  draftContent: string;
};

export type DraftDeployInput = {
  workItemId: string;
  draftContent: string;
};

export type AdminGbpReviewsPanelProps = {
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
  isMonthLoading: boolean;
  isBusy: boolean;
  replyOps?: GbpReplyOpsMetrics;
  onGenerate: (reviewId: string) => Promise<unknown>;
  onCreatePostDraft?: (reviewId: string) => Promise<unknown>;
  onEscalationChange?: (
    reviewId: string,
    status: "open" | "resolved" | "dismissed",
    reason: string
  ) => Promise<unknown>;
  onSaveDraft: (input: DraftSaveInput) => Promise<unknown>;
  onDeployDraft: (input: DraftDeployInput) => Promise<unknown>;
  onUpdatePublishedReply: (input: {
    reviewId: string;
    replyContent: string;
  }) => Promise<unknown>;
  onDeletePublishedReply: (reviewId: string) => Promise<unknown>;
  onNeedsReplyMonthChange: (month: string | null) => void;
  onRepliedMonthChange: (month: string | null) => void;
};

type ReviewTab = "needsReply" | "replied";

const REVIEW_TABS: Array<{ key: ReviewTab; label: string }> = [
  { key: "needsReply", label: "Needs Reply" },
  { key: "replied", label: "Replied" },
];

function ReviewsLoadingState() {
  return (
    <div className="mt-4 space-y-3" aria-live="polite" aria-label="Loading reviews">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="rounded-[10px] border border-slate-200 bg-slate-50 p-3">
          <div className="h-3 w-32 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-3 h-3 w-24 animate-pulse rounded-full bg-slate-200" />
          <div className="mt-3 h-3 w-3/4 animate-pulse rounded-full bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export function AdminGbpReviewsPanel({
  reviews,
  repliedReviews,
  workItems,
  reviewMonths,
  needsReplyMonth,
  repliedMonth,
  isReady,
  isLoading,
  isMonthLoading,
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
}: AdminGbpReviewsPanelProps) {
  const [activeTab, setActiveTab] = useState<ReviewTab>("needsReply");

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">GBP Reviews</h3>
          <p className="mt-1 text-xs font-semibold text-gray-500">
            Drafts save to Alloro first. Deploy is a separate Google action.
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          {REVIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === tab.key
                  ? "bg-alloro-navy text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <ReviewsLoadingState />
      ) : activeTab === "needsReply" ? (
        <AdminGbpNeedsReplyPanel
          reviews={reviews}
          workItems={workItems}
          monthBuckets={reviewMonths.needsReply}
          selectedMonth={needsReplyMonth}
          isReady={isReady}
          isLoading={isMonthLoading}
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
        <AdminGbpRepliedReviewsPanel
          reviews={repliedReviews}
          monthBuckets={reviewMonths.replied}
          selectedMonth={repliedMonth}
          isLoading={isMonthLoading}
          isBusy={isBusy}
          onUpdatePublishedReply={onUpdatePublishedReply}
          onDeletePublishedReply={onDeletePublishedReply}
          onSelectedMonthChange={onRepliedMonthChange}
        />
      )}
    </section>
  );
}
