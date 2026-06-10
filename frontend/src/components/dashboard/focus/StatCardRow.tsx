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
  referralStatus,
  localRankStatus,
  reviewTone,
  formSubsTone,
  type StatusTone,
} from "./statusRules";

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
    const thisRef = months.at(-1)?.totalReferrals ?? null;
    const priorRef = months.at(-2)?.totalReferrals ?? null;
    const refStatus = referralStatus(thisRef, priorRef);
    const rankStatus = localRankStatus(null); // demo has no days_since_last_post
    const rating = dm.reviews.average_rating;

    cards = [
      {
        label: "Referrals",
        value: String(dm.pms.total_referrals),
        trailing: refStatus.text,
        trailingTone: refStatus.tone,
        dotTone: refStatus.tone,
        href: REFERRALS_HREF,
      },
      {
        label: "Local rank",
        value: `#${dm.ranking.position}`,
        trailing: rankStatus.text,
        trailingTone: rankStatus.tone,
        dotTone: rankStatus.tone,
        href: RANK_HREF,
        wizardTarget: "dashboard-visibility",
      },
      {
        label: "Reviews",
        value: String(dm.reviews.total),
        trailing: ratingText(rating),
        trailingTone: null,
        dotTone: reviewTone(rating),
        href: REVIEWS_HREF,
      },
      {
        label: "Form subs",
        value: String(dm.form_submissions.total),
        trailing: "this mo",
        trailingTone: null,
        dotTone: formSubsTone(dm.form_submissions.total),
        href: FORMS_HREF,
        wizardTarget: "dashboard-website",
      },
    ];
  } else {
    // ---- Real data path ------------------------------------------------
    const pms = metrics.data?.pms;
    const ranking = metrics.data?.ranking;
    const gbp = metrics.data?.gbp;
    const reviews = metrics.data?.reviews;

    const sortedMonths = [...(keyData.data?.months ?? [])].sort((a, b) =>
      a.month.localeCompare(b.month),
    );
    const thisRef = sortedMonths.at(-1)?.totalReferrals ?? null;
    const priorRef = sortedMonths.at(-2)?.totalReferrals ?? null;
    const refStatus = referralStatus(
      pms?.total_referrals != null ? thisRef : null,
      priorRef,
    );

    const rankStatus = localRankStatus(gbp?.days_since_last_post ?? null);
    const position = ranking?.position ?? null;
    const rating = reviews?.current_rating ?? null;
    const reviewCount = reviews?.total_review_count ?? null;

    const thisMonthSubs = timeseries.data?.at(-1)?.total ?? null;

    cards = [
      {
        label: "Referrals",
        value: pms?.total_referrals != null ? String(pms.total_referrals) : "—",
        trailing: refStatus.text,
        trailingTone: refStatus.tone,
        dotTone: refStatus.tone,
        href: REFERRALS_HREF,
      },
      {
        label: "Local rank",
        value: position != null ? `#${position}` : "—",
        trailing: rankStatus.text,
        trailingTone: rankStatus.tone,
        dotTone: rankStatus.tone,
        href: RANK_HREF,
        wizardTarget: "dashboard-visibility",
      },
      {
        label: "Reviews",
        value: reviewCount != null ? String(reviewCount) : "—",
        trailing: ratingText(rating),
        trailingTone: null,
        dotTone: reviewTone(rating),
        href: REVIEWS_HREF,
      },
      {
        label: "Form subs",
        value: thisMonthSubs != null ? String(thisMonthSubs) : "—",
        trailing: "this mo",
        trailingTone: null,
        dotTone: formSubsTone(thisMonthSubs),
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
