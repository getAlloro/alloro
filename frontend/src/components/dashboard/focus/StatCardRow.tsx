import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import { useDashboardMetrics } from "../../../hooks/queries/useDashboardMetrics";
import { usePmsKeyData } from "../../../hooks/queries/usePmsKeyData";
import { useFormSubmissionsTimeseries } from "../../../hooks/queries/useFormSubmissionsTimeseries";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../../contexts/OnboardingWizardContext";
import { StatCard } from "./StatCard";
import {
  formatDataMonth,
  monthSortValue,
  currentMonthLabel,
} from "../../../utils/timeframe";
import {
  referralStatus,
  rankTone,
  reviewTone,
  formSubsTone,
  type StatusTone,
} from "./statusRules";
import { useLabels } from "../../../hooks/useLabels";

/**
 * StatCardRow — the four compact metric tiles for the simplified Practice
 * Hub (Referrals · Local rank · Reviews · Form subs).
 *
 * Fetches the shared dashboard metrics + PMS series + form-submission
 * timeseries ONCE and renders four presentational <StatCard>s. Branches to
 * onboarding-wizard demo data when the tour is active.
 *
 * Spec: plans/06092026-practice-hub-simplification/spec.html (T3)
 */

interface CardModel {
  label: string;
  value: string;
  trailing: string | null;
  trailingTone: StatusTone | null;
  dotTone: StatusTone;
  /** Timeframe window line under the value (e.g. "April 2026", "all-time"). */
  sub?: string | null;
  /** Tone for the sub line — tinted for status subs (Local rank), else muted. */
  subTone?: StatusTone | null;
  href?: string;
  wizardTarget?: string;
}

const REVIEWS_HREF = "/gbp-manager"; // Reviews & Posts surface (not built yet)
const RANK_HREF = "/rankings";
const REFERRALS_HREF = "/referralEngine";
const FORMS_HREF = "/dfy/website?view=submissions";

function ratingText(rating: number | null): string | null {
  return rating === null ? null : `${rating.toFixed(1)}★`;
}

export function StatCardRow() {
  const isWizardActive = useIsWizardActive();
  const wizard = useWizardDemoData();
  const labels = useLabels();
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const metrics = useDashboardMetrics(orgId, locationId);
  const keyData = usePmsKeyData(orgId, locationId);
  const timeseries = useFormSubmissionsTimeseries("12m");

  let cards: CardModel[];

  if (isWizardActive && wizard) {
    // ---- Demo data path (onboarding tour) ------------------------------
    const dm = wizard.dashboardMetrics;
    const months = wizard.pmsCardData.months;
    const latest = months.at(-1) ?? null;
    const thisRef = latest?.totalReferrals ?? null;
    const priorRef = months.at(-2)?.totalReferrals ?? null;
    const refStatus = referralStatus(thisRef, priorRef);
    const rating = dm.reviews.average_rating;
    const demoMonth = formatDataMonth(latest?.month);

    cards = [
      {
        label: labels.referralsShort,
        value: thisRef != null ? String(thisRef) : String(dm.pms.total_referrals),
        trailing: refStatus.text,
        trailingTone: refStatus.tone,
        dotTone: refStatus.tone,
        sub: demoMonth || null,
        href: REFERRALS_HREF,
      },
      {
        label: "Local rank",
        value: `#${dm.ranking.position}`,
        trailing: null,
        trailingTone: null,
        dotTone: rankTone(dm.ranking.position ?? null),
        sub: null,
        href: RANK_HREF,
        wizardTarget: "dashboard-visibility",
      },
      {
        label: "Reviews",
        value: String(dm.reviews.this_month),
        trailing: ratingText(rating),
        trailingTone: null,
        dotTone: reviewTone(rating),
        sub: currentMonthLabel(),
        href: REVIEWS_HREF,
      },
      {
        label: "Form Submissions",
        value: String(dm.form_submissions.total),
        trailing: null,
        trailingTone: null,
        dotTone: formSubsTone(dm.form_submissions.total),
        sub: demoMonth || null,
        href: FORMS_HREF,
        wizardTarget: "dashboard-website",
      },
    ];
  } else {
    // ---- Real data path ------------------------------------------------
    const ranking = metrics.data?.ranking;
    const reviews = metrics.data?.reviews;

    // Chronological — month keys can be display labels ("Apr 2026"); a plain
    // localeCompare misorders them (same bug as the backend monthKey fix).
    const sortedMonths = [...(keyData.data?.months ?? [])].sort(
      (a, b) => monthSortValue(a.month) - monthSortValue(b.month),
    );
    const latestMonth = sortedMonths.at(-1) ?? null;
    const thisRef = latestMonth?.totalReferrals ?? null;
    const priorRef = sortedMonths.at(-2)?.totalReferrals ?? null;
    const refStatus = referralStatus(thisRef, priorRef);
    const referralsMonth = formatDataMonth(latestMonth?.month);

    const position = ranking?.position ?? null;
    const rating = reviews?.current_rating ?? null;
    // Reviews card shows THIS MONTH's new reviews, not the all-time total.
    // reviews_this_month is bounded to the current calendar month: the metrics
    // endpoint sets dateRange = 1st-of-month..today (UTC) and the GBP review
    // window is filtered by createTime within that range (DashboardController →
    // computeDashboardMetrics → review window). So it is labeled with the current
    // month (currentMonthLabel). The standing rating (current_rating, the all-time
    // Google average) sits beside it — we store no month-scoped average. All-time
    // total lives on the Reviews & Posts page and Local Rankings' all-time line.
    const reviewsThisMonth = reviews?.reviews_this_month ?? null;

    const latestSubs = timeseries.data?.at(-1) ?? null;
    // Show VERIFIED submissions, not total: `total` includes flagged spam and
    // blocked bots, so it overcounts the real people who reached out. `verified`
    // is the canonical raised-hand count (is_flagged=false, non-newsletter) used
    // by every other surface (the WebsiteOverview modal, countVerifiedByProjectId).
    const thisMonthSubs = latestSubs?.verified ?? null;
    const submissionsMonth = formatDataMonth(latestSubs?.month);

    cards = [
      {
        label: labels.referralsShort,
        value: thisRef != null ? String(thisRef) : "—",
        trailing: refStatus.text,
        trailingTone: refStatus.tone,
        dotTone: refStatus.tone,
        sub: referralsMonth || null,
        href: REFERRALS_HREF,
      },
      {
        label: "Local rank",
        value: position != null ? `#${position}` : "—",
        trailing: null,
        trailingTone: null,
        dotTone: rankTone(position),
        sub: null,
        href: RANK_HREF,
        wizardTarget: "dashboard-visibility",
      },
      {
        label: "Reviews",
        value: reviewsThisMonth != null ? String(reviewsThisMonth) : "—",
        trailing: ratingText(rating),
        trailingTone: null,
        dotTone: reviewTone(rating),
        sub: currentMonthLabel(),
        href: REVIEWS_HREF,
      },
      {
        label: "Form Submissions",
        value: thisMonthSubs != null ? String(thisMonthSubs) : "—",
        trailing: null,
        trailingTone: null,
        dotTone: formSubsTone(thisMonthSubs),
        sub: submissionsMonth || null,
        href: FORMS_HREF,
        wizardTarget: "dashboard-website",
      },
    ];
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}

export default StatCardRow;
