import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import { useDashboardMetrics } from "../../../hooks/queries/useDashboardMetrics";
import { usePmsKeyData } from "../../../hooks/queries/usePmsKeyData";
import { useFormSubmissionsTimeseries } from "../../../hooks/queries/useFormSubmissionsTimeseries";
import { monthSortValue } from "../../../utils/timeframe";
import {
  referralStatus,
  localRankStatus,
  reviewTone,
  formSubsTone,
} from "./statusRules";
import type { StageTones } from "./verdict";

/**
 * useStageTones — the four journey-stage tones for the Practice Hub verdict,
 * derived from the SAME sources and rules as the StatCardRow dots so the verdict
 * and the stat tiles can never disagree on one screen. React Query dedupes the
 * shared fetches, so this adds no network cost alongside StatCardRow.
 */
export function useStageTones(): StageTones {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const metrics = useDashboardMetrics(orgId, locationId);
  const keyData = usePmsKeyData(orgId, locationId);
  const timeseries = useFormSubmissionsTimeseries("12m");

  const gbp = metrics.data?.gbp;
  const reviews = metrics.data?.reviews;

  const sortedMonths = [...(keyData.data?.months ?? [])].sort(
    (a, b) => monthSortValue(a.month) - monthSortValue(b.month),
  );
  const thisRef = sortedMonths.at(-1)?.totalReferrals ?? null;
  const priorRef = sortedMonths.at(-2)?.totalReferrals ?? null;
  // Verified (real raised hands), not total — total includes flagged spam/bots,
  // which would make the "bookable" stage tone reflect spam rather than reality.
  const thisMonthSubs = timeseries.data?.at(-1)?.verified ?? null;

  return {
    findable: localRankStatus(gbp?.days_since_last_post ?? null).tone,
    choosable: reviewTone(reviews?.current_rating ?? null),
    bookable: formSubsTone(thisMonthSubs),
    memorable: referralStatus(thisRef, priorRef).tone,
  };
}
