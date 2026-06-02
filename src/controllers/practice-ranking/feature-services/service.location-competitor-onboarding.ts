/**
 * Location Competitor Onboarding Service
 *
 * v2 user-curated competitor list flow. Each location moves through:
 *   pending  → (runDiscoveryForLocation populates initial scrape) →
 *   curating → (user adds/removes via the curate UI) →
 *   finalized (finalizeAndTriggerRun freezes the list and kicks off ranking)
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 */

import { v4 as uuidv4 } from "uuid";
import type { Knex } from "knex";
import { db } from "../../../database/connection";
import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { fetchGBPDataForRange } from "../../../utils/dataAggregation/dataAggregator";
import { LocationModel } from "../../../models/LocationModel";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import {
  AddCompetitorInput,
  ILocationCompetitor,
  LocationCompetitorModel,
  ProfileStrengthFactors,
  ProfileStrengthTier,
} from "../../../models/LocationCompetitorModel";
import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { identifyLocationMeta } from "../../agents/feature-services/service.webhook-orchestrator";
import {
  COMPARISON_SPECIALTY_OPTIONS,
  filterBySpecialty,
  discoverCompetitorsViaPlaces,
  discoverCompetitorsViaPlacesWideRadius,
  resolveComparisonSpecialty,
  type ComparisonSpecialty,
  type DiscoveredCompetitor,
  getClientPhotosViaPlaces,
} from "./service.places-competitor-discovery";
import { getPlaceDetails } from "../../places/feature-services/GooglePlacesApiService";
import { processLocationRanking } from "./service.ranking-pipeline";
import {
  isRetryableExternalError,
  runWithRetry,
  summarizeRetryAttempts,
} from "./service.ranking-resilience";
import { log, logError } from "../feature-utils/util.ranking-logger";
import {
  DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS,
  MAX_COMPETITORS_PER_LOCATION,
  validateDiscoveryRadiusMeters,
} from "../feature-utils/util.competitor-validator";

// In-flight ranking dedup window for finalize-and-run.
// If user double-clicks within this window, we return the existing batchId.
const FINALIZE_DEDUPE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Re-run discovery if the latest initial_scrape entry is older than this.
const DISCOVERY_FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const WIDE_RADIUS_DISCOVERY_THRESHOLD_METERS = 80467; // 50 miles

// =====================================================================
// TYPES
// =====================================================================

export interface LoadedLocationContext {
  locationId: number;
  organizationId: number;
  organizationDomain: string;
  locationName: string;
  selectedGbp: {
    google_connection_id: number;
    account_id: string | null;
    external_id: string;
    display_name: string | null;
  };
  competitorDiscoveryRadiusMeters: number;
}

export interface DiscoveryResult {
  status: "fresh" | "stale_skipped" | "completed";
  competitorCount: number;
  specialty: string | null;
  marketLocation: string | null;
  radiusMeters: number;
  comparisonSpecialty: ComparisonSpecialtyPayload | null;
}

export interface CompetitorDiscoverySuggestion {
  placeId: string;
  name: string;
  address: string | null;
  primaryType: string | null;
  rating: number | null;
  reviewCount: number | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  photoName: string | null;
  discoveryPosition: number | null;
  discoveryQuery: string | null;
  discoverySource: string | null;
  discoveryCheckedAt: Date | null;
  discoveryRadiusMeters: number;
  profileStrengthScore: number | null;
  profileStrengthTier: ProfileStrengthTier | null;
  profileStrengthFactors: ProfileStrengthFactors | null;
}

export interface DiscoverySuggestionsResult extends DiscoveryResult {
  suggestions: CompetitorDiscoverySuggestion[];
}

export interface CompetitorPlacePreviewResult {
  competitor: CompetitorDiscoverySuggestion;
  radiusMeters: number;
  mapsMatched: boolean;
  comparisonSpecialty: ComparisonSpecialtyPayload | null;
}

export interface FinalizeAndRunResult {
  batchId: string;
  rankingId: number;
  reused: boolean;
  competitorSetRevision: number;
  selectedCount: number;
}

export interface ReselectCompetitorsAndRunResult extends FinalizeAndRunResult {}

export interface ComparisonSpecialtyPayload {
  value: string;
  label: string;
  query: string;
  sourceSpecialty: string;
}

export const COMPARISON_SPECIALTY_PAYLOAD_OPTIONS =
  COMPARISON_SPECIALTY_OPTIONS;

interface CompetitorSnapshot {
  revision: number;
  capturedAt: string;
  competitors: Array<{
    placeId: string;
    name: string;
    rating: number | null;
    reviewCount: number | null;
    discoveryPosition: number | null;
    discoveryQuery: string | null;
    discoverySource: string | null;
    discoveryCheckedAt: string | null;
    discoveryRadiusMeters: number | null;
    profileStrengthScore: number | null;
    profileStrengthTier: ProfileStrengthTier | null;
  }>;
}

interface DiscoveryMatchResult {
  match: DiscoveredCompetitor | null;
  checkedAt: Date | null;
  measured: boolean;
}

function calculateProfileStrength(
  input: Pick<
    AddCompetitorInput,
    | "rating"
    | "reviewCount"
    | "website"
    | "phone"
    | "primaryType"
    | "lat"
    | "lng"
    | "photoName"
  >
): {
  profileStrengthScore: number | null;
  profileStrengthTier: ProfileStrengthTier;
  profileStrengthFactors: ProfileStrengthFactors;
} {
  const factors: ProfileStrengthFactors = {
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? null,
    hasWebsite: Boolean(input.website),
    hasPhone: Boolean(input.phone),
    hasCategory: Boolean(input.primaryType),
    hasCoordinates: input.lat !== null && input.lat !== undefined && input.lng !== null && input.lng !== undefined,
    hasPhoto: Boolean(input.photoName),
  };

  const hasAnySignal =
    factors.rating !== null ||
    factors.reviewCount !== null ||
    factors.hasWebsite ||
    factors.hasPhone ||
    factors.hasCategory ||
    factors.hasCoordinates ||
    factors.hasPhoto;

  if (!hasAnySignal) {
    return {
      profileStrengthScore: null,
      profileStrengthTier: "not_measured",
      profileStrengthFactors: factors,
    };
  }

  const ratingScore =
    factors.rating !== null ? Math.min(Math.max(factors.rating, 0), 5) / 5 * 30 : 0;
  const reviewScore =
    factors.reviewCount !== null
      ? Math.min(Math.max(factors.reviewCount, 0), 300) / 300 * 35
      : 0;
  const completenessScore =
    (factors.hasWebsite ? 8 : 0) +
    (factors.hasPhone ? 7 : 0) +
    (factors.hasCategory ? 8 : 0) +
    (factors.hasCoordinates ? 7 : 0) +
    (factors.hasPhoto ? 5 : 0);
  const score = Math.round((ratingScore + reviewScore + completenessScore) * 100) / 100;

  let tier: ProfileStrengthTier = "needs_review";
  if (score >= 75) {
    tier = "strong";
  } else if (score >= 55) {
    tier = "competitive";
  }

  return {
    profileStrengthScore: score,
    profileStrengthTier: tier,
    profileStrengthFactors: factors,
  };
}

function withProfileStrength(input: AddCompetitorInput): AddCompetitorInput {
  const strength = calculateProfileStrength(input);
  return {
    ...input,
    profileStrengthScore: strength.profileStrengthScore,
    profileStrengthTier: strength.profileStrengthTier,
    profileStrengthFactors: strength.profileStrengthFactors,
  };
}

function resolveDiscoveryRadiusMeters(
  raw: unknown,
  fallback: number = DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS
): number {
  const validation = validateDiscoveryRadiusMeters(raw, fallback);
  if (!validation.valid) {
    throw Object.assign(new Error(validation.body.message), {
      code: validation.body.error,
    });
  }
  return validation.radiusMeters;
}

function formatComparisonSpecialtyPayload(
  comparison: ComparisonSpecialty,
  sourceSpecialty: string
): ComparisonSpecialtyPayload {
  return {
    value: comparison.value,
    label: comparison.label,
    query: comparison.query,
    sourceSpecialty,
  };
}

function resolveComparisonSpecialtyPayload(
  clientSpecialty: string,
  requestedSpecialty?: string
): {
  comparison: ComparisonSpecialty;
  payload: ComparisonSpecialtyPayload;
} {
  const comparison = resolveComparisonSpecialty(
    requestedSpecialty || clientSpecialty
  );
  return {
    comparison,
    payload: formatComparisonSpecialtyPayload(comparison, clientSpecialty),
  };
}

function buildCompetitorSuggestion(
  comp: DiscoveredCompetitor,
  radiusMeters: number
): CompetitorDiscoverySuggestion {
  const input = withProfileStrength({
    placeId: comp.placeId,
    name: comp.name,
    address: comp.address || null,
    primaryType: comp.primaryType || null,
    rating: comp.totalScore ?? null,
    reviewCount: comp.reviewsCount ?? null,
    lat: comp.location?.lat ?? null,
    lng: comp.location?.lng ?? null,
    phone: comp.phone || null,
    website: comp.website || null,
    photoName: comp.photoName || null,
    discoveryPosition: comp.discoveryPosition ?? null,
    discoveryQuery: comp.discoveryQuery ?? null,
    discoverySource: comp.discoverySource ?? "places_text",
    discoveryCheckedAt: comp.discoveryCheckedAt ?? null,
    discoveryRadiusMeters: radiusMeters,
    source: "initial_scrape",
    addedByUserId: null,
  });

  return {
    placeId: input.placeId,
    name: input.name,
    address: input.address ?? null,
    primaryType: input.primaryType ?? null,
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    photoName: input.photoName ?? null,
    discoveryPosition: input.discoveryPosition ?? null,
    discoveryQuery: input.discoveryQuery ?? null,
    discoverySource: input.discoverySource ?? null,
    discoveryCheckedAt: input.discoveryCheckedAt ?? null,
    discoveryRadiusMeters: radiusMeters,
    profileStrengthScore: input.profileStrengthScore ?? null,
    profileStrengthTier: input.profileStrengthTier ?? null,
    profileStrengthFactors: input.profileStrengthFactors ?? null,
  };
}

function buildCompetitorSuggestionFromInput(
  input: AddCompetitorInput,
  radiusMeters: number
): CompetitorDiscoverySuggestion {
  return {
    placeId: input.placeId,
    name: input.name,
    address: input.address ?? null,
    primaryType: input.primaryType ?? null,
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    photoName: input.photoName ?? null,
    discoveryPosition: input.discoveryPosition ?? null,
    discoveryQuery: input.discoveryQuery ?? null,
    discoverySource: input.discoverySource ?? null,
    discoveryCheckedAt: input.discoveryCheckedAt ?? null,
    discoveryRadiusMeters: radiusMeters,
    profileStrengthScore: input.profileStrengthScore ?? null,
    profileStrengthTier: input.profileStrengthTier ?? null,
    profileStrengthFactors: input.profileStrengthFactors ?? null,
  };
}

async function discoverCompetitorCandidates(
  specialty: string,
  marketLocation: string,
  limit: number,
  locationBias: { lat: number; lng: number; radiusMeters?: number } | undefined
): Promise<DiscoveredCompetitor[]> {
  const comparison = resolveComparisonSpecialty(specialty);
  if (
    locationBias &&
    (locationBias.radiusMeters ?? 0) >= WIDE_RADIUS_DISCOVERY_THRESHOLD_METERS
  ) {
    return discoverCompetitorsViaPlacesWideRadius(
      comparison.query,
      limit,
      locationBias
    );
  }

  const rawCompetitors = await discoverCompetitorsViaPlaces(
    comparison.query,
    marketLocation,
    comparison.isDentalSpecialist ? 20 : limit,
    locationBias
  );

  if (comparison.isDentalSpecialist) {
    // The exact query ("endodontist in Falls Church, VA") is the primary
    // local-rank signal. Google often labels relevant specialist practices as
    // generic dentists, so do not reorder or drop top local Maps results here.
    return rawCompetitors.slice(0, limit);
  }

  return filterBySpecialty(rawCompetitors, comparison.query).slice(0, limit);
}

async function fetchPlaceDetailsForCompetitor(placeId: string): Promise<any> {
  try {
    return await getPlaceDetails(placeId);
  } catch (err: any) {
    throw Object.assign(
      new Error(`Failed to fetch place details: ${err.message}`),
      { code: "PLACES_LOOKUP_FAILED" }
    );
  }
}

async function findDiscoveryMatchForPlace(
  ctx: LoadedLocationContext,
  placeId: string,
  radiusMeters: number,
  comparisonSpecialtyInput?: string
): Promise<DiscoveryMatchResult> {
  const checkedAt = new Date();
  try {
    const { specialty, marketLocation } = await resolveSpecialtyAndMarket(ctx);
    const { comparison } = resolveComparisonSpecialtyPayload(
      specialty,
      comparisonSpecialtyInput
    );
    const clientResolution = await resolveClientPlaceId(ctx, marketLocation);
    const locationBias =
      clientResolution.lat !== null && clientResolution.lng !== null
        ? {
            lat: clientResolution.lat,
            lng: clientResolution.lng,
            radiusMeters,
          }
        : undefined;

    const candidates = await discoverCompetitorCandidates(
      comparison.query,
      marketLocation,
      20,
      locationBias
    );
    return {
      match: candidates.find((candidate) => candidate.placeId === placeId) ?? null,
      checkedAt,
      measured: true,
    };
  } catch (err: any) {
    log(
      `[ONBOARDING] [${ctx.locationId}] Could not measure Maps estimate for manually added competitor ${placeId}: ${err.message}`
    );
    return {
      match: null,
      checkedAt: null,
      measured: false,
    };
  }
}

function buildInputFromRawPlaceDetails(
  placeId: string,
  placeDetails: any,
  userId: number | null,
  discoveryRadiusMeters: number,
  discoveryResult?: DiscoveryMatchResult | null
): AddCompetitorInput {
  const discoveryMatch = discoveryResult?.match ?? null;
  return withProfileStrength({
    placeId,
    name:
      placeDetails?.displayName?.text ||
      placeDetails?.name ||
      discoveryMatch?.name ||
      "Unknown business",
    address:
      placeDetails?.formattedAddress || discoveryMatch?.address || null,
    primaryType:
      placeDetails?.primaryType || discoveryMatch?.primaryType || null,
    rating:
      typeof placeDetails?.rating === "number"
        ? placeDetails.rating
        : discoveryMatch?.totalScore ?? null,
    reviewCount:
      typeof placeDetails?.userRatingCount === "number"
        ? placeDetails.userRatingCount
        : discoveryMatch?.reviewsCount ?? null,
    lat:
      placeDetails?.location?.latitude ??
      discoveryMatch?.location?.lat ??
      null,
    lng:
      placeDetails?.location?.longitude ??
      discoveryMatch?.location?.lng ??
      null,
    phone: placeDetails?.nationalPhoneNumber || discoveryMatch?.phone || null,
    website: placeDetails?.websiteUri || discoveryMatch?.website || null,
    photoName: placeDetails?.photos?.[0]?.name || discoveryMatch?.photoName || null,
    discoveryPosition: discoveryMatch?.discoveryPosition ?? null,
    discoveryQuery: discoveryMatch?.discoveryQuery ?? null,
    discoverySource:
      discoveryMatch || discoveryResult?.measured ? "places_text" : "user_added",
    discoveryCheckedAt:
      discoveryMatch?.discoveryCheckedAt ?? discoveryResult?.checkedAt ?? null,
    discoveryRadiusMeters,
    source: "user_added",
    addedByUserId: userId,
  });
}

function buildSnapshot(
  competitors: ILocationCompetitor[],
  revision: number
): CompetitorSnapshot {
  return {
    revision,
    capturedAt: new Date().toISOString(),
    competitors: competitors.map((competitor) => ({
      placeId: competitor.place_id,
      name: competitor.name,
      rating:
        competitor.rating === null || competitor.rating === undefined
          ? null
          : Number(competitor.rating),
      reviewCount: competitor.review_count,
      lat:
        competitor.lat === null || competitor.lat === undefined
          ? null
          : Number(competitor.lat),
      lng:
        competitor.lng === null || competitor.lng === undefined
          ? null
          : Number(competitor.lng),
      discoveryPosition: competitor.discovery_position,
      discoveryQuery: competitor.discovery_query,
      discoverySource: competitor.discovery_source,
      discoveryCheckedAt: competitor.discovery_checked_at
        ? new Date(competitor.discovery_checked_at).toISOString()
        : null,
      discoveryRadiusMeters: competitor.discovery_radius_meters,
      profileStrengthScore:
        competitor.profile_strength_score === null ||
        competitor.profile_strength_score === undefined
          ? null
          : Number(competitor.profile_strength_score),
      profileStrengthTier: competitor.profile_strength_tier,
    })),
  };
}

// =====================================================================
// CONTEXT LOADING
// =====================================================================

async function loadLocationContext(
  locationId: number
): Promise<LoadedLocationContext> {
  const location = await LocationModel.findById(locationId);
  if (!location) {
    throw new Error(`Location ${locationId} not found`);
  }

  const org = await db("organizations")
    .where({ id: location.organization_id })
    .select("id", "domain", "archived_at")
    .first();
  if (!org) {
    throw new Error(`Organization ${location.organization_id} not found`);
  }
  if (org.archived_at) {
    throw new Error("Organization is archived; ranking competitor setup is disabled.");
  }

  const gbpProperties = await GooglePropertyModel.findByLocationId(locationId);
  const selectedGbp =
    gbpProperties.find((p: any) => p.selected) || gbpProperties[0];

  if (!selectedGbp) {
    throw new Error(
      `Location ${locationId} has no Google Business Profile property linked`
    );
  }

  return {
    locationId,
    organizationId: org.id,
    organizationDomain: org.domain || "",
    locationName: location.name,
    competitorDiscoveryRadiusMeters: Number(
      location.competitor_discovery_radius_meters ??
        DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS
    ),
    selectedGbp: {
      google_connection_id: selectedGbp.google_connection_id,
      account_id: selectedGbp.account_id || null,
      external_id: selectedGbp.external_id,
      display_name: selectedGbp.display_name || location.name,
    },
  };
}

// =====================================================================
// CLIENT PLACE-ID RESOLVER (self-filter source of truth)
// =====================================================================

export type ClientPlaceResolutionSource =
  | "cache"
  | "ranking_history"
  | "places_lookup"
  | "unresolved";

export interface ResolvedClientPlace {
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  source: ClientPlaceResolutionSource;
}

/**
 * Resolve the practice's own Google Places identifiers via a 3-step fallback:
 *
 *   1. cache           — `locations.client_place_id` already set
 *   2. ranking_history — find a prior `practice_rankings.search_results` entry
 *                        where `isClient: true` (validated by an actual run)
 *   3. places_lookup   — runtime `getClientPhotosViaPlaces` name search
 *
 * Persists the resolved value to `locations` so subsequent calls hit the cache.
 * Returns `source: 'unresolved'` when all three fail — callers must NOT swallow
 * this; the GET response surfaces it as `selfFilterStatus: 'unresolved'` so the
 * UI can prompt the user to remove their own listing manually if it slips in.
 *
 * `marketLocation` is required for step 3. Steps 1 and 2 don't need it; if you
 * don't have it, pass `null` and step 3 is skipped.
 */
export async function resolveClientPlaceId(
  ctx: LoadedLocationContext,
  marketLocation: string | null
): Promise<ResolvedClientPlace> {
  // Step 1 — cache on locations row
  const location = await LocationModel.findById(ctx.locationId);
  if (location?.client_place_id) {
    // pg returns decimal columns as strings; coerce so downstream
    // numeric ops (e.g. `.toFixed`) don't blow up.
    const lat =
      location.client_lat !== null && location.client_lat !== undefined
        ? Number(location.client_lat)
        : null;
    const lng =
      location.client_lng !== null && location.client_lng !== undefined
        ? Number(location.client_lng)
        : null;
    return {
      placeId: location.client_place_id,
      lat,
      lng,
      source: "cache",
    };
  }

  // Step 2 — latest valid ranking row's search_results JSONB
  try {
    const lastRanking = await db("practice_rankings")
      .where({ location_id: ctx.locationId })
      .where("search_status", "ok")
      .whereNotNull("search_results")
      .orderBy("created_at", "desc")
      .select("search_results", "search_lat", "search_lng")
      .first();

    if (lastRanking?.search_results) {
      const parsed =
        typeof lastRanking.search_results === "string"
          ? JSON.parse(lastRanking.search_results)
          : lastRanking.search_results;
      if (Array.isArray(parsed)) {
        const clientEntry = parsed.find(
          (r: any) => r && r.isClient === true && typeof r.placeId === "string"
        );
        if (clientEntry?.placeId) {
          const lat =
            lastRanking.search_lat !== null &&
            lastRanking.search_lat !== undefined
              ? Number(lastRanking.search_lat)
              : null;
          const lng =
            lastRanking.search_lng !== null &&
            lastRanking.search_lng !== undefined
              ? Number(lastRanking.search_lng)
              : null;
          await LocationModel.setClientIdentifiers(ctx.locationId, {
            placeId: clientEntry.placeId,
            lat,
            lng,
          });
          log(
            `[ONBOARDING] [${ctx.locationId}] Resolved client place_id from ranking history: ${clientEntry.placeId}`
          );
          return {
            placeId: clientEntry.placeId,
            lat,
            lng,
            source: "ranking_history",
          };
        }
      }
    }
  } catch (err: any) {
    log(
      `[ONBOARDING] [${ctx.locationId}] Ranking-history client lookup failed: ${err.message} — falling through to Places lookup`
    );
  }

  // Step 3 — runtime Places name search
  if (marketLocation) {
    try {
      const clientLookup = await getClientPhotosViaPlaces(
        ctx.locationName,
        marketLocation
      );
      if (clientLookup.placeId) {
        await LocationModel.setClientIdentifiers(ctx.locationId, {
          placeId: clientLookup.placeId,
          lat: clientLookup.lat,
          lng: clientLookup.lng,
        });
        log(
          `[ONBOARDING] [${ctx.locationId}] Resolved client place_id via Places lookup: ${clientLookup.placeId}`
        );
        return {
          placeId: clientLookup.placeId,
          lat: clientLookup.lat,
          lng: clientLookup.lng,
          source: "places_lookup",
        };
      }
    } catch (err: any) {
      log(
        `[ONBOARDING] [${ctx.locationId}] Places client lookup failed: ${err.message}`
      );
    }
  }

  log(
    `[ONBOARDING] [${ctx.locationId}] Client place_id UNRESOLVED — UI will prompt user to remove own listing manually if it appears`
  );
  return { placeId: null, lat: null, lng: null, source: "unresolved" };
}

// =====================================================================
// IDENTIFICATION (specialty + marketLocation)
// =====================================================================

async function resolveSpecialtyAndMarket(
  ctx: LoadedLocationContext
): Promise<{ specialty: string; marketLocation: string }> {
  // Prefer values from the most recent practice_rankings row for this location
  // — same identification logic already ran there and succeeded.
  const lastRanking = await db("practice_rankings")
    .where({ location_id: ctx.locationId })
    .whereNotNull("specialty")
    .whereNotNull("location")
    .orderBy("created_at", "desc")
    .select("specialty", "location")
    .first();

  if (lastRanking?.specialty && lastRanking?.location) {
    return {
      specialty: lastRanking.specialty,
      marketLocation: lastRanking.location,
    };
  }

  // Fallback: run the Identifier Agent against fresh GBP data
  let oauth2Client = await getValidOAuth2Client(
    ctx.selectedGbp.google_connection_id
  );
  const today = new Date().toISOString().split("T")[0];
  const gbpFetchResult = await runWithRetry(
    () =>
      fetchGBPDataForRange(
        oauth2Client,
        [
          {
            accountId: ctx.selectedGbp.account_id || "",
            locationId: ctx.selectedGbp.external_id,
            displayName: ctx.selectedGbp.display_name || ctx.locationName,
          },
        ],
        today,
        today,
        {
          refreshOAuth2Client: async () => {
            oauth2Client = await getValidOAuth2Client(
              ctx.selectedGbp.google_connection_id,
              { forceRefresh: true }
            );
            return oauth2Client;
          },
          throwOnLocationError: true,
        }
      ),
    {
      label: `competitor onboarding GBP ${ctx.selectedGbp.external_id}`,
      maxAttempts: 3,
      logger: log,
      shouldRetry: isRetryableExternalError,
    }
  );
  log(
    `[ONBOARDING] [${ctx.locationId}] GBP fetch ${summarizeRetryAttempts(
      gbpFetchResult.attempts
    )}`
  );
  const gbpProfile = gbpFetchResult.value;
  const locationData = gbpProfile?.locations?.[0]?.data || {};
  const meta = await identifyLocationMeta(locationData, ctx.organizationDomain);
  return { specialty: meta.specialty, marketLocation: meta.marketLocation };
}

export async function getDefaultComparisonSpecialtyForLocation(
  locationId: number
): Promise<ComparisonSpecialtyPayload | null> {
  try {
    const ctx = await loadLocationContext(locationId);
    const { specialty } = await resolveSpecialtyAndMarket(ctx);
    return resolveComparisonSpecialtyPayload(specialty).payload;
  } catch (err: any) {
    log(
      `[ONBOARDING] [${locationId}] Could not resolve default comparison specialty: ${err.message}`
    );
    return null;
  }
}

// =====================================================================
// runDiscoveryForLocation
// =====================================================================

/**
 * Populate the initial competitor list for a location. Idempotent:
 *  - If status is `finalized`, throws (use the curate UI to modify).
 *  - If active rows exist and the latest `initial_scrape` is <7 days old,
 *    returns `stale_skipped` without re-querying Places.
 *  - Otherwise: runs Places discovery (top 10), upserts into
 *    location_competitors, and flips status to `curating`.
 */
export async function runDiscoveryForLocation(
  locationId: number,
  radiusMetersInput?: number,
  comparisonSpecialtyInput?: string
): Promise<DiscoveryResult> {
  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);
  if (onboarding.status === "finalized") {
    throw new Error(
      `Location ${locationId} is already finalized — discovery is locked. Modify via the curate endpoints.`
    );
  }

  const ctx = await loadLocationContext(locationId);
  const radiusMeters = resolveDiscoveryRadiusMeters(
    radiusMetersInput,
    ctx.competitorDiscoveryRadiusMeters
  );

  // Freshness check: skip if we already have a recent initial_scrape
  const latestInitial =
    await LocationCompetitorModel.findLatestInitialScrapeAt(locationId);
  if (latestInitial && radiusMetersInput === undefined) {
    const ageMs = Date.now() - new Date(latestInitial).getTime();
    if (ageMs < DISCOVERY_FRESHNESS_MS) {
      const activeCount =
        await LocationCompetitorModel.countActive(locationId);
      log(
        `[ONBOARDING] [${locationId}] Discovery skipped — initial_scrape ${Math.round(
          ageMs / (60 * 60 * 1000)
        )}h old, ${activeCount} active competitors`
      );
      // Ensure status is at least 'curating' since discovery exists
      if (onboarding.status === "pending") {
        await LocationCompetitorModel.setOnboardingStatus(
          locationId,
          "curating"
        );
      }
      return {
        status: "stale_skipped",
        competitorCount: activeCount,
        specialty: null,
        marketLocation: null,
        radiusMeters,
        comparisonSpecialty: null,
      };
    }
  }

  const { specialty, marketLocation } = await resolveSpecialtyAndMarket(ctx);
  const { comparison, payload } = resolveComparisonSpecialtyPayload(
    specialty,
    comparisonSpecialtyInput
  );

  log(
    `[ONBOARDING] [${locationId}] Running discovery for "${comparison.query}" in "${marketLocation}" radius=${radiusMeters}m (client specialty: ${specialty})`
  );

  // Resolve the practice's own placeId (cache → ranking history → Places lookup)
  // so we can filter the practice out of its own competitor list. When all three
  // fail (`source: 'unresolved'`), the GET response will flag this so the UI can
  // prompt the user to remove their own listing manually.
  const clientResolution = await resolveClientPlaceId(ctx, marketLocation);
  const clientPlaceId = clientResolution.placeId;
  const locationBias =
    clientResolution.lat !== null && clientResolution.lng !== null
      ? {
          lat: clientResolution.lat,
          lng: clientResolution.lng,
          radiusMeters,
        }
      : undefined;

  // Discover top N+2 competitors so we can backfill after filtering out the
  // client's own placeId (defensive against an off-by-one when the practice
  // ranks #11 in its own market). Then take top N.
  const RAW_DISCOVERY_OVERSAMPLE = 2;
  const rawDiscovered = await discoverCompetitorCandidates(
    comparison.query,
    marketLocation,
    MAX_COMPETITORS_PER_LOCATION + RAW_DISCOVERY_OVERSAMPLE,
    locationBias
  );

  const filtered = clientPlaceId
    ? rawDiscovered.filter((c) => c.placeId !== clientPlaceId)
    : rawDiscovered;
  const discovered = filtered.slice(0, MAX_COMPETITORS_PER_LOCATION);

  if (clientPlaceId && filtered.length < rawDiscovered.length) {
    log(
      `[ONBOARDING] [${locationId}] Filtered own practice (${clientPlaceId}) out of competitor set`
    );
  }

  // Insert as initial_scrape, soft-deleting nothing — model handles revival
  // of any prior soft-deleted rows for the same place_id (rare, but defensive).
  await db.transaction(async (trx) => {
    for (const comp of discovered) {
      await LocationCompetitorModel.addCompetitor(
        locationId,
        withProfileStrength({
          placeId: comp.placeId,
          name: comp.name,
          address: comp.address || null,
          primaryType: comp.primaryType || null,
          rating: comp.totalScore ?? null,
          reviewCount: comp.reviewsCount ?? null,
          lat: comp.location?.lat ?? null,
          lng: comp.location?.lng ?? null,
          phone: comp.phone || null,
          website: comp.website || null,
          photoName: comp.photoName || null,
          discoveryPosition: comp.discoveryPosition ?? null,
          discoveryQuery: comp.discoveryQuery ?? null,
          discoverySource: comp.discoverySource ?? "places_text",
          discoveryCheckedAt: comp.discoveryCheckedAt ?? null,
          discoveryRadiusMeters: radiusMeters,
          source: "initial_scrape",
          addedByUserId: null,
        }),
        trx
      );
    }

    await LocationCompetitorModel.setOnboardingStatus(
      locationId,
      "curating",
      trx
    );
    await LocationModel.setCompetitorDiscoveryRadius(
      locationId,
      radiusMeters,
      trx
    );
  });

  log(
    `[ONBOARDING] [${locationId}] Discovery complete: ${discovered.length} competitors → status=curating`
  );

  return {
    status: discovered.length > 0 ? "completed" : "fresh",
    competitorCount: discovered.length,
    specialty,
    marketLocation,
    radiusMeters,
    comparisonSpecialty: payload,
  };
}

/**
 * Preview discovery candidates for the selected radius without changing the
 * saved competitor set. Used by the finalized reselection UI.
 */
export async function previewDiscoveryCandidatesForLocation(
  locationId: number,
  radiusMetersInput?: number,
  comparisonSpecialtyInput?: string
): Promise<DiscoverySuggestionsResult> {
  const ctx = await loadLocationContext(locationId);
  const radiusMeters = resolveDiscoveryRadiusMeters(
    radiusMetersInput,
    ctx.competitorDiscoveryRadiusMeters
  );
  const { specialty, marketLocation } = await resolveSpecialtyAndMarket(ctx);
  const { comparison, payload } = resolveComparisonSpecialtyPayload(
    specialty,
    comparisonSpecialtyInput
  );
  const clientResolution = await resolveClientPlaceId(ctx, marketLocation);
  const locationBias =
    clientResolution.lat !== null && clientResolution.lng !== null
      ? {
          lat: clientResolution.lat,
          lng: clientResolution.lng,
          radiusMeters,
        }
      : undefined;

  const RAW_DISCOVERY_OVERSAMPLE = 4;
  const rawDiscovered = await discoverCompetitorCandidates(
    comparison.query,
    marketLocation,
    MAX_COMPETITORS_PER_LOCATION + RAW_DISCOVERY_OVERSAMPLE,
    locationBias
  );
  const discovered = (clientResolution.placeId
    ? rawDiscovered.filter((c) => c.placeId !== clientResolution.placeId)
    : rawDiscovered
  ).slice(0, MAX_COMPETITORS_PER_LOCATION);

  log(
    `[ONBOARDING] [${locationId}] Previewed ${discovered.length} discovery candidates radius=${radiusMeters}m`
  );

  return {
    status: discovered.length > 0 ? "completed" : "fresh",
    competitorCount: discovered.length,
    specialty,
    marketLocation,
    radiusMeters,
    comparisonSpecialty: payload,
    suggestions: discovered.map((comp) =>
      buildCompetitorSuggestion(comp, radiusMeters)
    ),
  };
}

/**
 * Resolve a manually searched Google Maps profile before adding it to the
 * reselection draft. This gives the UI coordinates/profile signals up front
 * and, when the place appears in the sampled discovery set, a Maps estimate.
 * It does not mutate the saved competitor set.
 */
export async function previewManualCompetitorForLocation(
  locationId: number,
  placeId: string,
  radiusMetersInput?: number,
  comparisonSpecialtyInput?: string
): Promise<CompetitorPlacePreviewResult> {
  const ctx = await loadLocationContext(locationId);
  const radiusMeters = resolveDiscoveryRadiusMeters(
    radiusMetersInput,
    ctx.competitorDiscoveryRadiusMeters
  );
  let comparisonSpecialty: ComparisonSpecialtyPayload | null = null;
  let comparisonSpecialtyForMeasurement = comparisonSpecialtyInput;
  try {
    const { specialty } = await resolveSpecialtyAndMarket(ctx);
    const { payload } = resolveComparisonSpecialtyPayload(
      specialty,
      comparisonSpecialtyInput
    );
    comparisonSpecialty = payload;
    comparisonSpecialtyForMeasurement = payload.value;
  } catch (err: any) {
    log(
      `[ONBOARDING] [${locationId}] Could not resolve comparison specialty for manual preview: ${err.message}`
    );
  }
  const [placeDetails, discoveryResult] = await Promise.all([
    fetchPlaceDetailsForCompetitor(placeId),
    findDiscoveryMatchForPlace(
      ctx,
      placeId,
      radiusMeters,
      comparisonSpecialtyForMeasurement
    ),
  ]);
  const input = buildInputFromRawPlaceDetails(
    placeId,
    placeDetails,
    null,
    radiusMeters,
    discoveryResult
  );

  return {
    competitor: buildCompetitorSuggestionFromInput(input, radiusMeters),
    radiusMeters,
    mapsMatched: Boolean(discoveryResult.match?.discoveryPosition),
    comparisonSpecialty,
  };
}

// =====================================================================
// addCustomCompetitor
// =====================================================================

/**
 * Add a user-chosen competitor by Google Place ID. Enforces the cap server-side.
 * Throws if the cap is reached. Reviving a previously soft-deleted entry does
 * NOT count toward the cap until revived.
 */
export async function addCustomCompetitor(
  locationId: number,
  placeId: string,
  userId: number | null
): Promise<{ added: any; activeCount: number }> {
  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);
  if (onboarding.status === "finalized") {
    throw new Error(
      `Location ${locationId} is already finalized — competitor list is locked.`
    );
  }

  // Cap check before remote Places call to avoid wasted API spend
  const currentCount =
    await LocationCompetitorModel.countActive(locationId);
  // Special case: if the placeId already exists ACTIVE, treat as no-op (idempotent)
  const existingActive =
    await LocationCompetitorModel.findActiveByLocationAndPlace(
      locationId,
      placeId
    );
  if (!existingActive && currentCount >= MAX_COMPETITORS_PER_LOCATION) {
    throw Object.assign(
      new Error(
        `Competitor cap reached (${MAX_COMPETITORS_PER_LOCATION}). Remove one before adding another.`
      ),
      { code: "COMPETITOR_CAP_REACHED" }
    );
  }

  const location = await LocationModel.findById(locationId);
  const discoveryRadiusMeters = Number(
    location?.competitor_discovery_radius_meters ??
      DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS
  );
  const placeDetails = await fetchPlaceDetailsForCompetitor(placeId);
  const input = buildInputFromRawPlaceDetails(
    placeId,
    placeDetails,
    userId,
    discoveryRadiusMeters
  );

  const added = await LocationCompetitorModel.addCompetitor(
    locationId,
    input
  );

  const activeCount =
    await LocationCompetitorModel.countActive(locationId);

  // Ensure status reflects active curation
  if (onboarding.status === "pending") {
    await LocationCompetitorModel.setOnboardingStatus(locationId, "curating");
  }

  log(
    `[ONBOARDING] [${locationId}] User added competitor ${placeId} (${input.name}) — activeCount=${activeCount}`
  );

  return { added, activeCount };
}

// =====================================================================
// removeCompetitorFromList
// =====================================================================

export async function removeCompetitorFromList(
  locationId: number,
  placeId: string
): Promise<{ activeCount: number; removed: number }> {
  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);
  if (onboarding.status === "finalized") {
    throw new Error(
      `Location ${locationId} is already finalized — competitor list is locked.`
    );
  }

  const removed = await LocationCompetitorModel.removeCompetitor(
    locationId,
    placeId
  );
  const activeCount =
    await LocationCompetitorModel.countActive(locationId);

  log(
    `[ONBOARDING] [${locationId}] Removed competitor ${placeId} (rowsTouched=${removed}, activeCount=${activeCount})`
  );

  return { removed, activeCount };
}

// =====================================================================
// finalizeAndTriggerRun / reselectCompetitorsAndTriggerRun
// =====================================================================

function buildInputFromExistingCompetitor(
  competitor: ILocationCompetitor,
  userId: number | null
): AddCompetitorInput {
  return withProfileStrength({
    placeId: competitor.place_id,
    name: competitor.name,
    address: competitor.address,
    primaryType: competitor.primary_type,
    rating:
      competitor.rating === null || competitor.rating === undefined
        ? null
        : Number(competitor.rating),
    reviewCount: competitor.review_count,
    lat:
      competitor.lat === null || competitor.lat === undefined
        ? null
        : Number(competitor.lat),
    lng:
      competitor.lng === null || competitor.lng === undefined
        ? null
        : Number(competitor.lng),
    phone: competitor.phone,
    website: competitor.website,
    photoName: competitor.photo_name,
    discoveryPosition: competitor.discovery_position,
    discoveryQuery: competitor.discovery_query,
    discoverySource: competitor.discovery_source ?? "unknown",
    discoveryCheckedAt: competitor.discovery_checked_at,
    discoveryRadiusMeters: competitor.discovery_radius_meters,
    source: competitor.source || "user_added",
    addedByUserId: competitor.added_by_user_id ?? userId,
  });
}

async function buildInputFromPlaceDetails(
  placeId: string,
  userId: number | null,
  discoveryRadiusMeters: number
): Promise<AddCompetitorInput> {
  const placeDetails = await fetchPlaceDetailsForCompetitor(placeId);
  return buildInputFromRawPlaceDetails(
    placeId,
    placeDetails,
    userId,
    discoveryRadiusMeters
  );
}

async function createRankingRunRow(
  trx: Knex.Transaction,
  ctx: LoadedLocationContext,
  locationId: number,
  specialty: string | null,
  marketLocation: string | null,
  batchId: string,
  now: Date,
  runReason: "first_competitor_finalize" | "competitor_reselection",
  includeInSummaryRecommendations: boolean,
  competitorSetRevision: number,
  competitorSnapshot: CompetitorSnapshot,
  competitorDiscoveryRadiusMeters: number
): Promise<number> {
  const [row] = await trx("practice_rankings")
    .insert({
      organization_id: ctx.organizationId,
      location_id: locationId,
      specialty,
      location: marketLocation,
      gbp_account_id: ctx.selectedGbp.account_id,
      gbp_location_id: ctx.selectedGbp.external_id,
      gbp_location_name: ctx.selectedGbp.display_name,
      batch_id: batchId,
      observed_at: now,
      status: "pending",
      competitor_source: "curated",
      competitor_set_revision: competitorSetRevision,
      competitor_snapshot: JSON.stringify(competitorSnapshot),
      competitor_discovery_radius_meters: competitorDiscoveryRadiusMeters,
      run_reason: runReason,
      include_in_summary_recommendations: includeInSummaryRecommendations,
      status_detail: JSON.stringify({
        currentStep: "queued",
        message:
          runReason === "competitor_reselection"
            ? "Waiting for competitor rerank..."
            : "Waiting for first run...",
        progress: 0,
        stepsCompleted: [],
        timestamps: { created_at: now.toISOString() },
      }),
      created_at: now,
      updated_at: now,
    })
    .returning("id");
  return typeof row === "object" ? row.id : row;
}

function triggerRankingRun(
  ctx: LoadedLocationContext,
  rankingId: number,
  specialty: string | null,
  marketLocation: string | null,
  batchId: string
): void {
  setImmediate(() => {
    processLocationRanking(
      rankingId,
      ctx.selectedGbp.google_connection_id,
      ctx.selectedGbp.account_id || "",
      ctx.selectedGbp.external_id,
      ctx.selectedGbp.display_name || ctx.locationName,
      specialty || "",
      marketLocation || "",
      ctx.organizationDomain,
      batchId,
      log
    ).catch((err: any) => {
      logError(
        `[ONBOARDING] [${ctx.locationId}] processLocationRanking failed for ranking ${rankingId}`,
        err
      );
    });
  });
}

/**
 * Single-click finalize: locks the curated list, creates a practice_rankings
 * row tagged competitor_source='curated', and kicks off the ranking pipeline
 * asynchronously. Idempotent on rapid double-click via the in-flight check.
 */
export async function finalizeAndTriggerRun(
  locationId: number
): Promise<FinalizeAndRunResult> {
  const ctx = await loadLocationContext(locationId);

  // Idempotency: if there's an in-flight ranking for this location created
  // within the dedupe window, return its batchId/rankingId.
  const cutoff = new Date(Date.now() - FINALIZE_DEDUPE_WINDOW_MS);
  const inFlight = await PracticeRankingModel.findRecentInFlightByLocation(
    ctx.organizationId,
    locationId,
    cutoff
  );
  if (inFlight) {
    const activeCount =
      await LocationCompetitorModel.countActive(locationId);
    const competitorSetRevision =
      await LocationCompetitorModel.getCompetitorSetRevision(locationId);
    log(
      `[ONBOARDING] [${locationId}] finalize-and-run reused in-flight rankingId=${inFlight.id} batchId=${inFlight.batch_id}`
    );
    return {
      batchId: inFlight.batch_id || "",
      rankingId: inFlight.id,
      reused: true,
      competitorSetRevision,
      selectedCount: activeCount,
    };
  }

  // Resolve specialty/market for the new ranking row (reused from history if available)
  let specialty: string | null = null;
  let marketLocation: string | null = null;
  try {
    const meta = await resolveSpecialtyAndMarket(ctx);
    specialty = meta.specialty;
    marketLocation = meta.marketLocation;
  } catch (err: any) {
    log(
      `[ONBOARDING] [${locationId}] specialty/market resolution failed: ${err.message} — pipeline will re-identify`
    );
  }

  const batchId = uuidv4();
  const now = new Date();

  // Flip onboarding to finalized + create ranking row in a single transaction
  const { rankingId, competitorSetRevision, selectedCount } =
    await db.transaction(async (trx) => {
    await LocationCompetitorModel.setOnboardingStatus(
      locationId,
      "finalized",
      trx
    );

    const revision =
      await LocationCompetitorModel.getCompetitorSetRevision(locationId, trx);
    const competitors =
      await LocationCompetitorModel.findActiveByLocationId(locationId, trx);
    const snapshot = buildSnapshot(competitors, revision);
    const id = await createRankingRunRow(
      trx,
      ctx,
      locationId,
      specialty,
      marketLocation,
      batchId,
      now,
      "first_competitor_finalize",
      true,
      revision,
      snapshot,
      ctx.competitorDiscoveryRadiusMeters
    );
    return {
      rankingId: id,
      competitorSetRevision: revision,
      selectedCount: competitors.length,
    };
  });

  triggerRankingRun(ctx, rankingId, specialty, marketLocation, batchId);

  log(
    `[ONBOARDING] [${locationId}] Finalized and triggered run: rankingId=${rankingId} batchId=${batchId}`
  );

  return {
    batchId,
    rankingId,
    reused: false,
    competitorSetRevision,
    selectedCount,
  };
}

/**
 * Replace a finalized location's comparison set and run a ranking snapshot.
 *
 * This is intentionally a rerank-only path:
 * - location remains finalized
 * - competitor_set_revision increments
 * - the new practice_rankings row is excluded from summary task creation
 */
export async function reselectCompetitorsAndTriggerRun(
  locationId: number,
  placeIds: string[],
  userId: number | null,
  radiusMetersInput?: number
): Promise<ReselectCompetitorsAndRunResult> {
  const uniquePlaceIds = Array.from(
    new Set(placeIds.map((id) => id.trim()).filter(Boolean))
  );

  if (uniquePlaceIds.length === 0) {
    throw Object.assign(
      new Error("Select at least one competitor before rerunning ranking."),
      { code: "EMPTY_COMPETITOR_SET" }
    );
  }

  if (uniquePlaceIds.length > MAX_COMPETITORS_PER_LOCATION) {
    throw Object.assign(
      new Error(
        `Competitor cap reached (${MAX_COMPETITORS_PER_LOCATION}). Remove one before rerunning.`
      ),
      { code: "COMPETITOR_CAP_REACHED" }
    );
  }

  const onboarding =
    await LocationCompetitorModel.getOnboardingStatus(locationId);
  if (onboarding.status !== "finalized") {
    throw Object.assign(
      new Error(
        `Location ${locationId} must be finalized before competitors can be reselected.`
      ),
      { code: "LOCATION_NOT_FINALIZED" }
    );
  }

  const ctx = await loadLocationContext(locationId);
  const radiusMeters = resolveDiscoveryRadiusMeters(
    radiusMetersInput,
    ctx.competitorDiscoveryRadiusMeters
  );
  const cutoff = new Date(Date.now() - FINALIZE_DEDUPE_WINDOW_MS);
  const inFlight = await PracticeRankingModel.findRecentInFlightByLocation(
    ctx.organizationId,
    locationId,
    cutoff
  );
  if (inFlight) {
    const competitorSetRevision =
      await LocationCompetitorModel.getCompetitorSetRevision(locationId);
    const selectedCount =
      await LocationCompetitorModel.countActive(locationId);
    log(
      `[ONBOARDING] [${locationId}] competitor reselect reused in-flight rankingId=${inFlight.id} batchId=${inFlight.batch_id}`
    );
    return {
      batchId: inFlight.batch_id || "",
      rankingId: inFlight.id,
      reused: true,
      competitorSetRevision,
      selectedCount,
    };
  }

  const inputs: AddCompetitorInput[] = [];
  for (const placeId of uniquePlaceIds) {
    const existing = await LocationCompetitorModel.findAnyByLocationAndPlace(
      locationId,
      placeId
    );
    inputs.push(
      existing
        ? buildInputFromExistingCompetitor(existing, userId)
        : await buildInputFromPlaceDetails(placeId, userId, radiusMeters)
    );
  }

  let specialty: string | null = null;
  let marketLocation: string | null = null;
  try {
    const meta = await resolveSpecialtyAndMarket(ctx);
    specialty = meta.specialty;
    marketLocation = meta.marketLocation;
  } catch (err: any) {
    log(
      `[ONBOARDING] [${locationId}] specialty/market resolution failed for competitor reselection: ${err.message} — pipeline will re-identify`
    );
  }

  const batchId = uuidv4();
  const now = new Date();

  const { rankingId, competitorSetRevision, selectedCount } =
    await db.transaction(async (trx) => {
      await LocationCompetitorModel.removeCompetitorsNotInPlaceIds(
        locationId,
        uniquePlaceIds,
        trx
      );

      for (const input of inputs) {
        await LocationCompetitorModel.addCompetitor(
          locationId,
          {
            ...input,
            discoveryRadiusMeters: radiusMeters,
          },
          trx
        );
      }
      await LocationModel.setCompetitorDiscoveryRadius(
        locationId,
        radiusMeters,
        trx
      );

      const revision =
        await LocationCompetitorModel.incrementCompetitorSetRevision(
          locationId,
          trx
        );
      const competitors =
        await LocationCompetitorModel.findActiveByLocationId(locationId, trx);
      const snapshot = buildSnapshot(competitors, revision);
      const id = await createRankingRunRow(
        trx,
        ctx,
        locationId,
        specialty,
        marketLocation,
        batchId,
        now,
        "competitor_reselection",
        false,
        revision,
        snapshot,
        radiusMeters
      );

      return {
        rankingId: id,
        competitorSetRevision: revision,
        selectedCount: competitors.length,
      };
    });

  triggerRankingRun(ctx, rankingId, specialty, marketLocation, batchId);

  log(
    `[ONBOARDING] [${locationId}] Competitors reselected and rerank triggered: rankingId=${rankingId} batchId=${batchId} revision=${competitorSetRevision}`
  );

  return {
    batchId,
    rankingId,
    reused: false,
    competitorSetRevision,
    selectedCount,
  };
}
