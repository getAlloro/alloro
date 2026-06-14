/**
 * Competitor onboarding identity resolution
 *
 * Extracted verbatim from service.location-competitor-onboarding.ts. Resolves
 * the two identity facts the discovery/curation/finalize flows depend on:
 *
 *   - resolveClientPlaceId       — the practice's own Google Places id/lat/lng
 *                                  (cache → ranking_history → places_lookup),
 *                                  the self-filter source of truth
 *   - resolveSpecialtyAndMarket  — specialty + marketLocation (prior ranking
 *                                  row, else Identifier Agent on fresh GBP data)
 *   - getDefaultComparisonSpecialtyForLocation — comparison-specialty payload
 *
 * DB stays in models; external GBP fetch is retry-wrapped; Pino logger via util.
 */

import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { fetchGBPDataForRange } from "../../../utils/dataAggregation/dataAggregator";
import { LocationModel } from "../../../models/LocationModel";
import { PracticeRankingModel } from "../../../models/PracticeRankingModel";
import { identifyLocationMeta } from "../../agents/feature-services/service.webhook-orchestrator";
import { getClientPhotosViaPlaces } from "./service.places-competitor-discovery";
import {
  isRetryableExternalError,
  runWithRetry,
  summarizeRetryAttempts,
} from "./service.ranking-resilience";
import { log } from "../feature-utils/util.ranking-logger";
import {
  ComparisonSpecialtyPayload,
  resolveComparisonSpecialtyPayload,
} from "../feature-utils/util.competitor-onboarding-builders";
import {
  LoadedLocationContext,
  loadLocationContext,
} from "./service.location-context";

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
    const lastRanking =
      await PracticeRankingModel.findLatestResolvedSearchResultsByLocation(
        ctx.locationId
      );

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

export async function resolveSpecialtyAndMarket(
  ctx: LoadedLocationContext
): Promise<{ specialty: string; marketLocation: string }> {
  // Prefer values from the most recent practice_rankings row for this location
  // — same identification logic already ran there and succeeded.
  const lastRanking =
    await PracticeRankingModel.findLatestSpecialtyAndLocation(ctx.locationId);

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
