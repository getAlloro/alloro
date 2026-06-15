import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { ReviewItem } from "../../api/reviewBlocks";
import type { ProjectIdentityLocation } from "../../api/websites";
import {
  useAdminReviewJob,
  useAdminReviews,
  useAdminReviewStats,
  useReviewActions,
} from "../../hooks/queries/useAdminReviewQueries";
import { ActionButton } from "../ui/DesignSystem";
import { useConfirm } from "../ui/ConfirmModal";
import { ErrorBanner } from "./reviews/ErrorBanner";
import { ReviewFetchLocationsModal } from "./reviews/ReviewFetchLocationsModal";
import { ReviewFilters } from "./reviews/ReviewFilters";
import { ReviewJobProgressBanner } from "./reviews/ReviewJobProgressBanner";
import { ReviewList } from "./reviews/ReviewList";
import { ReviewStatsCards } from "./reviews/ReviewStatsCards";
import { ReviewsLoadingSkeleton } from "./reviews/ReviewsLoadingSkeleton";
import {
  clearStoredReviewJob,
  getStoredReviewJob,
  storeReviewJob,
} from "./reviews/reviewJobStorage";
import type { ActiveReviewJob, JobState, ReviewLocation } from "./reviews/types";

type ReviewsTabProps = {
  projectId: string;
  organizationId?: number;
  identity?: {
    locations?: Array<ReviewLocation | ProjectIdentityLocation>;
  } | null;
};

export default function ReviewsTab({ projectId, organizationId, identity }: ReviewsTabProps) {
  const confirm = useConfirm();
  const locations = useMemo<ReviewLocation[]>(
    () =>
      (identity?.locations || [])
        .filter((loc) => typeof loc.place_id === "string" && loc.place_id.length > 0)
        .map((loc) => ({
          name: loc.name,
          place_id: loc.place_id as string,
          is_primary: loc.is_primary,
          review_count: loc.review_count,
        })),
    [identity?.locations],
  );
  const [activeJob, setActiveJob] = useState<ActiveReviewJob | null>(() => getStoredReviewJob(projectId));
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [starFilter, setStarFilter] = useState<number | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [isFetchModalOpen, setIsFetchModalOpen] = useState(false);

  const params = useMemo(() => ({
    search: searchTerm || undefined,
    stars: starFilter || undefined,
    showHidden,
  }), [searchTerm, starFilter, showHidden]);

  const statsQuery = useAdminReviewStats(projectId);
  const reviewsQuery = useAdminReviews(projectId, params);
  const actions = useReviewActions(projectId);
  const isJobActive = !!activeJob && activeJob.state !== "completed" && activeJob.state !== "failed";
  const jobQuery = useAdminReviewJob(projectId, activeJob?.jobId, isJobActive);
  const stats = statsQuery.data;
  const reviews = reviewsQuery.data || [];
  const isInitialLoading = !stats && !reviewsQuery.data && (statsQuery.isLoading || reviewsQuery.isLoading);
  const loadError = statsQuery.error || reviewsQuery.error;
  const hasFilters = Boolean(searchTerm) || starFilter !== null;

  const dismissJob = useCallback(() => {
    setActiveJob(null);
    clearStoredReviewJob(projectId);
  }, [projectId]);

  useEffect(() => {
    const status = jobQuery.data;
    if (!activeJob || !status) return;

    const state = status.state as JobState;
    if (state === "unknown") {
      dismissJob();
      return;
    }

    const failedReason = status.failedReason || undefined;
    const didStateChange = activeJob.state !== state || activeJob.failedReason !== failedReason;
    if (didStateChange) {
      const updated = { ...activeJob, state, failedReason };
      setActiveJob(updated);
      storeReviewJob(projectId, updated);
    }

    if (state === "completed" && activeJob.state !== "completed") {
      actions.invalidate();
      window.setTimeout(dismissJob, 4000);
    }

    if (state === "failed" && activeJob.state !== "failed") {
      window.setTimeout(dismissJob, 8000);
    }
  }, [activeJob, actions, dismissJob, jobQuery.data, projectId]);

  async function handleSync() {
    setActionError(null);
    try {
      const result = await actions.sync.mutateAsync();
      setAndStoreJob({ jobId: result.data.jobId, type: "sync", state: "waiting", startedAt: Date.now() });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to trigger review sync");
    }
  }

  async function handleFetch(placeIds: string[]) {
    setActionError(null);
    try {
      const result = await actions.fetchMaps.mutateAsync(placeIds);
      setIsFetchModalOpen(false);
      setAndStoreJob({
        jobId: result.data.jobId,
        type: "fetch",
        state: "waiting",
        startedAt: Date.now(),
        placeCount: result.data.placeCount,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to trigger review fetch");
    }
  }

  async function handleToggleHidden(review: ReviewItem) {
    await actions.toggleHidden.mutateAsync({ reviewId: review.id, hidden: !review.hidden });
  }

  async function handleDelete(review: ReviewItem) {
    const ok = await confirm({
      title: "Delete Review",
      message: `Delete this review from ${review.reviewer_name || "Anonymous"}? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) await actions.deleteReview.mutateAsync(review.id);
  }

  function setAndStoreJob(job: ActiveReviewJob) {
    setActiveJob(job);
    storeReviewJob(projectId, job);
  }

  const hasGbpConnection = stats?.hasGbpConnection ?? false;
  const hasPlaceIds = stats?.hasPlaceIds ?? false;
  const syncDisabled = isJobActive || !organizationId || !hasGbpConnection;
  const fetchDisabled = isJobActive || locations.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Reviews</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage reviews used by <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{"{{ review_block }}"}</code> shortcodes on your pages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton label="Fetch via Google Maps" icon={<Download className="w-4 h-4" />} onClick={() => setIsFetchModalOpen(true)} variant="secondary" disabled={fetchDisabled} />
          <ActionButton label="Sync Reviews" icon={<RefreshCw className="w-4 h-4" />} onClick={handleSync} variant="primary" disabled={syncDisabled} loading={actions.sync.isPending} />
        </div>
      </div>

      {activeJob && <ReviewJobProgressBanner job={activeJob} onDismiss={dismissJob} />}
      {(actionError || loadError) && <ErrorBanner message={actionError || (loadError as Error).message} />}
      {!statsQuery.isLoading && !organizationId && !hasPlaceIds && locations.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          Link this project to an organization or select GBP locations to enable review syncing.
        </div>
      )}

      {isInitialLoading ? (
        <ReviewsLoadingSkeleton />
      ) : (
        <>
          {stats && stats.total > 0 && <ReviewStatsCards stats={stats} />}
          {(stats?.total ?? 0) > 0 && <ReviewFilters searchTerm={searchTerm} starFilter={starFilter} showHidden={showHidden} onSearchChange={setSearchTerm} onStarFilterChange={setStarFilter} onShowHiddenChange={setShowHidden} />}
          <ReviewList reviews={reviews} total={stats?.total ?? 0} hasFilters={hasFilters} showHidden={showHidden} hasLocations={locations.length > 0} onToggleHidden={handleToggleHidden} onDelete={handleDelete} />
        </>
      )}

      <ReviewFetchLocationsModal isOpen={isFetchModalOpen} locations={locations} isSubmitting={actions.fetchMaps.isPending} onClose={() => setIsFetchModalOpen(false)} onConfirm={handleFetch} />
    </div>
  );
}
