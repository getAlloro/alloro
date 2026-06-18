import { useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import type { GbpAutomationSettings } from "../../../api/gbpAutomation";
import {
  useAdminGbpAutomation,
  useAdminGbpAutomationActions,
  useAdminGbpPublishedLocalPosts,
} from "../../../hooks/queries/useAdminGbpAutomationQueries";
import {
  AdminGbpAutomationHeader,
  type AdminGbpView,
} from "../gbp-automation/AdminGbpAutomationHeader";
import { AdminGbpReviewsPanel } from "../gbp-automation/AdminGbpReviewsPanel";
import { AdminGbpSettingsPanel } from "../gbp-automation/AdminGbpSettingsPanel";
import { AdminGbpWorkItemsPanel } from "../gbp-automation/AdminGbpWorkItemsPanel";

export type OrgGbpAutomationTabProps = {
  organizationId: number;
  locationId: number | null;
  activeView?: AdminGbpView;
  hideHeader?: boolean;
  onViewChange?: (view: AdminGbpView) => void;
};

const EMPTY_REVIEW_MONTHS = { needsReply: [], replied: [] };

export function OrgGbpAutomationTab({
  organizationId,
  locationId,
  activeView: controlledActiveView,
  hideHeader = false,
  onViewChange,
}: OrgGbpAutomationTabProps) {
  const [needsReplyMonth, setNeedsReplyMonth] = useState<string | null>(null);
  const [repliedMonth, setRepliedMonth] = useState<string | null>(null);
  const { data, isFetching, isLoading, isPlaceholderData, error, refetch } =
    useAdminGbpAutomation(organizationId, locationId, {
      needsReplyMonth,
      repliedMonth,
    });
  const actions = useAdminGbpAutomationActions(organizationId, locationId);
  const previousLocationIdRef = useRef(locationId);
  const [settingsDraft, setSettingsDraft] =
    useState<Partial<GbpAutomationSettings>>({});
  const [localActiveView, setLocalActiveView] = useState<AdminGbpView>("reviews");
  const activeView = controlledActiveView ?? localActiveView;
  const setActiveView = (view: AdminGbpView) => {
    if (onViewChange) onViewChange(view);
    else setLocalActiveView(view);
  };
  const [publishedPostPage, setPublishedPostPage] = useState(1);
  const {
    data: publishedPostsData,
    isLoading: isLoadingPublishedPosts,
  } = useAdminGbpPublishedLocalPosts(
    organizationId,
    locationId,
    activeView === "posts",
    { page: publishedPostPage, limit: 10 }
  );
  const [isSwitchingLocation, setIsSwitchingLocation] = useState(false);
  const [isSavingReviewReplies, setIsSavingReviewReplies] = useState(false);
  const [isSavingPostDrafts, setIsSavingPostDrafts] = useState(false);
  const [diagnosticsConfirmedLocationId, setDiagnosticsConfirmedLocationId] =
    useState<number | null>(null);
  const isBusy =
    actions.updateSettings.isPending ||
    actions.generateDraft.isPending ||
    actions.createPostDraft.isPending ||
    actions.generatePostDraftNow.isPending ||
    actions.uploadPostImage.isPending ||
    actions.syncReviews.isPending ||
    actions.syncPosts.isPending ||
    actions.saveReviewSlotDraft.isPending ||
    actions.updateDraft.isPending ||
    actions.regeneratePostDraft.isPending ||
    actions.approve.isPending ||
    actions.deleteDraft.isPending ||
    actions.deployPreview.isPending ||
    actions.deploy.isPending ||
    actions.retry.isPending ||
    actions.updateEscalation.isPending ||
    actions.updatePublishedLocalPost.isPending ||
    actions.deletePublishedLocalPost.isPending;
  const isGoogleBusy =
    isBusy ||
    actions.updatePublishedReply.isPending ||
    actions.deletePublishedReply.isPending;
  const isLoadingLocation = isSwitchingLocation;
  const isReviewMonthLoading = isFetching && isPlaceholderData && !isSwitchingLocation;
  const diagnosticsConfirmed =
    Boolean(locationId) && diagnosticsConfirmedLocationId === locationId && !isPlaceholderData;
  const reviewMonths = data?.reviewMonths || EMPTY_REVIEW_MONTHS;

  useEffect(() => {
    if (!data?.settings) return;
    setSettingsDraft(data.settings);
  }, [data?.settings]);

  useEffect(() => {
    if (previousLocationIdRef.current && previousLocationIdRef.current !== locationId) {
      setIsSwitchingLocation(true);
      setDiagnosticsConfirmedLocationId(null);
      setNeedsReplyMonth(null);
      setRepliedMonth(null);
      setPublishedPostPage(1);
    }
    previousLocationIdRef.current = locationId;
  }, [locationId]);

  useEffect(() => {
    if (
      needsReplyMonth &&
      !reviewMonths.needsReply.some((month) => month.month === needsReplyMonth)
    ) {
      setNeedsReplyMonth(reviewMonths.needsReply[0]?.month || null);
    }
    if (
      repliedMonth &&
      !reviewMonths.replied.some((month) => month.month === repliedMonth)
    ) {
      setRepliedMonth(reviewMonths.replied[0]?.month || null);
    }
  }, [needsReplyMonth, repliedMonth, reviewMonths]);

  useEffect(() => {
    if (!isFetching) setIsSwitchingLocation(false);
  }, [isFetching]);

  useEffect(() => {
    const totalPages = publishedPostsData?.pagination.totalPages || 1;
    if (publishedPostPage > totalPages) setPublishedPostPage(totalPages);
  }, [publishedPostPage, publishedPostsData?.pagination.totalPages]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      const result = await action();
      toast.success(message);
      return result;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "GBP automation action failed.");
      throw err;
    }
  };

  const confirmDeployPreview = async (workItemId: string) => {
    const preview = await actions.deployPreview.mutateAsync(workItemId);
    if (!preview.canDeploy && preview.safety.status !== "needs_review") {
      throw new Error(preview.warnings[0] || "This item is not ready to deploy.");
    }
    const noun = preview.workItem.content_type === "local_post" ? "post" : "reply";
    if (preview.safety.status === "needs_review" || preview.warnings.length > 0) {
      const confirmed = window.confirm(
        [
          `Deploy this ${noun} to Google Business Profile?`,
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
    run(async () => {
      const result = await refetch();
      if (result.error) throw result.error;
      setDiagnosticsConfirmedLocationId(locationId);
    }, "Diagnostics rerun.");

  const updateReviewReplyEnabled = (enabled: boolean) =>
    run(async () => {
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

  const updatePostGenerationEnabled = (enabled: boolean) =>
    run(async () => {
      const previousSettings = settingsDraft;
      const nextSettings = { ...settingsDraft, local_post_generation_enabled: enabled };
      let didSave = false;
      setIsSavingPostDrafts(true);
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
        setIsSavingPostDrafts(false);
      }
    }, enabled ? "GBP post drafts enabled." : "GBP post drafts disabled.");

  if (!locationId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
        Select a location to inspect GBP automation.
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-gray-100" />;
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
        GBP automation failed to load.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <AdminGbpAutomationHeader
          activeView={activeView}
          isLoadingLocation={isLoadingLocation}
          isReady={data.readiness.ready}
          status={data.readiness.status}
          onViewChange={setActiveView}
        />
      )}

      {activeView === "settings" && (
        <AdminGbpSettingsPanel
          settingsDraft={settingsDraft}
          readiness={data.readiness}
          diagnosticsConfirmed={diagnosticsConfirmed}
          isBusy={isBusy}
          isRefreshingDiagnostics={isFetching}
          isSyncingReviews={actions.syncReviews.isPending}
          isSyncingPosts={actions.syncPosts.isPending}
          isSavingReviewReplies={isSavingReviewReplies}
          isSavingPostDrafts={isSavingPostDrafts}
          onRerunDiagnostics={rerunDiagnostics}
          onSyncReviews={() =>
            run(
              () => actions.syncReviews.mutateAsync(),
              "Manual reviews sync queued."
            )
          }
          onSyncPosts={() =>
            run(
              () => actions.syncPosts.mutateAsync(),
              "Manual posts sync complete."
            )
          }
          onReviewReplyEnabledChange={updateReviewReplyEnabled}
          onPostGenerationEnabledChange={updatePostGenerationEnabled}
        />
      )}

      {activeView === "posts" && (
        <AdminGbpWorkItemsPanel
          workItems={data.workItems}
          reviews={[...data.eligibleReviews, ...data.repliedReviews]}
          publishedPosts={publishedPostsData?.posts || []}
          publishedPostsPagination={publishedPostsData?.pagination}
          nextPostGenerationAt={data.settings.next_post_generation_at}
          isBusy={isBusy}
          isLoadingPublishedPosts={isLoadingPublishedPosts}
          onPublishedPostsPageChange={setPublishedPostPage}
          onDelete={(workItemId) =>
            run(() => actions.deleteDraft.mutateAsync(workItemId), "Draft deleted.")
          }
          onSavePost={(input) =>
            run(
              () =>
                actions.updateDraft.mutateAsync({
                  workItemId: input.workItemId,
                  draftContent: input.draftContent,
                  featuredImageUrl: input.featuredImageUrl,
                }),
              "Post draft saved."
            )
          }
          onRegeneratePost={(workItemId) =>
            run(
              () => actions.regeneratePostDraft.mutateAsync(workItemId),
              "Post draft generated."
            )
          }
          onDeployPost={(input) =>
            run(
              async () => {
                await actions.updateDraft.mutateAsync({
                  workItemId: input.workItemId,
                  draftContent: input.draftContent,
                  featuredImageUrl: input.featuredImageUrl,
                });
                await actions.approve.mutateAsync({
                  workItemId: input.workItemId,
                  approvedContent: input.draftContent,
                });
                const confirmNeedsReview = await confirmDeployPreview(input.workItemId);
                return actions.deploy.mutateAsync({
                  workItemId: input.workItemId,
                  confirmNeedsReview,
                });
              },
              "Post deployment queued."
            )
          }
          onGeneratePostDraft={(featuredImageUrl) =>
            run(
              () => actions.generatePostDraftNow.mutateAsync(featuredImageUrl),
              "GBP post draft generation queued."
            )
          }
          onUploadPostImage={(file) =>
            actions.uploadPostImage.mutateAsync(file).then((result) => result.imageUrl)
          }
          onSavePublishedPost={(input) =>
            run(
              () => actions.updatePublishedLocalPost.mutateAsync(input),
              "GBP post updated."
            )
          }
          onDeletePublishedPost={(name) =>
            run(
              () => actions.deletePublishedLocalPost.mutateAsync(name),
              "GBP post deleted."
            )
          }
          isGeneratingPostDraft={actions.generatePostDraftNow.isPending}
        />
      )}

      {activeView === "reviews" && (
        <AdminGbpReviewsPanel
          reviews={data.eligibleReviews}
          repliedReviews={data.repliedReviews}
          workItems={data.workItems}
          reviewMonths={reviewMonths}
          needsReplyMonth={needsReplyMonth}
          repliedMonth={repliedMonth}
          isReady={data.readiness.ready}
          isLoading={isLoadingLocation}
          isMonthLoading={isReviewMonthLoading}
          isBusy={isGoogleBusy}
          replyOps={data.readiness.replyOps}
          onGenerate={(reviewId) =>
            run(() => actions.generateDraft.mutateAsync(reviewId), "Reply draft generated.")
          }
          onEscalationChange={(reviewId, status, reason) =>
            run(
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
            run(
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
          onSaveWorkItemDraft={(workItemId, draftContent) =>
            run(
              () => actions.updateDraft.mutateAsync({ workItemId, draftContent }),
              "Draft saved."
            )
          }
          onApproveWorkItemDraft={(workItemId, approvedContent) =>
            run(
              () => actions.approve.mutateAsync({ workItemId, approvedContent }),
              "Draft approved."
            )
          }
          onDeployWorkItemDraft={(workItemId) =>
            run(
              async () => {
                const confirmNeedsReview = await confirmDeployPreview(workItemId);
                return actions.deploy.mutateAsync({ workItemId, confirmNeedsReview });
              },
              "Deployment queued."
            )
          }
          onRetryWorkItemDraft={(workItemId) =>
            run(() => actions.retry.mutateAsync(workItemId), "Retry queued.")
          }
          onDeleteWorkItemDraft={(workItemId) =>
            run(() => actions.deleteDraft.mutateAsync(workItemId), "Draft deleted.")
          }
          onUpdatePublishedReply={({ reviewId, replyContent }) =>
            run(
              () => actions.updatePublishedReply.mutateAsync({ reviewId, replyContent }),
              "GBP reply updated."
            )
          }
          onDeletePublishedReply={(reviewId) =>
            run(() => actions.deletePublishedReply.mutateAsync(reviewId), "GBP reply deleted.")
          }
          onNeedsReplyMonthChange={setNeedsReplyMonth}
          onRepliedMonthChange={setRepliedMonth}
        />
      )}

    </div>
  );
}
