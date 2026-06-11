import { useState } from "react";
import { Newspaper, Settings2, Sparkles, type LucideIcon } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useLocationContext } from "../contexts/locationContext";
import { useGbpAutomation } from "../hooks/queries/useGbpAutomationQueries";
import { GbpAutomationPanel } from "../components/dashboard/gbp-automation/GbpAutomationPanel";
import type { ClientGbpView } from "../components/dashboard/gbp-automation/GbpClientAutomationHeader";
import { StatBox } from "../components/dashboard/StatBox";
import type { GbpReview } from "../api/gbpAutomation";

/**
 * GbpManagerPage — the standalone Reviews & Posts page (/gbp-manager).
 *
 * Fourth dashboard redesign: promotes the Engage workspace out of Local
 * Rankings into its own sidebar page. Shape: header → navy pill tabs
 * (Reviews · Posts · Settings) → three stat boxes (Reviews tab) → the
 * existing GbpAutomationPanel in promoted mode (chrome hidden, 60-day
 * review window, 1–2 reply drafts pre-generated on load).
 *
 * The stat boxes read the SAME useGbpAutomation queryKey the panel uses on
 * mount (null month filters), so they add zero network requests.
 *
 * Spec: plans/06102026-reviews-posts-page/spec.html (T2/T3)
 */

const REVIEW_WINDOW_DAYS = 60;
const FRESH_REVIEW_WARN_DAYS = 14;

const VIEW_OPTIONS: Array<{ key: ClientGbpView; label: string; icon: LucideIcon }> = [
  { key: "reviews", label: "Reviews", icon: Sparkles },
  { key: "posts", label: "Posts", icon: Newspaper },
  { key: "settings", label: "Settings", icon: Settings2 },
];

function reviewTimestamp(review: GbpReview): number {
  if (!review.review_created_at) return 0;
  const ts = new Date(review.review_created_at).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function GbpManagerPage() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const organizationId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const [activeView, setActiveView] = useState<ClientGbpView>("reviews");

  // Same queryKey as the panel's initial fetch (null month filters) —
  // React Query dedupes, so these stats cost no extra request.
  const { data } = useGbpAutomation(organizationId, locationId);

  const eligibleReviews = data?.eligibleReviews ?? [];
  const repliedReviews = data?.repliedReviews ?? [];

  const windowStart = Date.now() - REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const needsReplyInWindow = eligibleReviews.filter(
    (review) => !review.has_reply && reviewTimestamp(review) >= windowStart
  ).length;

  const newestReviewTs = [...eligibleReviews, ...repliedReviews].reduce(
    (max, review) => Math.max(max, reviewTimestamp(review)),
    0
  );
  const lastReviewDays =
    newestReviewTs > 0
      ? Math.max(0, Math.floor((Date.now() - newestReviewTs) / 86_400_000))
      : null;

  const coveragePercent = data?.readiness.replyOps?.replyCoveragePercent ?? null;

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-navy pb-32 selection:bg-alloro-orange selection:text-white">
      <main className="w-full max-w-[960px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted mb-2">
              Alloro Engage™
            </div>
            <h1 className="font-display text-[28px] font-medium tracking-tight text-alloro-navy">
              Reviews &amp; Posts
            </h1>
            <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink-muted">
              Reply to Google reviews and prepare Google posts from one workspace.
            </p>
          </div>

          <div className="inline-flex self-start rounded-[12px] border border-line-soft bg-white p-1 shadow-premium sm:self-auto">
            {VIEW_OPTIONS.map(({ key, label, icon: Icon }) => {
              const isActive = activeView === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveView(key)}
                  className={`inline-flex items-center justify-center gap-2 rounded-[9px] px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-alloro-navy/20 ${
                    isActive
                      ? "bg-alloro-navy text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 hover:text-alloro-navy"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {!locationId ? (
          <section className="rounded-[14px] border border-line-soft bg-white p-6 text-sm font-semibold text-ink-muted shadow-premium">
            Select a location to manage its Google reviews and posts.
          </section>
        ) : (
          <>
            {activeView === "reviews" && data && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatBox
                  label="Needs reply"
                  value={String(needsReplyInWindow)}
                  sub={`last ${REVIEW_WINDOW_DAYS}d`}
                  tone={needsReplyInWindow > 0 ? "warn" : "ink"}
                />
                <StatBox
                  label="Last review"
                  value={
                    lastReviewDays === null
                      ? "—"
                      : lastReviewDays === 0
                        ? "Today"
                        : `${lastReviewDays}d ago`
                  }
                  sub="keep it fresh"
                  tone={
                    lastReviewDays !== null && lastReviewDays > FRESH_REVIEW_WARN_DAYS
                      ? "warn"
                      : "ink"
                  }
                />
                <StatBox
                  label="Coverage"
                  value={coveragePercent === null ? "—" : `${coveragePercent}%`}
                  sub="replied"
                />
              </div>
            )}

            <GbpAutomationPanel
              organizationId={organizationId}
              locationId={locationId}
              view={activeView}
              onViewChange={setActiveView}
              hideHeader
              hideTrendCard
              hideReplyOpsCards
              frameless
              reviewWindowDays={REVIEW_WINDOW_DAYS}
              autoPregenerate
            />
          </>
        )}
      </main>
    </div>
  );
}

export default GbpManagerPage;
