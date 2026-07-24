import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  useGbpAutomation,
  useGbpAutomationActions,
  useGbpPublishedLocalPosts,
} from "../../../hooks/queries/useGbpAutomationQueries";
import type { GbpAutomationSettings } from "../../../api/gbpAutomation";
import {
  GbpClientAutomationHeader,
  type ClientGbpView,
} from "./GbpClientAutomationHeader";
import { GbpCategoryProposalPanel } from "./GbpCategoryProposalPanel";
import { GbpClientDraftsPanel } from "./GbpClientDraftsPanel";
import { GbpClientReviewsPanel } from "./GbpClientReviewsPanel";
import { GbpEngagementTrendCard } from "./GbpEngagementTrendCard";
import { GbpReviewListSkeleton } from "./GbpReviewListSkeleton";
import { GbpSettingsSection } from "./GbpSettingsSection";

export type GbpAutomationPanelProps = {
  organizationId: number | null;
  locationId?: number | null;
  /**
   * Promotion props for the standalone /gbp-manager page. All optional —
   * omitting them preserves the panel's original embedded behavior.
   * Spec: plans/06102026-reviews-posts-page (T1/T4).
   */
  /** Controlled view: when provided, the page owns the active tab. */
  view?: ClientGbpView;
  onViewChange?: (view: ClientGbpView) => void;
  /** Suppress the internal Engage title + tab chrome (readiness alert stays). */
  hideHeader?: boolean;
  /** Drop the monthly trend sparkline. */
  hideTrendCard?: boolean;
  /** Drop the inner reply-ops stat cards (the page renders its own). */
  hideReplyOpsCards?: boolean;
  /** Default the Needs-Reply list to a recent window of N days. */
  reviewWindowDays?: number;
  /** Silently pre-generate reply drafts for the newest 1–2 unreplied reviews. */
  autoPregenerate?: boolean;
  /**
   * Drop the outer card chrome so inner sections sit directly in the page
   * container (avoids card-in-card nesting on /gbp-manager).
   */
  frameless?: boolean;
};

const EMPTY_REVIEW_MONTHS = { needsReply: [], replied: [] };
const PREGENERATE_LIMIT = 2;

export function GbpAutomationPanel({
  organizationId,
  locationId,
  view,
  onViewChange,
  hideHeader = false,
  hideTrendCard = false,
  hideReplyOpsCards = false,
  reviewWindowDays,
  autoPregenerate = false,
  frameless = false,
}: GbpAutomationPanelProps) {
  const [needsReplyMonth, setNeedsReplyMonth] = useState<string | null>(null);
  const [repliedMonth, setRepliedMonth] = useState<string | null>(null);
  const [publishedPostPage, setPublishedPostPage] = useState(1);
  const { data, isFetching, isLoading, isPlaceholderData, error, refetch } =
    useGbpAutomation(organizationId, locationId, { needsReplyMonth, repliedMonth });
  const actions = useGbpAutomationActions(organizationId, locationId);
  const [internalView, setInternalView] = useState<ClientGbpView>("reviews");
  // Controlled when the page provides `view`; falls back to internal state.
  const activeView = view ?? internalView;
  const setActiveView = onViewChange ?? setInternalView;
  const {
    data: publishedPostsData,
    isLoading: isLoadingPublishedPosts,
  } = useGbpPublishedLocalPosts(
    organizationId,
    locationId,
    activeView === "posts",
    { page: publishedPostPage, limit: 10 }
  );
  const isBusy = Object.values(actions).some((action) => action.isPending);
  const [settingsDraft, setSettingsDraft] = useState<Partial<GbpAutomationSettings>>({});
  const [isSavingReviewReplies, setIsSavingReviewReplies] = useState(false);
  const [isSavingPostDrafts, setIsSavingPostDrafts] = useState(false);
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
    setPublishedPostPage(1);
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

  useEffect(() => {
    const totalPages = publishedPostsData?.pagination.totalPages || 1;
    if (publishedPostPage > totalPages) setPublishedPostPage(totalPages);
  }, [publishedPostPage, publishedPostsData?.pagination.totalPages]);

  // Pre-generate reply drafts (standalone page): for the newest unreplied
  // reviews that have NEVER had a reply work item, silently run the same
  // generateDraft action a user would click. Ref-guarded to fire at most once
  // per location per mount (refetches change `data` identity and would
  // otherwise re-run this); the backend's already-generating validation is
  // the backstop. Failures are silent — manual drafting still works.
  const pregenerateFiredFor = useRef<number | null>(null);
  useEffect(() => {
    if (!autoPregenerate || !locationId || !data || isPlaceholderData) return;
    if (pregenerateFiredFor.current === locationId) return;
    if (!data.readiness.ready || !data.settings.review_reply_enabled) return;

    const reviewsWithItems = new Set(
      data.workItems
        .filter(
          (item) =>
            (!item.content_type || item.content_type === "review_reply") &&
            item.source_review_id
        )
        .map((item) => item.source_review_id as string)
    );
    const candidates = data.eligibleReviews
      .filter((review) => !review.has_reply && !reviewsWithItems.has(review.id))
      .sort(
        (a, b) =>
          new Date(b.review_created_at ?? 0).getTime() -
          new Date(a.review_created_at ?? 0).getTime()
      )
      .slice(0, PREGENERATE_LIMIT);

    // Mark BEFORE firing so refetch-triggered re-runs cannot double-fire.
    pregenerateFiredFor.current = locationId;
    if (candidates.length === 0) return;

    void (async () => {
      for (const review of candidates) {
        try {
          await actions.generateDraft.mutateAsync(review.id);
        } catch {
          // Silent — the row's Draft reply button remains the manual path.
        }
      }
    })();
    // actions.generateDraft is intentionally omitted: mutation identity churns
    // every render and the ref guard already makes this once-per-location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPregenerate, locationId, data, isPlaceholderData]);

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
      toast.error(err instanceof Error ? err.message : "Google profile action failed.");
      if (options?.rethrow) throw err;
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

  const updatePostGenerationEnabled = (enabled: boolean) =>
    handle(async () => {
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
    }, enabled ? "Google post drafts enabled." : "Google post drafts disabled.");

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
          Could not load reviews and posts status.
        </p>
      </section>
    );
  }

  const readiness = data.readiness;
  const isReady = readiness.ready;
  const sourceReviews = [...data.eligibleReviews, ...data.repliedReviews];

  return (
    <section
      className={
        frameless
          ? undefined
          : "rounded-[14px] border border-slate-200 bg-white p-5 shadow-premium"
      }
    >
      <GbpClientAutomationHeader
        activeView={activeView}
        readiness={readiness}
        settings={data.settings}
        onViewChange={setActiveView}
        hideChrome={hideHeader}
      />

      {isLoadingLocation && activeView === "reviews" ? (
        <div className="mt-4">
          <GbpReviewListSkeleton rows={3} />
        </div>
      ) : activeView === "reviews" ? (
        <>
          {!hideTrendCard && (
            <GbpEngagementTrendCard
              needsReplyMonths={reviewMonths.needsReply}
              repliedMonths={reviewMonths.replied}
            />
          )}
          <GbpClientReviewsPanel
            reviews={data.eligibleReviews}
            repliedReviews={data.repliedReviews}
            workItems={data.workItems}
            reviewMonths={reviewMonths}
            // Client surface: the internal "Safe" safety badge is noise for the
            // practice owner — hide it (Blocked / Safety review still show).
            hideSafeBadge
            needsReplyMonth={needsReplyMonth}
            repliedMonth={repliedMonth}
            isReady={isReady}
            isLoading={isReviewMonthLoading}
            isBusy={isBusy}
            replyOps={hideReplyOpsCards ? undefined : data.readiness.replyOps}
            recentWindowDays={reviewWindowDays}
            // Promoted /gbp-manager page: default the Needs-Reply list to the
            // capped "Latest 10" view (refreshes down toward 0 as reviews are
            // handled) rather than the full recent window. The wider 60-day
            // and All-loaded ranges remain one click away. Spec: plans/
            // 06132026-reviews-posts-clarity (T2).
            initialNeedsReplyRange={reviewWindowDays ? "latest" : undefined}
            onGenerate={(reviewId) =>
              handle(
                () => actions.generateDraft.mutateAsync(reviewId),
                "Reply draft generated."
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
            onSaveWorkItemDraft={(workItemId, draftContent) =>
              handle(
                () => actions.updateDraft.mutateAsync({ workItemId, draftContent }),
                "Draft saved."
              )
            }
            onApproveWorkItemDraft={(workItemId, approvedContent) =>
              handle(
                () => actions.approve.mutateAsync({ workItemId, approvedContent }),
                "Draft approved."
              )
            }
            onDeployWorkItemDraft={(workItemId) =>
              handle(
                async () => {
                  const confirmNeedsReview = await confirmDeployPreview(workItemId);
                  return actions.deploy.mutateAsync({ workItemId, confirmNeedsReview });
                },
                "Deployment queued."
              )
            }
            onRetryWorkItemDraft={(workItemId) =>
              handle(() => actions.retry.mutateAsync(workItemId), "Retry queued.")
            }
            onDeleteWorkItemDraft={(workItemId) =>
              handle(() => actions.deleteDraft.mutateAsync(workItemId), "Draft deleted.")
            }
            onUpdatePublishedReply={(input) =>
              handle(
                () => actions.updatePublishedReply.mutateAsync(input),
                "Google reply updated."
              )
            }
            onDeletePublishedReply={(reviewId) =>
              handle(
                () => actions.deletePublishedReply.mutateAsync(reviewId),
                "Google reply deleted."
              )
            }
            onNeedsReplyMonthChange={setNeedsReplyMonth}
            onRepliedMonthChange={setRepliedMonth}
          />
        </>
      ) : activeView === "posts" ? (
        <GbpClientDraftsPanel
          reviews={sourceReviews}
          workItems={data.workItems}
          publishedPosts={publishedPostsData?.posts || []}
          publishedPostsPagination={publishedPostsData?.pagination}
          nextPostGenerationAt={data.settings.next_post_generation_at}
          // Client surface: the Posts tab was bare — add the visibility note (#10).
          showVisibilityNote
          isBusy={isBusy}
          isLoadingPublishedPosts={isLoadingPublishedPosts}
          onPublishedPostsPageChange={setPublishedPostPage}
          onDelete={(workItemId) =>
            handle(() => actions.deleteDraft.mutateAsync(workItemId), "Draft deleted.")
          }
          onSavePost={(input) =>
            handle(
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
            handle(
              () => actions.regeneratePostDraft.mutateAsync(workItemId),
              "Post draft generated."
            )
          }
          onDeployPost={(input) =>
            handle(
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
            handle(
              () => actions.generatePostDraftNow.mutateAsync(featuredImageUrl),
              "Google post draft generation queued."
            )
          }
          onUploadPostImage={(file) =>
            actions.uploadPostImage.mutateAsync(file).then((result) => result.imageUrl)
          }
          onSavePublishedPost={(input) =>
            handle(
              () => actions.updatePublishedLocalPost.mutateAsync(input),
              "Google post updated."
            )
          }
          onDeletePublishedPost={(name) =>
            handle(
              () => actions.deletePublishedLocalPost.mutateAsync(name),
              "Google post deleted."
            )
          }
          isGeneratingPostDraft={actions.generatePostDraftNow.isPending}
        />
      ) : (
        <div className="mt-4 space-y-4">
          <GbpCategoryProposalPanel
            organizationId={organizationId}
            locationId={locationId}
          />
          <GbpSettingsSection
            settingsDraft={settingsDraft}
            readiness={readiness}
            diagnosticsConfirmed={diagnosticsConfirmed}
            // Client surface: enabling/disabling automation is admin-only (#11).
            // The toggles are hidden here; Diagnostics still shows their status.
            hideAutomationToggles
            isBusy={isBusy}
            isRefreshingDiagnostics={isFetching}
            isSyncingReviews={actions.syncReviews.isPending}
            isSyncingPosts={actions.syncPosts.isPending}
            isSavingReviewReplies={isSavingReviewReplies}
            isSavingPostDrafts={isSavingPostDrafts}
            onRerunDiagnostics={rerunDiagnostics}
            onSyncReviews={() =>
              handle(
                () => actions.syncReviews.mutateAsync(),
                "Manual reviews sync queued."
              )
            }
            onSyncPosts={() =>
              handle(
                () => actions.syncPosts.mutateAsync(),
                "Manual posts sync complete."
              )
            }
            onReviewReplyEnabledChange={updateReviewReplyEnabled}
            onPostGenerationEnabledChange={updatePostGenerationEnabled}
          />
        </div>
      )}
    </section>
  );
}
