import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import { useDashboardMetrics } from "../../../hooks/queries/useDashboardMetrics";
import { usePmsKeyData } from "../../../hooks/queries/usePmsKeyData";
import { useFormSubmissionsTimeseries } from "../../../hooks/queries/useFormSubmissionsTimeseries";
import { formatDataMonth, monthSortValue } from "../../../utils/timeframe";
import {
  referralStatus,
  rankTone,
  reviewTone,
  formSubsTone,
  withFreshness,
  isMonthStale,
} from "./statusRules";
import type { StageTones } from "./verdict";

export interface StageToneResult {
  tones: StageTones;
  /**
   * The data month behind a stage whose tone was downgraded for age, e.g.
   * "January 2026" — null when nothing was stale. The banner states this instead
   * of a verdict when every stage is stale, so an owner sees WHY Alloro went
   * quiet rather than a bare "connect your data" that reads as "you never did".
   */
  staleNote: string | null;
}

/**
 * useStageTones — the four journey-stage tones for the Practice Hub verdict,
 * derived from the SAME sources and rules as the StatCardRow dots so the verdict
 * and the stat tiles can never disagree on one screen. React Query dedupes the
 * shared fetches, so this adds no network cost alongside StatCardRow.
 *
 * FRESHNESS: a tone is only as current as the data under it. The referral
 * (memorable) tone comes from monthly PMS data that can stop arriving without
 * anything else changing, so it is gated on the age of its own latest month —
 * stale data yields `unknown`, never a green "fine" (see STALE_AFTER_DAYS).
 * StatCardRow applies the same gate to its dots.
 */
export function useStageTones(): StageToneResult {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const metrics = useDashboardMetrics(orgId, locationId);
  const keyData = usePmsKeyData(orgId, locationId);
  const timeseries = useFormSubmissionsTimeseries("12m");

  const ranking = metrics.data?.ranking;
  const reviews = metrics.data?.reviews;

  const sortedMonths = [...(keyData.data?.months ?? [])].sort(
    (a, b) => monthSortValue(a.month) - monthSortValue(b.month),
  );
  const latestMonth = sortedMonths.at(-1) ?? null;
  const thisRef = latestMonth?.totalReferrals ?? null;
  const priorRef = sortedMonths.at(-2)?.totalReferrals ?? null;
  // Only call it stale when there IS data with a readable month behind it. With
  // no PMS data at all the tone is already `unknown` for the honest reason
  // (nothing connected), and claiming staleness would invent a feed that stopped.
  const referralsStale =
    latestMonth != null && isMonthStale(latestMonth.month);
  // Verified (real raised hands), not total — total includes flagged spam/bots,
  // which would make the "bookable" stage tone reflect spam rather than reality.
  const thisMonthSubs = timeseries.data?.at(-1)?.verified ?? null;

  // ⚠️ RETIRED VOCABULARY (Corey, 2026-07-17): these four StageTones keys are the
  // retired journey-lattice ladder. Canon is Get Found / Get Considered / Get
  // Chosen. The keys are left as-is here ONLY because renaming the StageTones
  // contract is a separate change across several files; this fix must not smuggle
  // a rename into a verdict-honesty patch. Flagged so it is not mistaken for
  // current vocabulary — see the anchor memory project_funnel_three_gates.
  return {
    tones: {
      findable: rankTone(ranking?.position ?? null),
      choosable: reviewTone(reviews?.current_rating ?? null),
      bookable: formSubsTone(thisMonthSubs),
      memorable: withFreshness(
        referralStatus(thisRef, priorRef).tone,
        latestMonth?.month,
      ),
    },
    staleNote: referralsStale ? formatDataMonth(latestMonth?.month) : null,
  };
}
