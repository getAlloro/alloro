import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  useGbpAutomation,
  useGbpAutomationActions,
} from "../../../hooks/queries/useGbpAutomationQueries";
import type { GbpAutomationSettings } from "../../../api/gbpAutomation";
import {
  GbpClientAutomationHeader,
  type ClientGbpView,
} from "./GbpClientAutomationHeader";
import { GbpClientDraftsPanel } from "./GbpClientDraftsPanel";
import { GbpClientReviewsPanel } from "./GbpClientReviewsPanel";
import { GbpReviewListSkeleton } from "./GbpReviewListSkeleton";
import { GbpSettingsSection } from "./GbpSettingsSection";

export type GbpAutomationPanelProps = {
  organizationId: number | null;
  locationId?: number | null;
};

const EMPTY_REVIEW_MONTHS = { needsReply: [], replied: [] };

export function GbpAutomationPanel({ organizationId, locationId }: GbpAutomationPanelProps) {
  const [needsReplyMonth, setNeedsReplyMonth] = useState<string | null>(null);
  const [repliedMonth, setRepliedMonth] = useState<string | null>(null);
  const { data, isFetching, isLoading, isPlaceholderData, error, refetch } =
    useGbpAutomation(organizationId, locationId, { needsReplyMonth, repliedMonth });
  const actions = useGbpAutomationActions(organizationId, locationId);
  const isBusy = Object.values(actions).some((action) => action.isPending);
  const [activeView, setActiveView] = useState<ClientGbpView>("reviews");
  const [settingsDraft, setSettingsDraft] = useState<Partial<GbpAutomationSettings>>({});
  const [isSavingReviewReplies, setIsSavingReviewReplies] = useState(false);
  const [diagnosticsConfirmedLocationId, setDiagnosticsConfirmedLocationId] =
    useState<number | null>(null);
  const isLoadingLocation = isPlaceholderData && !needsReplyMonth && !repliedMonth;
  const isReviewMonthLoading =
    isFetching && isPlaceholderData && Boolean(needsReplyMonth || repliedMonth);
  const diagnosticsConfirmed =
    Boolean(locationId) && diagnosticsConfirmedLocationId === locationId && !isPlaceholderData;
  const reviewMonths = data?.reviewMonths || EMPTY_REVIEW_MONTHS;

  useEffect(() => {
    if (!data?.settings) return;
    setSettingsDraft(data.settings);
  }, [data?.settings]);

  useEffect(() => {
    setDiagnosticsConfirmedLocationId(null);
    setNeedsReplyMonth(null);
    setRepliedMonth(null);
  }, [locationId]);

  useEffect(() => {
    if (!needsReplyMonth) return;
    const monthExists = reviewMonths.needsReply.some(
      (month) => month.month === needsReplyMonth
    );
    if (!monthExists) setNeedsReplyMonth(reviewMonths.needsReply[0]?.month || null);
  }, [needsReplyMonth, reviewMonths]);

  useEffect(() => {
    if (!repliedMonth) return;
    const monthExists = reviewMonths.replied.some((month) => month.month === repliedMonth);
    if (!monthExists) setRepliedMonth(reviewMonths.replied[0]?.month || null);
  }, [repliedMonth, reviewMonths]);

  if (!organizationId || !locationId) return null;

  const handle = async (
    run: () => Promise<unknown>,
    message: string,
    options?: { rethrow?: boolean }
  ) => {
    try {
      await run();
      toast.success(message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "GBP action failed.");
      if (options?.rethrow) throw err;
    }
  };

  const confirmDeployPreview = async (workItemId: string) => {
    const preview = await actions.deployPreview.mutateAsync(workItemId);
    if (!preview.canDeploy && preview.safety.status !== "needs_review") {
      throw new Error(preview.warnings[0] || "This reply is not ready to deploy.");
    }
    if (preview.safety.status === "needs_review" || preview.warnings.length > 0) {
      const confirmed = window.confirm(
        [
          "Deploy this reply to Google Business Profile?",
          preview.googleProperty?.display_name
            ? `Profile: ${preview.googleProperty.display_name}`
            : null,
          `Safety: ${preview.safety.status.replaceAll("_", " ")}`,
          ...preview.warnings,
        ]
          .filter(Boolean)
          .join("\n")
      );
      if (!confirmed) throw new Error("Deployment cancelled.");
    }
    return preview.safety.status === "needs_review";
  };

  const rerunDiagnostics = () =>
    handle(async () => {
      const result = await refetch();
      if (result.error) throw result.error;
      setDiagnosticsConfirmedLocationId(locationId || null);
    }, "Diagnostics rerun.");

  const updateReviewReplyEnabled = (enabled: boolean) =>
    handle(async () => {
      const previousSettings = settingsDraft;
      const nextSettings = { ...settingsDraft, review_reply_enabled: enabled };
      let didSave = false;
      setIsSavingReviewReplies(true);
      setSettingsDraft(nextSettings);
      try {
        await actions.updateSettings.mutateAsync(nextSettings);
        didSave = true;
        const result = await refetch();
        if (result.error) throw result.error;
      } catch (err) {
        if (!didSave) setSettingsDraft(previousSettings);
        throw err;
      } finally {
        setIsSavingReviewReplies(false);
      }
    }, enabled ? "Review replies enabled." : "Review replies disabled.");

  if (isLoading) {
    return (
      <section className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-premium">
        <div className="h-5 w-44 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 h-20 animate-pulse rounded-[10px] bg-slate-100" />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-[14px] border border-red-200 bg-red-50 p-5">
        <p className="flex items-center gap-2 text-sm font-bold text-red-700">
          <AlertCircle size={16} />
          Could not load GBP automation status.
        </p>
      </section>
    );
  }

  const readiness = data.readiness;
  const isReady = readiness.ready;
  const sourceReviews = [...data.eligibleReviews, ...data.repliedReviews];

  return (
    <section className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-premium">
      <GbpClientAutomationHeader
        activeView={activeView}
        readiness={readiness}
        settings={data.settings}
        onViewChange={setActiveView}
      />

      {isLoadingLocation && activeView === "reviews" ? (
        <div className="mt-4">
          <GbpReviewListSkeleton rows={3} />
        </div>
      ) : activeView === "reviews" ? (
        <GbpClientReviewsPanel
          reviews={data.eligibleReviews}
          repliedReviews={data.repliedReviews}
          workItems={data.workItems}
          reviewMonths={reviewMonths}
          needsReplyMonth={needsReplyMonth}
          repliedMonth={repliedMonth}
          isReady={isReady}
          isLoading={isReviewMonthLoading}
          isBusy={isBusy}
          replyOps={data.readiness.replyOps}
          onGenerate={(reviewId) =>
            handle(
              () => actions.generateDraft.mutateAsync(reviewId),
              "Reply draft generated."
            )
          }
          onCreatePostDraft={(reviewId) =>
            handle(
              () => actions.createPostDraft.mutateAsync(reviewId),
              "GBP post draft created."
            )
          }
          onEscalationChange={(reviewId, status, reason) =>
            handle(
              () =>
                actions.updateEscalation.mutateAsync({
                  reviewId,
                  status,
                  reason,
                }),
              status === "open" ? "Review marked for follow-up." : "Review follow-up updated."
            )
          }
          onSaveDraft={({ reviewId, workItemId, draftContent }) =>
            workItemId
              ? actions.updateDraft.mutateAsync({ workItemId, draftContent })
              : actions.saveReviewSlotDraft.mutateAsync({ reviewId, draftContent })
          }
          onDeployDraft={({ workItemId, draftContent }) =>
            handle(
              async () => {
                await actions.approve.mutateAsync({ workItemId, approvedContent: draftContent });
                const confirmNeedsReview = await confirmDeployPreview(workItemId);
                return actions.deploy.mutateAsync({
                  workItemId,
                  confirmNeedsReview,
                });
              },
              "Deployment queued."
            )
          }
          onUpdatePublishedReply={(input) =>
            handle(
              () => actions.updatePublishedReply.mutateAsync(input),
              "GBP reply updated."
            )
          }
          onDeletePublishedReply={(reviewId) =>
            handle(
              () => actions.deletePublishedReply.mutateAsync(reviewId),
              "GBP reply deleted."
            )
          }
          onNeedsReplyMonthChange={setNeedsReplyMonth}
          onRepliedMonthChange={setRepliedMonth}
        />
      ) : activeView === "drafts" ? (
        <GbpClientDraftsPanel
          reviews={sourceReviews}
          workItems={data.workItems}
          isBusy={isBusy}
          onSave={(workItemId, draftContent) =>
            handle(
              () => actions.updateDraft.mutateAsync({ workItemId, draftContent }),
              "Draft saved."
            )
          }
          onApprove={(workItemId, approvedContent) =>
            handle(
              () => actions.approve.mutateAsync({ workItemId, approvedContent }),
              "Draft approved."
            )
          }
          onDeploy={(workItemId) =>
            handle(
              async () => {
                const confirmNeedsReview = await confirmDeployPreview(workItemId);
                return actions.deploy.mutateAsync({ workItemId, confirmNeedsReview });
              },
              "Deployment queued."
            )
          }
          onRetry={(workItemId) =>
            handle(() => actions.retry.mutateAsync(workItemId), "Retry queued.")
          }
          onDelete={(workItemId) =>
            handle(() => actions.deleteDraft.mutateAsync(workItemId), "Draft deleted.")
          }
        />
      ) : (
        <div className="mt-4">
          <GbpSettingsSection
            settingsDraft={settingsDraft}
            readiness={readiness}
            diagnosticsConfirmed={diagnosticsConfirmed}
            isBusy={isBusy}
            isRefreshingDiagnostics={isFetching}
            isSyncingReviews={actions.syncReviews.isPending}
            isSavingReviewReplies={isSavingReviewReplies}
            onRerunDiagnostics={rerunDiagnostics}
            onSyncReviews={() =>
              handle(
                () => actions.syncReviews.mutateAsync(),
                "Manual reviews sync queued."
              )
            }
            onReviewReplyEnabledChange={updateReviewReplyEnabled}
          />
        </div>
      )}
    </section>
  );
}
