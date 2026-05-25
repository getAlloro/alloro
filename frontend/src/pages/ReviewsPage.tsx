/**
 * Reviews -- "What are people saying?"
 *
 * The question every business owner checks at 10pm.
 * "Did anyone leave a review? Was it bad? Should I respond?"
 *
 * Data priority:
 * 1. review_notifications (individual reviews + AI drafts from /user/review-drafts)
 * 2. checkup_data.place.reviews (fallback from GBP checkup)
 *
 * Sections:
 * 1. Header with aggregate rating from checkup_data
 * 2. Recent reviews (from best available source, with AI drafts inline)
 * 3. Review velocity (you vs competitor)
 * 4. Sentiment summary (your moat words)
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Star,
  MessageSquare,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Check,
  Sparkles,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { apiGet, apiPatch } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { getPriorityItem } from "@/hooks/useLocalStorage";
import WarmEmptyState, { WARM_STATES } from "@/components/dashboard/WarmEmptyState";

// Wave 1 Patch 1 (Card 6 safety): the "Approve and Post" button posts a response
// to Google. Posting is deferred to Wave 5. This constant forces the button
// disabled in every backend state, regardless of the per-review `postable` field.
// Wave 5 flips this to true when review-response posting is ready to ship.
const POSTING_ENABLED = false;

// ─── Types ─────────────────────────────────────────────────────────

interface ReviewNotification {
  id: number;
  reviewer_name: string | null;
  star_rating: number | null;
  review_text: string | null;
  ai_response: string | null;
  status: string;
  postable: boolean;
  review_published_at: string | null;
  created_at: string;
}

interface ThemeCitation {
  theme: string;
  count: number;
  exampleQuote: string;
}

interface SentimentComparison {
  competitorName: string;
  competitorThemes: ThemeCitation[];
  yourThemes: ThemeCitation[];
  gaps: { theme: string; competitorCount: number; exampleQuote: string }[];
  insight: string;
}

interface CheckupReview {
  rating?: number;
  text?: string | { text?: string };
  authorAttribution?: { displayName?: string };
  authorName?: string;
  relativePublishTimeDescription?: string;
}

// ─── Collapsible Section ───────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-stone-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-gray-400" />}
          <h2 className="text-sm font-semibold text-[#1A1D23] uppercase tracking-wider">
            {title}
          </h2>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

// ─── Star Rating Display ───────────────────────────────────────────

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const starSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <div className="flex">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`${starSize} ${
            i < rating ? "text-amber-400 fill-current" : "text-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Review Card (review_notifications source) ─────────────────────

function NotificationReviewCard({
  review,
  onApprove,
  approveError,
  isApproving,
}: {
  review: ReviewNotification;
  onApprove: (id: number) => void;
  approveError: string | null;
  isApproving: boolean;
}) {
  const publishDate = review.review_published_at || review.created_at;
  const formattedDate = publishDate
    ? new Date(publishDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="rounded-xl bg-[#F0EDE8] border border-gray-100 p-4 space-y-3">
      {/* Review header */}
      <div className="flex items-center gap-2">
        <StarRating rating={review.star_rating || 5} />
        <span className="text-xs text-[#1A1D23]/60">
          {review.reviewer_name || "Customer"}
        </span>
        {formattedDate && (
          <span className="text-xs text-gray-400">{formattedDate}</span>
        )}
      </div>

      {/* Review text */}
      {review.review_text && (
        <p className="text-sm text-[#1A1D23]/60 leading-relaxed">
          {review.review_text}
        </p>
      )}

      {/* AI draft response */}
      {review.ai_response && review.status === "new" && (
        <div className="rounded-lg bg-[#F0EDE8] border border-gray-200/60 p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#D56753]" />
            <span className="text-xs font-medium text-[#1A1D23]/60">
              Suggested response
            </span>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">
            {review.ai_response}
          </p>
          {review.postable ? (
            <div className="pt-1 space-y-1.5">
              <button
                onClick={() => onApprove(review.id)}
                disabled={isApproving || !POSTING_ENABLED}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D56753] text-white text-xs font-medium hover:bg-[#C05A48] transition-colors disabled:opacity-50"
              >
                <Check className="w-3 h-3" />
                {isApproving ? "Posting..." : "Approve and Post"}
              </button>
              {approveError && (
                <p className="text-xs text-red-500">{approveError}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 pt-1">
              Copy this response and post it on your Google Business Profile.
            </p>
          )}
        </div>
      )}

      {/* Already responded indicator */}
      {review.status === "responded" && (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Check className="w-3 h-3" />
          Response drafted
        </div>
      )}
    </div>
  );
}

// ─── Review Card (checkup_data fallback source) ────────────────────

function CheckupReviewCard({ review }: { review: CheckupReview }) {
  const reviewText =
    typeof review.text === "object" ? review.text?.text : review.text;
  const authorName =
    review.authorAttribution?.displayName || review.authorName || "Customer";

  return (
    <div className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
      <div className="flex items-center gap-2 mb-1">
        <StarRating rating={review.rating || 5} />
        <span className="text-xs text-[#1A1D23]/60">{authorName}</span>
        {review.relativePublishTimeDescription && (
          <span className="text-xs text-gray-400">
            {review.relativePublishTimeDescription}
          </span>
        )}
      </div>
      {reviewText && (
        <p className="text-sm text-gray-500 leading-relaxed line-clamp-3">
          {reviewText}
        </p>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────

export default function ReviewsPage() {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId || null;
  const queryClient = useQueryClient();
  const [approveError, setApproveError] = useState<string | null>(null);

  // Approve mutation -- only fires for postable reviews
  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiPatch({ path: `/user/review-drafts/${id}`, passedData: { action: "approve" } });
      return res as { success: boolean; posted?: boolean; message?: string };
    },
    onSuccess: (data) => {
      if (data?.posted) {
        setApproveError(null);
        queryClient.invalidateQueries({ queryKey: ["review-drafts", orgId] });
      } else {
        setApproveError(data?.message || "Could not post to Google. Try again later.");
      }
    },
    onError: () => {
      setApproveError("Could not post to Google. Try again later.");
    },
  });

  // Aggregate review data from checkup
  const { data: ctx } = useQuery<Record<string, unknown>>({
    queryKey: ["reviews-context", orgId, selectedLocation?.id],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // Individual reviews from review_notifications
  const { data: reviewNotifData } = useQuery<{
    success: boolean;
    reviews: ReviewNotification[];
  }>({
    queryKey: ["review-drafts", orgId],
    queryFn: () => apiGet({ path: "/user/review-drafts" }).catch(() => null),
    enabled: !!orgId,
    staleTime: 120_000,
  });

  // Review velocity from one-action-card
  const { data: velocityData } = useQuery<Record<string, number | string> | null>({
    queryKey: ["review-velocity", orgId],
    queryFn: async () => {
      const res = await apiGet({ path: `/user/one-action-card` });
      const cardData = res as Record<string, unknown>;
      return cardData?.competitorVelocity as Record<string, number | string> | null ?? null;
    },
    enabled: !!orgId,
    staleTime: 120_000,
  });

  // Ranking data for competitor review counts
  const { data: rankingRaw } = useQuery<Record<string, unknown> | null>({
    queryKey: ["reviews-ranking", orgId, selectedLocation?.id],
    queryFn: async () => {
      const locParam = selectedLocation?.id ? `?locationId=${selectedLocation.id}` : "";
      const token = getPriorityItem("auth_token") || getPriorityItem("token");
      const res = await fetch(
        `/api/user/ranking/latest${locParam}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.rankings?.[0] || data?.results?.[0] || null;
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // Sentiment comparison: theme gaps vs competitor
  const { data: sentimentData, isLoading: sentimentLoading } = useQuery<{
    success: boolean;
    comparison: SentimentComparison | null;
    cached?: boolean;
    reason?: string;
  }>({
    queryKey: ["review-sentiment", orgId],
    queryFn: () => apiGet({ path: "/user/review-sentiment" }),
    enabled: !!orgId,
    staleTime: 10 * 60_000, // 10 min client-side, 7-day server cache
    retry: false,
  });

  const sentimentComparison = sentimentData?.comparison || null;

  // Parse checkup data
  const orgData = (ctx as Record<string, Record<string, unknown>> | undefined)?.org;
  const orgName = (orgData?.name as string) || "";
  let checkupData: Record<string, unknown> | null =
    (orgData?.checkup_data as Record<string, unknown>) || null;
  if (typeof checkupData === "string") {
    try {
      checkupData = JSON.parse(checkupData);
    } catch {
      checkupData = null;
    }
  }

  const placeData = (checkupData?.place as Record<string, unknown>) || {};
  const checkupReviews = (placeData.reviews as CheckupReview[]) || [];
  const reviewCount =
    (placeData.reviewCount as number) ||
    (checkupData?.reviewCount as number) ||
    0;
  const rating = (placeData.rating as number) || null;

  // review_notifications are the primary source
  const notifications = reviewNotifData?.reviews || [];
  const hasNotifications = notifications.length > 0;

  // Oz moments from checkup analysis (patterns found in reviews)
  const ozMoments = (checkupData?.ozMoments as Array<Record<string, string>>) || [];
  const sentimentMoments = ozMoments
    .filter((m) => !!m.hook)
    .slice(0, 5);

  // Sentiment insight summary from checkup analysis
  const sentimentInsight = checkupData?.sentimentInsight as
    | { summary?: string; positiveThemes?: string[]; negativeThemes?: string[] }
    | null;

  // Competitor review data from ranking analysis
  const rawData = (rankingRaw as Record<string, unknown>)?.rawData as Record<string, unknown> | undefined;
  const competitors = (rawData?.competitors as Array<Record<string, unknown>>) || [];
  // Filter out the client's own locations (same brand name prefix)
  const orgNameNorm = (orgName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const filteredCompetitors = orgNameNorm
    ? competitors.filter((c) => {
        const cName = ((c.name as string) || ((c.displayName as Record<string, string>)?.text) || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        return !cName.startsWith(orgNameNorm) && !orgNameNorm.startsWith(cName);
      })
    : competitors;
  const topCompetitors = [...filteredCompetitors]
    .sort((a, b) => (
      ((b.userRatingCount as number) || (b.reviewCount as number) || (b.totalReviews as number) || 0) -
      ((a.userRatingCount as number) || (a.reviewCount as number) || (a.totalReviews as number) || 0)
    ))
    .slice(0, 5);

  const googleSearchUrl = orgName ? `https://www.google.com/search?q=${encodeURIComponent(orgName)}` : undefined;

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-4">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-semibold text-[#1A1D23] tracking-tight">
            What People Are Saying
          </h1>
          <p className="text-sm text-gray-400 mt-1">Alloro monitors your Google reviews daily. AI-drafted responses appear here within 24 hours of a new review.</p>
          {rating && reviewCount > 0 && (
            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-[#1A1D23]">{rating}</span>
                <StarRating rating={Math.round(rating)} size="md" />
              </div>
              <div className="w-px h-8 bg-stone-200/60" />
              <div>
                <p className="text-lg font-semibold text-[#1A1D23]">{reviewCount}</p>
                <p className="text-xs text-gray-400">total reviews</p>
              </div>
              {googleSearchUrl && (
                <>
                  <div className="w-px h-8 bg-stone-200/60" />
                  <a
                    href={googleSearchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#D56753] font-semibold hover:underline"
                  >
                    Verify on Google <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              )}
            </div>
          )}
        </motion.div>

        {/* Recent Reviews -- primary source: review_notifications */}
        <Section title="Recent Reviews" icon={Star} defaultOpen={true}>
          {hasNotifications ? (
            <div className="space-y-3">
              {notifications.slice(0, 10).map((review) => (
                <NotificationReviewCard
                  key={review.id}
                  review={review}
                  onApprove={(id) => { setApproveError(null); approveMutation.mutate(id); }}
                  approveError={approveError}
                  isApproving={approveMutation.isPending}
                />
              ))}
            </div>
          ) : checkupReviews.length > 0 ? (
            <div className="space-y-3">
              {checkupReviews.slice(0, 5).map((review, i) => (
                <CheckupReviewCard key={i} review={review} />
              ))}
            </div>
          ) : reviewCount > 0 ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-[#F0EDE8] border border-gray-100 p-4">
                <div className="flex items-center gap-3 mb-2">
                  {rating && <StarRating rating={Math.round(rating)} size="md" />}
                  <span className="text-lg font-semibold text-[#1A1D23]">{rating} stars</span>
                </div>
                <p className="text-sm text-gray-500">
                  {reviewCount} reviews on Google. Alloro syncs your reviews daily and generates AI-drafted responses for new ones.
                </p>
              </div>
            </div>
          ) : (
            <WarmEmptyState {...WARM_STATES.reviews} />
          )}
        </Section>

        {/* Pending AI Drafts count (quick glance) */}
        {hasNotifications &&
          notifications.filter((r) => r.ai_response && r.status === "new").length >
            0 && (
            <div className="rounded-xl bg-[#FDF4F2] border border-[#D56753]/10 px-5 py-3 flex items-center gap-3">
              <MessageSquare className="w-4 h-4 text-[#D56753]" />
              <p className="text-sm text-gray-500">
                <span className="font-medium text-[#1A1D23]">
                  {
                    notifications.filter(
                      (r) => r.ai_response && r.status === "new"
                    ).length
                  }{" "}
                  AI-drafted responses
                </span>{" "}
                ready for your approval above.
              </p>
            </div>
          )}

        {/* Review Velocity / Competitor Comparison */}
        <Section title="Your Reviews vs. Competitors" icon={TrendingUp} defaultOpen={true}>
          {velocityData ? (
            <div className="flex items-center gap-6 text-sm">
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                  You
                </p>
                <p className="text-lg font-semibold text-[#1A1D23]">
                  {(velocityData as Record<string, unknown>).clientReviewsThisMonth as number}
                </p>
                <p className="text-xs text-gray-400">this month</p>
              </div>
              <div className="w-px h-10 bg-gray-200" />
              <div>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                  {(velocityData as Record<string, unknown>).competitorName as string}
                </p>
                <p className="text-lg font-semibold text-[#1A1D23]">
                  {(velocityData as Record<string, unknown>).competitorReviewsThisMonth as number}
                </p>
                <p className="text-xs text-gray-400">this month</p>
              </div>
            </div>
          ) : topCompetitors.length > 0 && reviewCount > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-3">
                How your {reviewCount} reviews compare to the top competitors in your market.
              </p>
              {/* You row */}
              <div className="flex items-center justify-between rounded-xl bg-emerald-50/60 border border-emerald-200/40 p-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[#1A1D23]">{orgName || "You"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <StarRating rating={Math.round(rating || 0)} />
                  <span className="text-sm text-[#1A1D23]/60">{rating}</span>
                  <span className="text-sm font-semibold text-[#1A1D23]">{reviewCount} reviews</span>
                </div>
              </div>
              {/* Competitor rows */}
              {topCompetitors.map((comp, i) => {
                const compReviews = (comp.userRatingCount as number) || (comp.reviewCount as number) || (comp.totalReviews as number) || 0;
                const compRating = (comp.rating as number) || (comp.averageRating as number) || 0;
                const compName = (comp.name as string) || (comp.displayName as Record<string, string>)?.text || `Competitor ${i + 1}`;
                const gap = compReviews - reviewCount;
                return (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-stone-50/80 border border-stone-200/60 p-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-sm text-[#1A1D23] truncate">{compName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StarRating rating={Math.round(compRating)} />
                      <span className="text-sm text-[#1A1D23]/60">{compRating}</span>
                      <span className="text-sm font-semibold text-[#1A1D23]">{compReviews} reviews</span>
                      {gap > 0 && (
                        <span className="text-xs text-red-500 font-medium">+{gap}</span>
                      )}
                      {gap < 0 && (
                        <span className="text-xs text-emerald-500 font-medium">{gap}</span>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-gray-400 mt-2">
                Alloro tracks monthly review velocity once two weeks of data have accumulated.
              </p>
            </div>
          ) : reviewCount > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-500">
                You have {reviewCount} total reviews{rating ? ` at ${rating} stars` : ""}. Alloro is tracking your review velocity against your top competitor. Monthly comparison data will appear here as it accumulates.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Review velocity tracks your new reviews per month against your top competitor. Connect your Google Business Profile to start tracking.
            </p>
          )}
        </Section>

        {/* Sentiment Comparison: the "how did they know that?" section */}
        {(sentimentComparison || sentimentLoading || sentimentMoments.length > 0 || sentimentInsight?.summary || (rating && reviewCount > 0)) && (
          <Section title="What Your Reviews Reveal" defaultOpen={true}>
            {sentimentComparison && sentimentComparison.insight ? (
              <div className="space-y-4">
                {/* The insight that stops scrolling */}
                <div className="rounded-xl bg-[#FDF4F2] border border-[#D56753]/10 p-5">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-[#D56753] mt-0.5 shrink-0" />
                    <p className="text-sm font-medium text-[#1A1D23] leading-relaxed">
                      {sentimentComparison.insight}
                    </p>
                  </div>
                </div>

                {/* Your themes */}
                {sentimentComparison.yourThemes.length > 0 && (
                  <div className="rounded-xl bg-[#F0EDE8] border border-gray-100 p-4 space-y-3">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                      What your patients say about you
                    </p>
                    {sentimentComparison.yourThemes.map((t, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-medium shrink-0">
                          {t.count}x
                        </span>
                        <div>
                          <p className="text-sm font-medium text-[#1A1D23]">{t.theme}</p>
                          {t.exampleQuote && (
                            <p className="text-xs text-[#1A1D23]/40 mt-0.5 italic">
                              &ldquo;{t.exampleQuote}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Competitor themes */}
                {sentimentComparison.competitorThemes.length > 0 && (
                  <div className="rounded-xl bg-[#F0EDE8] border border-gray-100 p-4 space-y-3">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                      What patients say about {sentimentComparison.competitorName}
                    </p>
                    {sentimentComparison.competitorThemes.map((t, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                          sentimentComparison.gaps.some((g) => g.theme === t.theme)
                            ? "bg-red-50 text-red-500"
                            : "bg-stone-100 text-[#1A1D23]/40"
                        }`}>
                          {t.count}x
                        </span>
                        <div>
                          <p className={`text-sm text-[#1A1D23] ${
                            sentimentComparison.gaps.some((g) => g.theme === t.theme)
                              ? "font-medium"
                              : ""
                          }`}>
                            {t.theme}
                            {sentimentComparison.gaps.some((g) => g.theme === t.theme) && (
                              <span className="ml-2 text-xs text-red-500 font-medium">gap</span>
                            )}
                          </p>
                          {t.exampleQuote && (
                            <p className="text-xs text-[#1A1D23]/40 mt-0.5 italic">
                              &ldquo;{t.exampleQuote}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-gray-400">
                  Alloro reads your reviews and your top competitor's reviews, then identifies themes they're known for that you are not. Updated weekly.
                </p>
              </div>
            ) : sentimentLoading ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-[#F0EDE8] border border-gray-100 p-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ) : (
              <>
                {/* Fallback: ozMoments or generic rating context */}
                {sentimentInsight?.summary && (
                  <p className="text-sm text-gray-500 leading-relaxed mb-4">
                    {sentimentInsight.summary}
                  </p>
                )}
                {sentimentMoments.length > 0 && (
                  <div className="space-y-3">
                    {sentimentMoments.map((moment, i) => (
                      <div key={i} className="rounded-xl bg-[#F0EDE8] border border-gray-100 p-4">
                        <p className="text-sm font-medium text-[#1A1D23]">{moment.hook}</p>
                        {moment.implication && (
                          <p className="text-sm text-[#1A1D23]/60 mt-1">{moment.implication}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {sentimentMoments.length === 0 && !sentimentInsight?.summary && rating && reviewCount > 0 && (
                  <div className="rounded-xl bg-[#F0EDE8] border border-gray-100 p-4">
                    <p className="text-sm font-medium text-[#1A1D23]">
                      {rating >= 4.5
                        ? `${rating} stars puts you above the threshold most consumers require before choosing a provider.`
                        : rating >= 4.0
                          ? `${rating} stars is solid. Most consumers filter for 4+ stars, so you clear the bar.`
                          : `${rating} stars means some consumers will filter you out. Getting above 4.0 is the priority.`}
                    </p>
                    <p className="text-sm text-[#1A1D23]/60 mt-1">
                      Alloro is analyzing your reviews against your top competitor's. The comparison will appear here once both sets of reviews are loaded.
                    </p>
                  </div>
                )}
                {sentimentMoments.length === 0 && !sentimentInsight?.summary && (!rating || reviewCount === 0) && (
                  <WarmEmptyState {...WARM_STATES.sentiment} />
                )}
              </>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}
