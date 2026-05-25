import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import type { GbpAutomationSettings, GbpWorkItemStatus } from "../../api/gbpAutomation";
import {
  useAdminGbpAutomation,
  useAdminGbpAutomationActions,
} from "../../hooks/queries/useAdminGbpAutomationQueries";
import {
  AdminGbpAutomationHeader,
  type AdminGbpView,
} from "./gbp-automation/AdminGbpAutomationHeader";
import { AdminGbpReviewsPanel } from "./gbp-automation/AdminGbpReviewsPanel";
import { AdminGbpSettingsPanel } from "./gbp-automation/AdminGbpSettingsPanel";
import { AdminGbpWorkItemsPanel } from "./gbp-automation/AdminGbpWorkItemsPanel";

export type OrgGbpAutomationTabProps = {
  organizationId: number;
  locationId: number | null;
};

const STATUS_OPTIONS: Array<GbpWorkItemStatus | "all"> = [
  "all",
  "draft",
  "approved",
  "deploying",
  "published",
  "rejected",
];

const EMPTY_REVIEW_MONTHS = { needsReply: [], replied: [] };

export function OrgGbpAutomationTab({
  organizationId,
  locationId,
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
  const [statusFilter, setStatusFilter] = useState<GbpWorkItemStatus | "all">("all");
  const [activeView, setActiveView] = useState<AdminGbpView>("reviews");
  const [isSwitchingLocation, setIsSwitchingLocation] = useState(false);
  const [isSavingReviewReplies, setIsSavingReviewReplies] = useState(false);
  const [diagnosticsConfirmedLocationId, setDiagnosticsConfirmedLocationId] =
    useState<number | null>(null);
  const isBusy =
    actions.updateSettings.isPending ||
    actions.generateDraft.isPending ||
    actions.createPostDraft.isPending ||
    actions.syncReviews.isPending ||
    actions.saveReviewSlotDraft.isPending ||
    actions.updateDraft.isPending ||
    actions.approve.isPending ||
    actions.deleteDraft.isPending ||
    actions.deployPreview.isPending ||
    actions.deploy.isPending ||
    actions.retry.isPending ||
    actions.updateEscalation.isPending;
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

  const workItems = useMemo(() => {
    const items = data?.workItems || [];
    if (statusFilter === "all") {
      return items.filter((item) => item.status !== "published" && item.status !== "rejected");
    }
    return items.filter((item) => item.status === statusFilter);
  }, [data?.workItems, statusFilter]);

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
      throw new Error(preview.warnings[0] || "This reply is not ready to deploy.");
    }
    if (preview.safety.status === "needs_review" || preview.warnings.length > 0) {
      const confirmed = window.confirm(
        [
          "Deploy this reply to Google Business Profile?",
          preview.googleProperty?.display_name
            ? `Profile: ${preview.googleProperty.display_name}`
            : null,
          `Safety: ${preview.safety.status.replace("_", " ")}`,
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
      <AdminGbpAutomationHeader
        activeView={activeView}
        isLoadingLocation={isLoadingLocation}
        isReady={data.readiness.ready}
        status={data.readiness.status}
        onViewChange={setActiveView}
      />

      {activeView === "settings" && (
        <AdminGbpSettingsPanel
          settingsDraft={settingsDraft}
          readiness={data.readiness}
          diagnosticsConfirmed={diagnosticsConfirmed}
          isBusy={isBusy}
          isRefreshingDiagnostics={isFetching}
          isSyncingReviews={actions.syncReviews.isPending}
          isSavingReviewReplies={isSavingReviewReplies}
          onRerunDiagnostics={rerunDiagnostics}
          onSyncReviews={() =>
            run(
              () => actions.syncReviews.mutateAsync(),
              "Manual reviews sync queued."
            )
          }
          onReviewReplyEnabledChange={updateReviewReplyEnabled}
        />
      )}

      {activeView === "drafts" && (
        <AdminGbpWorkItemsPanel
          workItems={workItems}
          reviews={[...data.eligibleReviews, ...data.repliedReviews]}
          statusFilter={statusFilter}
          statusOptions={STATUS_OPTIONS}
          isBusy={isBusy}
          onStatusFilterChange={setStatusFilter}
          onSave={(workItemId, draftContent) =>
            run(() => actions.updateDraft.mutateAsync({ workItemId, draftContent }), "Draft saved.")
          }
          onApprove={(workItemId, approvedContent) =>
            run(
              () => actions.approve.mutateAsync({ workItemId, approvedContent }),
              "Draft approved."
            )
          }
          onDeploy={(workItemId) =>
            run(
              async () => {
                const confirmNeedsReview = await confirmDeployPreview(workItemId);
                return actions.deploy.mutateAsync({ workItemId, confirmNeedsReview });
              },
              "Deployment queued."
            )
          }
          onRetry={(workItemId) =>
            run(() => actions.retry.mutateAsync(workItemId), "Retry queued.")
          }
          onDelete={(workItemId) =>
            run(() => actions.deleteDraft.mutateAsync(workItemId), "Draft deleted.")
          }
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
          onCreatePostDraft={(reviewId) =>
            run(() => actions.createPostDraft.mutateAsync(reviewId), "GBP post draft created.")
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
