import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Send, Sparkles } from "lucide-react";
import { toast } from "react-hot-toast";
import type { GbpReview, GbpWorkItem } from "../../../api/gbpAutomation";
import { useGbpAutomationActions } from "../../../hooks/queries/useGbpAutomationQueries";
import { GbpLatestReviewCardDeck } from "./GbpLatestReviewCardDeck";
import { GbpLatestReviewCardHeader } from "./GbpLatestReviewCardHeader";
import { GbpLatestReviewEmptyState } from "./GbpLatestReviewEmptyState";
import { GbpLatestReviewQuote } from "./GbpLatestReviewQuote";
export type GbpLatestReviewQuickActionProps = {
  organizationId: number | null;
  locationId?: number | null;
  reviews: GbpReview[];
  workItems: GbpWorkItem[];
  queueRemaining: number;
  onReplyDeployed: (reviewCreatedAt: string | null) => void;
  onOpenEngage: () => void;
};

const ACTIVE_STATUSES = new Set(["draft", "awaiting_approval", "approved", "deploying"]);
const STATUS_PRIORITY: Record<string, number> = { deploying: 4, approved: 3, awaiting_approval: 2, draft: 1 };
const BUTTON_CLASS = "inline-flex items-center justify-center gap-1.5 rounded-[9px] border border-line-soft bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-alloro-navy transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

function reviewTimestamp(review: GbpReview): number {
  const time = review.review_created_at ? new Date(review.review_created_at).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function itemTimestamp(item: GbpWorkItem): number {
  const time = item.created_at ? new Date(item.created_at).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function draftText(item?: GbpWorkItem): string {
  if (!item) return "";
  return item.published_content || item.approved_content || item.draft_content;
}

function latestWorkItemForReview(
  reviewId: string,
  workItems: GbpWorkItem[]
): GbpWorkItem | undefined {
  return workItems
    .filter((item) => {
      if (item.content_type && item.content_type !== "review_reply") return false;
      return item.source_review_id === reviewId && ACTIVE_STATUSES.has(item.status);
    })
    .sort((a, b) => {
      const priorityDelta = (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0);
      return priorityDelta || itemTimestamp(b) - itemTimestamp(a);
    })[0];
}

export function GbpLatestReviewQuickAction({
  organizationId,
  locationId,
  reviews,
  workItems,
  queueRemaining,
  onReplyDeployed,
  onOpenEngage,
}: GbpLatestReviewQuickActionProps) {
  const actions = useGbpAutomationActions(organizationId, locationId);
  const [completedReviewIds, setCompletedReviewIds] = useState<string[]>([]);
  const replyableReviews = useMemo(
    () =>
      [...reviews]
        .filter((review) => !review.has_reply)
        .sort((a, b) => reviewTimestamp(b) - reviewTimestamp(a)),
    [reviews]
  );
  const pendingReviews = useMemo(
    () => replyableReviews.filter((review) => !completedReviewIds.includes(review.id)),
    [completedReviewIds, replyableReviews]
  );
  const latestReview = pendingReviews[0] || null;
  const workItem = useMemo(
    () => (latestReview ? latestWorkItemForReview(latestReview.id, workItems) : undefined),
    [latestReview, workItems]
  );
  const serverDraft = draftText(workItem);
  const [draft, setDraft] = useState(serverDraft);
  const isBusy = Object.values(actions).some((action) => action.isPending);
  const isDirty = draft.trim() !== serverDraft.trim();
  const hasDraft = draft.trim().length > 0;
  const reviewDate = dateLabel(latestReview?.review_created_at || null);
  const remainingCount = Math.max(queueRemaining, pendingReviews.length);

  useEffect(() => {
    setDraft(serverDraft);
  }, [serverDraft, workItem?.id]);

  useEffect(() => {
    setCompletedReviewIds([]);
  }, [organizationId, locationId]);

  const handleGenerate = async () => {
    if (!latestReview || isBusy) return;
    try {
      const item = await actions.generateDraft.mutateAsync(latestReview.id);
      setDraft(draftText(item));
      toast.success("Reply draft generated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate reply draft.");
    }
  };

  const handleSave = async () => {
    if (!latestReview || !hasDraft || isBusy) return;
    try {
      if (workItem) {
        await actions.updateDraft.mutateAsync({ workItemId: workItem.id, draftContent: draft });
      } else {
        await actions.saveReviewSlotDraft.mutateAsync({ reviewId: latestReview.id, draftContent: draft });
      }
      toast.success("Reply draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save reply draft.");
    }
  };

  const handleDeploy = async () => {
    if (!latestReview || !hasDraft || isBusy) return;
    try {
      const item =
        workItem ||
        (await actions.saveReviewSlotDraft.mutateAsync({ reviewId: latestReview.id, draftContent: draft }));
      if (isDirty && workItem) {
        await actions.updateDraft.mutateAsync({ workItemId: workItem.id, draftContent: draft });
      }
      await actions.approve.mutateAsync({ workItemId: item.id, approvedContent: draft });
      const preview = await actions.deployPreview.mutateAsync(item.id);
      if (!preview.canDeploy || preview.safety.status === "needs_review" || preview.warnings.length > 0) {
        throw new Error("Open Alloro Engage to review this reply before publishing.");
      }
      await actions.deploy.mutateAsync({ workItemId: item.id, confirmNeedsReview: false });
      setDraft("");
      setCompletedReviewIds((current) => current.includes(latestReview.id) ? current : [...current, latestReview.id]);
      onReplyDeployed(latestReview.review_created_at);
      toast.success("Reply queued for Google. Loading the next review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not deploy reply.");
    }
  };

  if (!latestReview) {
    return <GbpLatestReviewEmptyState onOpenEngage={onOpenEngage} queueRemaining={remainingCount} />;
  }

  return (
    <GbpLatestReviewCardDeck cardKey={latestReview.id}>
      <GbpLatestReviewCardHeader
        review={latestReview}
        reviewDate={reviewDate}
        remainingCount={remainingCount}
      />
      <GbpLatestReviewQuote text={latestReview.text} />
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Draft a reply here, or generate one."
        aria-label="Reply draft"
        className="mt-3 min-h-[118px] w-full flex-1 resize-none overflow-y-auto rounded-[10px] border border-line-soft bg-white px-3 py-2.5 text-[12px] font-medium leading-5 text-alloro-navy shadow-inner outline-none transition [scrollbar-color:#D66853_#F7F5F1] [scrollbar-width:thin] focus:border-alloro-orange focus:ring-4 focus:ring-alloro-orange/10 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-alloro-orange [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[#F7F5F1]"
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button type="button" disabled={isBusy} onClick={handleGenerate} className={BUTTON_CLASS}>
          {actions.generateDraft.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles size={12} />}
          Draft
        </button>
        <button type="button" disabled={isBusy || !hasDraft || !isDirty} onClick={handleSave} className={BUTTON_CLASS}>
          {actions.updateDraft.isPending || actions.saveReviewSlotDraft.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save size={12} />
          )}
          Save
        </button>
        <button type="button" disabled={isBusy || !hasDraft} onClick={handleDeploy} className="inline-flex items-center justify-center gap-1.5 rounded-[9px] bg-alloro-orange px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50">
          {actions.deploy.isPending || actions.deployPreview.isPending || actions.approve.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send size={12} />
          )}
          Deploy
        </button>
      </div>
    </GbpLatestReviewCardDeck>
  );
}
