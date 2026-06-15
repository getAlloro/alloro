/**
 * Places API Competitor Discovery Service
 *
 * Replaces Apify for competitor discovery. Uses Google Places Text Search
 * for fast, accurate, location-aware results. Category filtering ensures
 * only specialty-relevant competitors are included.
 *
 * Apify is still used downstream for deep scrape (review text, dates, distribution).
 *
 * This module is the discovery orchestrator. The pure taxonomy/types, geo +
 * radius selection helpers, specialty classification, and category filtering
 * now live in sibling modules and are re-exported below to preserve the
 * import surface:
 *   - feature-utils/util.competitor-specialty-taxonomy
 *   - feature-utils/util.competitor-geo
 *   - feature-utils/util.competitor-radius-selection
 *   - feature-services/service.competitor-specialty-classifier
 *   - feature-services/service.competitor-specialty-filter
 */

import { textSearch } from "../../places/feature-services/GooglePlacesApiService";
import logger from "../../../lib/logger";
import {
  filterWithinLocationBiasRadius,
  selectDistributedBestWithinRadius,
  compareByMapsEstimateThenProfile,
  wideRadiusSampleBiases,
} from "../feature-utils/util.competitor-radius-selection";
import {
  BROADENING_MAP,
  type DiscoveredCompetitor,
} from "../feature-utils/util.competitor-specialty-taxonomy";
import {
  normalizeSpecialty,
  resolveComparisonSpecialty,
} from "./service.competitor-specialty-classifier";
import { filterBySpecialty } from "./service.competitor-specialty-filter";

// =====================================================================
// PUBLIC RE-EXPORTS (preserve import surface)
// =====================================================================

export type {
  DiscoveredCompetitor,
  CompetitorSpecialtyEvidenceTier,
  ComparisonSpecialty,
} from "../feature-utils/util.competitor-specialty-taxonomy";
export { COMPARISON_SPECIALTY_OPTIONS } from "../feature-utils/util.competitor-specialty-taxonomy";
export {
  resolveComparisonSpecialty,
  classifyCompetitorSpecialtyEvidence,
} from "./service.competitor-specialty-classifier";
export { filterBySpecialty } from "./service.competitor-specialty-filter";

// =====================================================================
// HELPERS
// =====================================================================

function log(message: string): void {
  logger.info(`[PLACES-DISCOVERY] ${message}`);
}

// =====================================================================
// DISCOVERY
// =====================================================================

/**
 * Convert raw Google Places results to DiscoveredCompetitor array.
 */
function placesToCompetitors(
  places: any[],
  discoveryQuery: string,
  discoveryCheckedAt: Date,
): DiscoveredCompetitor[] {
  return places.map((place: any, index: number) => {
    const hours = place.regularOpeningHours;
    const hasHours = !!hours;
    const hoursComplete = hasHours
      ? (hours.periods?.length || 0) >= 5
      : false;

    return {
      placeId: place.id,
      name: place.displayName?.text || "",
      address: place.formattedAddress || "",
      category: place.primaryTypeDisplayName?.text || place.primaryType || "Unknown",
      primaryType: place.primaryType || "",
      types: place.types || [],
      totalScore: place.rating ?? 0,
      reviewsCount: place.userRatingCount ?? 0,
      url: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
      website: place.websiteUri,
      phone: place.nationalPhoneNumber,
      hasHours,
      hoursComplete,
      photosCount: place.photos?.length ?? 0,
      photoName: place.photos?.[0]?.name,
      discoveryPosition: index + 1,
      discoveryQuery,
      discoverySource: "places_text",
      discoveryCheckedAt,
      location: place.location
        ? { lat: place.location.latitude, lng: place.location.longitude }
        : undefined,
    };
  });
}

/**
 * Discover competitors via Google Places Text Search API.
 *
 * Uses the business's specific category for the search query. If the specialty
 * is specific (endodontist, orthodontist, plastic surgeon, etc.) and fewer than
 * 5 same-specialty competitors are found, automatically broadens to adjacent
 * categories (endodontist -> dentist, orthodontist -> dentist, etc.).
 *
 * @param specialty - Practice specialty (e.g. "endodontist", "orthodontics")
 * @param marketLocation - Market location (e.g. "Austin, TX")
 * @param limit - Maximum results (default 20)
 * @returns Array of discovered competitors
 */
export async function discoverCompetitorsViaPlaces(
  specialty: string,
  marketLocation: string,
  limit: number = 20,
  locationBias?: { lat: number; lng: number; radiusMeters?: number },
): Promise<DiscoveredCompetitor[]> {
  const searchQuery = `${specialty} in ${marketLocation}`;
  log(`Searching: "${searchQuery}" (limit: ${limit})${locationBias ? ` [biased to ${locationBias.lat.toFixed(4)},${locationBias.lng.toFixed(4)}]` : ""}`);

  const checkedAt = new Date();
  const places = await textSearch(searchQuery, limit, locationBias);
  log(`Found ${places.length} raw results`);

  const competitors = placesToCompetitors(places, searchQuery, checkedAt);
  const radiusFilteredCompetitors = filterWithinLocationBiasRadius(
    competitors,
    locationBias,
  );

  if (radiusFilteredCompetitors.length !== competitors.length) {
    log(
      `Radius filter (${locationBias?.radiusMeters ?? "none"}m): ${competitors.length} → ${radiusFilteredCompetitors.length} competitors`,
    );
  }

  // Keep the list aligned with the displayed Maps estimate. Profile strength is
  // only a tie-breaker, not the primary ordering signal.
  radiusFilteredCompetitors.sort(compareByMapsEstimateThenProfile);

  return radiusFilteredCompetitors;
}

/**
 * Wide-radius suggestion discovery. The normal query includes
 * `in ${marketLocation}`, which is correct for local ranking snapshots but too
 * city-bound for a 50-mile suggestion radius. This path searches the specialty
 * with only a Places radius bias, filters to the selected radius, then returns
 * the best candidates by review count/rating.
 */
export async function discoverCompetitorsViaPlacesWideRadius(
  specialty: string,
  limit: number = 20,
  locationBias: { lat: number; lng: number; radiusMeters?: number },
): Promise<DiscoveredCompetitor[]> {
  const searchQuery = specialty;
  const checkedAt = new Date();
  const requestedLimit = 20;
  const sampleBiases = wideRadiusSampleBiases(locationBias);
  log(
    `Wide-radius searching: "${searchQuery}" (${sampleBiases.length} samples, limit: ${requestedLimit}) [center=${locationBias.lat.toFixed(4)},${locationBias.lng.toFixed(4)}, radius=${locationBias.radiusMeters ?? 40234}m]`
  );
  const merged = new Map<string, DiscoveredCompetitor>();
  for (const sample of sampleBiases) {
    const places = await textSearch(searchQuery, requestedLimit, sample);
    const competitors = placesToCompetitors(places, searchQuery, checkedAt);
    for (const competitor of competitors) {
      if (!merged.has(competitor.placeId)) {
        merged.set(competitor.placeId, competitor);
      }
    }
  }
  const candidates = Array.from(merged.values());
  const sameSpecialty = filterBySpecialty(candidates, specialty);
  const comparison = resolveComparisonSpecialty(specialty);
  const eligible = comparison.isDentalSpecialist
    ? sameSpecialty
    : sameSpecialty.length >= limit
      ? sameSpecialty
      : candidates;
  log(
    `Found ${candidates.length} unique wide-radius results (${sameSpecialty.length} same-specialty)`
  );
  return selectDistributedBestWithinRadius(eligible, locationBias).slice(0, limit);
}

/**
 * Discover competitors with specialty-aware fallback broadening.
 *
 * 1. Search for exact specialty (e.g. "endodontist in San Diego, CA")
 * 2. Filter to same-specialty matches
 * 3. If fewer than 5, broaden to adjacent category (e.g. "dentist in San Diego, CA")
 *    and merge results, deduplicating by placeId
 *
 * @returns Object with competitors array and whether broadening was used
 */
export async function discoverCompetitorsWithFallback(
  specialty: string,
  marketLocation: string,
  limit: number = 20,
  locationBias?: { lat: number; lng: number; radiusMeters?: number },
): Promise<{
  competitors: DiscoveredCompetitor[];
  broadened: boolean;
  broadeningCategory: string | null;
  specialtyMatchCount: number;
}> {
  const MIN_SAME_SPECIALTY = 5;

  // Step 1: Discover with exact specialty
  const allCompetitors = await discoverCompetitorsViaPlaces(
    specialty, marketLocation, limit, locationBias,
  );

  // Step 2: Filter to same specialty
  const specialtyFiltered = filterBySpecialty(allCompetitors, specialty);

  // Step 3: If enough same-specialty competitors, return them
  if (specialtyFiltered.length >= MIN_SAME_SPECIALTY) {
    return { competitors: specialtyFiltered, broadened: false, broadeningCategory: null, specialtyMatchCount: specialtyFiltered.length };
  }

  // Step 4: Check if this specialty has a broadening category
  const normalizedSpec = normalizeSpecialty(specialty);
  const broaderCategory = BROADENING_MAP[normalizedSpec];

  if (!broaderCategory) {
    // No broadening available, return what we have
    log(`Only ${specialtyFiltered.length} same-specialty results, no broadening category for "${specialty}"`);
    return { competitors: specialtyFiltered, broadened: false, broadeningCategory: null, specialtyMatchCount: specialtyFiltered.length };
  }

  log(`Only ${specialtyFiltered.length} same-specialty results. Broadening to "${broaderCategory}"`);

  // Step 5: Search with broader category
  const broaderResults = await discoverCompetitorsViaPlaces(
    broaderCategory, marketLocation, limit, locationBias,
  );
  const filteredBroaderResults = filterBySpecialty(
    broaderResults,
    specialty
  );

  // Step 6: Merge, deduplicating by placeId (specialty results first)
  const seenIds = new Set(specialtyFiltered.map((c) => c.placeId));
  const additionalCompetitors = filteredBroaderResults.filter(
    (c) => !seenIds.has(c.placeId)
  );

  // Sort each group by Maps estimate, but ALWAYS put specialty matches first.
  // An endodontist's real competitor is another endodontist, not a general
  // dentist with more reviews. Trust depends on this.
  specialtyFiltered.sort(compareByMapsEstimateThenProfile);
  additionalCompetitors.sort(compareByMapsEstimateThenProfile);

  // Specialty matches first, then broader matches
  const merged = [...specialtyFiltered, ...additionalCompetitors];

  log(`After broadening: ${specialtyFiltered.length} same-specialty + ${additionalCompetitors.length} broader = ${merged.length} total`);

  return { competitors: merged, broadened: true, broadeningCategory: broaderCategory, specialtyMatchCount: specialtyFiltered.length };
}

// =====================================================================
// CLIENT PHOTOS
// =====================================================================

/**
 * Look up the client business on Google Places.
 *
 * Returns the placeId, photo count, and lat/lng coordinates of the matched place.
 * The coordinates are used as the vantage point for location-biased competitor
 * search in the Practice Health + Search Position split (see
 * plans/04122026-no-ticket-practice-health-search-position-split/spec.md).
 *
 * Replaces the 2 Apify runs (search + detail scrape) previously used.
 *
 * @param practiceName - Client business name
 * @param marketLocation - Market location (e.g. "Austin, TX")
 * @returns Object with placeId, photosCount, lat, lng — nulls if no match
 */
export async function getClientPhotosViaPlaces(
  practiceName: string,
  marketLocation: string,
): Promise<{
  placeId: string | null;
  photosCount: number;
  lat: number | null;
  lng: number | null;
}> {
  const searchQuery = `${practiceName} ${marketLocation}`;
  log(`Searching for client: "${searchQuery}"`);

  const places = await textSearch(searchQuery, 5);

  if (places.length === 0) {
    log(`✗ No results found for client`);
    return { placeId: null, photosCount: 0, lat: null, lng: null };
  }

  // Find client in results by name match
  const clientNameLower = practiceName.toLowerCase().trim();
  const match = places.find((place: any) => {
    const placeName = (place.displayName?.text || "").toLowerCase().trim();
    return (
      placeName === clientNameLower ||
      placeName.includes(clientNameLower) ||
      clientNameLower.includes(placeName)
    );
  });

  if (!match) {
    log(
      `✗ Could not match client name. Results: ${places
        .map((p: any) => p.displayName?.text)
        .join(", ")}`,
    );
    return { placeId: null, photosCount: 0, lat: null, lng: null };
  }

  const placeId = match.id;
  const photosCount = match.photos?.length ?? 0;
  const lat = match.location?.latitude ?? null;
  const lng = match.location?.longitude ?? null;

  log(
    `✓ Found client: ${match.displayName?.text} (${placeId}), ${photosCount} photos, coords=${lat ?? "?"},${lng ?? "?"}`,
  );

  return { placeId, photosCount, lat, lng };
}
