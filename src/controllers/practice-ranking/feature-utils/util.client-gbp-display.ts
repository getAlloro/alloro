/**
 * Client GBP display fields for a persisted ranking's `raw_data.client_gbp`.
 *
 * These are the review figures the Local Rankings dashboard reads and shows to
 * the owner. They are SEPARATE from the scoring input (clientPracticeData),
 * which coerces missing data to 0 so the ranking algorithm always has a number.
 *
 * The distinction is the whole point: persisting the algorithm's coerced 0 makes
 * the dashboard show "0 reviews / 0.0 stars" for a practice whose GBP was never
 * scraped — indistinguishable from a real measured zero. Reading the raw source
 * with `?? null` keeps a genuine 0 (0 ?? null === 0) while turning ABSENT data
 * into null, so the surface can honestly render "—".
 */

export interface ClientGbpDisplayFields {
  /** All-time Google rating, or null when the GBP was not scraped. */
  averageRating: number | null;
  /** All-time review count, or null when unscraped. */
  totalReviewCount: number | null;
  /** New reviews in the trailing 30 days, or null when the window wasn't read. */
  reviewsLast30d: number | null;
}

interface GbpDataShape {
  reviews?: {
    allTime?: { averageRating?: number | null; totalReviewCount?: number | null } | null;
    window?: { newReviews?: number | null } | null;
  } | null;
}

/** Keep a finite number (including a real 0); everything else becomes null. */
function realOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildClientGbpDisplayFields(
  gbpData: GbpDataShape | null | undefined,
): ClientGbpDisplayFields {
  return {
    averageRating: realOrNull(gbpData?.reviews?.allTime?.averageRating),
    totalReviewCount: realOrNull(gbpData?.reviews?.allTime?.totalReviewCount),
    reviewsLast30d: realOrNull(gbpData?.reviews?.window?.newReviews),
  };
}
