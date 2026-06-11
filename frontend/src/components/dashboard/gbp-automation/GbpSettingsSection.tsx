import { RotateCw } from "lucide-react";
import type { GbpAutomationSettings, GbpReadiness } from "../../../api/gbpAutomation";
import {
  areGbpReplyPrerequisitesReady,
  diagnosticsGateMessage,
  nextPostLabel,
} from "./gbpReadinessUtils";

export type GbpSettingsSectionProps = {
  settingsDraft: Partial<GbpAutomationSettings>;
  readiness: GbpReadiness;
  diagnosticsConfirmed: boolean;
  isBusy: boolean;
  isRefreshingDiagnostics: boolean;
  isSyncingReviews: boolean;
  isSyncingPosts: boolean;
  isSavingReviewReplies: boolean;
  isSavingPostDrafts: boolean;
  onRerunDiagnostics: () => void;
  onSyncReviews: () => void;
  onSyncPosts: () => void;
  onReviewReplyEnabledChange: (enabled: boolean) => void;
  onPostGenerationEnabledChange: (enabled: boolean) => void;
};

function syncHealthLabel(sync: GbpReadiness["syncHealth"], noun: string): string {
  if (!sync) return `No ${noun} sync recorded yet.`;
  const timestamp = sync.completed_at || sync.started_at || null;
  const date = timestamp ? new Date(timestamp) : null;
  const when =
    date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(date)
      : "time unavailable";
  const status = sync.status.replaceAll("_", " ");
  const count = sync.synced_count.toLocaleString();
  return `${when} - ${status} - ${count} ${noun} synced`;
}

function syncSourceLabel(sync: GbpReadiness["syncHealth"]): "auto" | "manual" | null {
  if (!sync) return null;
  return sync.metadata?.syncSource === "auto" ? "auto" : "manual";
}

function SyncSourcePill({ sync }: { sync: GbpReadiness["syncHealth"] }) {
  const source = syncSourceLabel(sync);
  if (!source) return null;

  const classes =
    source === "auto"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : "bg-amber-50 text-amber-700 ring-amber-100";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] ring-1 ${classes}`}>
      {source}
    </span>
  );
}

function SyncRunSummary({
  sync,
  noun,
}: {
  sync: GbpReadiness["syncHealth"];
  noun: string;
}) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-gray-500">
      <span>Last sync:</span>
      <SyncSourcePill sync={sync} />
      <span>{syncHealthLabel(sync, noun)}</span>
    </p>
  );
}

function postDraftGateMessage(
  diagnosticsConfirmed: boolean,
  prerequisitesReady: boolean,
  isPostGenerationEnabled: boolean
): string {
  if (isPostGenerationEnabled && diagnosticsConfirmed && prerequisitesReady) {
    return "Google post drafts are enabled. New post drafts will appear in Google Posts.";
  }
  if (!diagnosticsConfirmed) return "Rerun diagnostics before enabling Google post drafts.";
  if (!prerequisitesReady) return "Resolve diagnostics before enabling Google post drafts.";
  return "Diagnostics passed. Google post drafts can be enabled.";
}

const CHECK_LABELS: Record<string, string> = {
  reviewRepliesEnabled: "Review replies enabled",
  postDraftsEnabled: "Google post drafts enabled",
  hasGoogleConnection: "Google connected",
  hasRefreshToken: "Refresh token",
  hasBusinessManageScope: "Business Manage scope",
  hasSelectedGbpProperty: "Google profile selected",
  hasAccountId: "Google account ID",
  hasExternalId: "Google location ID",
};

function diagnosticChecks(readiness: GbpReadiness): Array<[string, boolean]> {
  return Object.entries(readiness.checks)
    .filter(([key]) => key !== "featureEnabled")
    .sort(([a], [b]) => {
      const order = [
        "reviewRepliesEnabled",
        "postDraftsEnabled",
        "hasGoogleConnection",
        "hasRefreshToken",
        "hasBusinessManageScope",
        "hasSelectedGbpProperty",
        "hasAccountId",
        "hasExternalId",
      ];
      return order.indexOf(a) - order.indexOf(b);
    });
}

function diagnosticsSummary(prerequisitesReady: boolean): string {
  if (prerequisitesReady) {
    return "Google connection checks passed. Feature status is shown separately below.";
  }
  return "Resolve the failed Google checks, then rerun diagnostics.";
}

function diagnosticsActionText(
  readiness: GbpReadiness,
  prerequisitesReady: boolean
): string | null {
  if (prerequisitesReady || readiness.actions.length === 0) return null;
  return readiness.actions.join(" ");
}

export function GbpSettingsSection({
  settingsDraft,
  readiness,
  diagnosticsConfirmed,
  isBusy,
  isRefreshingDiagnostics,
  isSyncingReviews,
  isSyncingPosts,
  isSavingReviewReplies,
  isSavingPostDrafts,
  onRerunDiagnostics,
  onSyncReviews,
  onSyncPosts,
  onReviewReplyEnabledChange,
  onPostGenerationEnabledChange,
}: GbpSettingsSectionProps) {
  const isReviewReplyEnabled = Boolean(settingsDraft.review_reply_enabled);
  const isPostGenerationEnabled = Boolean(settingsDraft.local_post_generation_enabled);
  const prerequisitesReady = areGbpReplyPrerequisitesReady(readiness);
  const canEnableReviewReplies = diagnosticsConfirmed && prerequisitesReady;
  const isEnableBlocked = !isReviewReplyEnabled && !canEnableReviewReplies;
  const isSwitchDisabled = isBusy || isSavingReviewReplies || isEnableBlocked;
  const canEnablePostDrafts = diagnosticsConfirmed && prerequisitesReady;
  const isPostEnableBlocked = !isPostGenerationEnabled && !canEnablePostDrafts;
  const isPostSwitchDisabled = isBusy || isSavingPostDrafts || isPostEnableBlocked;
  const reviewReplyStatusText = isSavingReviewReplies
    ? "Saving review reply setting..."
    : diagnosticsGateMessage(diagnosticsConfirmed, prerequisitesReady, isReviewReplyEnabled);
  const postDraftStatusText = isSavingPostDrafts
    ? "Saving Google post draft setting..."
    : postDraftGateMessage(diagnosticsConfirmed, prerequisitesReady, isPostGenerationEnabled);
  const diagnosticAction = diagnosticsActionText(readiness, prerequisitesReady);

  return (
    <section className="rounded-[14px] border border-line-soft bg-white p-5 shadow-premium">
      <p className="text-xs font-semibold text-gray-500">
        Next post generation: {nextPostLabel(settingsDraft.next_post_generation_at)}
      </p>

      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
          <div>
            <p id="gbp-review-replies-label" className="text-sm font-bold text-gray-900">
              Review replies
            </p>
            <p className="mt-1 text-xs font-medium text-gray-500">
              {reviewReplyStatusText}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isReviewReplyEnabled}
            aria-disabled={isSwitchDisabled}
            aria-labelledby="gbp-review-replies-label"
            disabled={isSwitchDisabled}
            onClick={() => onReviewReplyEnabledChange(!isReviewReplyEnabled)}
            className={`relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-alloro-orange/40 disabled:cursor-not-allowed disabled:opacity-60 ${
              isReviewReplyEnabled ? "bg-alloro-orange" : "bg-gray-200"
            }`}
          >
            <span
              className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                isReviewReplyEnabled ? "translate-x-5" : "translate-x-0"
              } ${isSavingReviewReplies ? "animate-pulse" : ""}`}
            />
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">Reviews sync</p>
            <p className="mt-1 text-xs font-medium text-gray-500">
              Automatic sync runs daily. Use manual sync for an immediate refresh.
            </p>
            <SyncRunSummary sync={readiness.syncHealth} noun="reviews" />
          </div>
          <button
            type="button"
            disabled={isBusy || isSyncingReviews}
            onClick={onSyncReviews}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isSyncingReviews ? "animate-spin" : ""}`} />
            {isSyncingReviews ? "Syncing" : "Manual reviews sync"}
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
          <div>
            <p id="gbp-local-posts-label" className="text-sm font-bold text-gray-900">
              Google post drafts
            </p>
            <p className="mt-1 text-xs font-medium text-gray-500">
              {postDraftStatusText}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isPostGenerationEnabled}
            aria-disabled={isPostSwitchDisabled}
            aria-labelledby="gbp-local-posts-label"
            disabled={isPostSwitchDisabled}
            onClick={() => onPostGenerationEnabledChange(!isPostGenerationEnabled)}
            className={`relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-alloro-orange/40 disabled:cursor-not-allowed disabled:opacity-60 ${
              isPostGenerationEnabled ? "bg-alloro-orange" : "bg-gray-200"
            }`}
          >
            <span
              className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                isPostGenerationEnabled ? "translate-x-5" : "translate-x-0"
              } ${isSavingPostDrafts ? "animate-pulse" : ""}`}
            />
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">Posts sync</p>
            <p className="mt-1 text-xs font-medium text-gray-500">
              Automatic sync runs daily. Use manual sync after editing posts in Google.
            </p>
            <SyncRunSummary sync={readiness.postSyncHealth} noun="posts" />
          </div>
          <button
            type="button"
            disabled={isBusy || isSyncingPosts}
            onClick={onSyncPosts}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isSyncingPosts ? "animate-spin" : ""}`} />
            {isSyncingPosts ? "Syncing" : "Manual posts sync"}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-sm font-bold text-gray-900">Diagnostics</h4>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {diagnosticsSummary(prerequisitesReady)}
              </p>
            </div>
            <button
              type="button"
              disabled={isRefreshingDiagnostics}
              onClick={onRerunDiagnostics}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isRefreshingDiagnostics ? "animate-spin" : ""}`} />
              {isRefreshingDiagnostics ? "Rerunning" : "Rerun diagnostics"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            {diagnosticChecks(readiness).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-white px-3 py-2">
                <span className="block font-semibold text-gray-500">
                  {CHECK_LABELS[key] || key}
                </span>
                <span className={value ? "font-bold text-emerald-600" : "font-bold text-red-600"}>
                  {value ? "yes" : "no"}
                </span>
              </div>
            ))}
          </div>

          {diagnosticAction && (
            <p className="mt-3 text-xs font-semibold text-amber-700">
              {diagnosticAction}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
