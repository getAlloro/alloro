import { RotateCw } from "lucide-react";
import type { GbpAutomationSettings, GbpReadiness } from "../../../api/gbpAutomation";
import {
  areGbpReplyPrerequisitesReady,
  diagnosticsGateMessage,
  formatGbpStatus,
  nextPostLabel,
} from "./gbpReadinessUtils";

export type GbpSettingsSectionProps = {
  settingsDraft: Partial<GbpAutomationSettings>;
  readiness: GbpReadiness;
  diagnosticsConfirmed: boolean;
  isBusy: boolean;
  isRefreshingDiagnostics: boolean;
  isSyncingReviews: boolean;
  isSavingReviewReplies: boolean;
  onRerunDiagnostics: () => void;
  onSyncReviews: () => void;
  onReviewReplyEnabledChange: (enabled: boolean) => void;
};

function syncHealthLabel(readiness: GbpReadiness): string {
  const sync = readiness.syncHealth;
  if (!sync) return "No reviews sync recorded yet.";
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
  return `${when} - ${status} - ${count} reviews synced`;
}

export function GbpSettingsSection({
  settingsDraft,
  readiness,
  diagnosticsConfirmed,
  isBusy,
  isRefreshingDiagnostics,
  isSyncingReviews,
  isSavingReviewReplies,
  onRerunDiagnostics,
  onSyncReviews,
  onReviewReplyEnabledChange,
}: GbpSettingsSectionProps) {
  const isReviewReplyEnabled = Boolean(settingsDraft.review_reply_enabled);
  const prerequisitesReady = areGbpReplyPrerequisitesReady(readiness);
  const canEnableReviewReplies = diagnosticsConfirmed && prerequisitesReady;
  const isEnableBlocked = !isReviewReplyEnabled && !canEnableReviewReplies;
  const isSwitchDisabled = isBusy || isSavingReviewReplies || isEnableBlocked;
  const reviewReplyStatusText = isSavingReviewReplies
    ? "Saving review reply setting..."
    : diagnosticsGateMessage(diagnosticsConfirmed, prerequisitesReady, isReviewReplyEnabled);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">Settings</h3>
          <p className="mt-1 text-xs font-semibold text-gray-500">
            Next post generation: {nextPostLabel(settingsDraft.next_post_generation_at)}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
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
            <p className="text-sm font-bold text-gray-900">Manual reviews sync</p>
            <p className="mt-1 text-xs font-medium text-gray-500">
              Last reviews sync: {syncHealthLabel(readiness)}
            </p>
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

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h4 className="text-sm font-bold text-gray-900">Diagnostics</h4>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {formatGbpStatus(readiness.status)}
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
            {Object.entries(readiness.checks).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-white px-3 py-2">
                <span className="block font-semibold text-gray-500">{key}</span>
                <span className={value ? "font-bold text-emerald-600" : "font-bold text-red-600"}>
                  {value ? "yes" : "no"}
                </span>
              </div>
            ))}
          </div>

          {!readiness.ready && readiness.actions.length > 0 && (
            <p className="mt-3 text-xs font-semibold text-amber-700">
              {readiness.actions.join(" ")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
