/**
 * Places API Competitor Discovery Service
 *
 * Replaces Apify for competitor discovery. Uses Google Places Text Search
 * for fast, accurate, location-aware results. Category filtering ensures
 * only specialty-relevant competitors are included.
 *
 * Apify is still used downstream for deep scrape (review text, dates, distribution).
 */

import {
  textSearch,
  getPlaceDetails,
} from "../../places/feature-services/GooglePlacesApiService";
import { SPECIALTY_CATEGORIES } from "./service.ranking-algorithm";

// =====================================================================
// TYPES
// =====================================================================

export interface DiscoveredCompetitor {
  placeId: string;
  name: string;
  address: string;
  category: string;
  primaryType: string;
  types: string[];
  totalScore: number;
  reviewsCount: number;
  url: string;
  website?: string;
  phone?: string;
  hasHours: boolean;
  hoursComplete: boolean;
  photosCount: number;
  photoName?: string;
  discoveryPosition?: number;
  discoveryQuery?: string;
  discoverySource?: "places_text";
  discoveryCheckedAt?: Date;
  specialtyEvidenceTier?: CompetitorSpecialtyEvidenceTier;
  location?: {
    lat: number;
    lng: number;
  };
}

export type CompetitorSpecialtyEvidenceTier =
  | "exact_specialist"
  | "multi_specialty_evidence"
  | "general_only"
  | "unknown";

export interface ComparisonSpecialty {
  value: string;
  label: string;
  query: string;
  normalizedSpecialty: string;
  primaryTypes: string[];
  isDental: boolean;
  isDentalSpecialist: boolean;
}

// Google Places API primaryType values mapped to our specialty keys
// These are the machine-readable types Google uses (snake_case)
const SPECIALTY_PRIMARY_TYPES: Record<string, string[]> = {
  // Dental
  orthodontics: ["orthodontist"],
  endodontics: ["endodontist"],
  periodontics: ["periodontist"],
  oral_surgery: ["oral_surgeon"],
  pediatric: ["pediatric_dentist"],
  prosthodontics: ["prosthodontist"],
  general: ["dentist", "dental_clinic"],
  // Non-dental verticals: Google Places types
  barber: ["barber_shop", "beauty_salon", "hair_salon"],
  hair_salon: ["beauty_salon", "hair_salon", "hair_care"],
  veterinary: ["veterinary_care", "animal_hospital"],
  legal: ["lawyer", "law_firm", "attorney"],
  accounting: ["accounting", "tax_preparation_service", "financial_planner"],
  chiropractic: ["chiropractor"],
  physical_therapy: ["physical_therapist", "physiotherapist"],
  optometry: ["optometrist", "optician", "eye_care_center"],
  home_services: ["plumber", "electrician", "hvac_contractor", "roofing_contractor", "contractor", "locksmith"],
  real_estate: ["real_estate_agency", "real_estate_agent"],
  fitness: ["gym", "fitness_center", "personal_trainer"],
  automotive: ["auto_repair", "mechanic", "car_repair", "auto_body_shop"],
  food_service: ["restaurant", "cafe", "bakery", "coffee_shop"],
  medspa: ["medical_spa", "spa", "dermatologist"],
  plastic_surgery: ["plastic_surgeon", "cosmetic_surgeon"],
  financial_advisor: ["financial_planner", "financial_advisor", "investment_service"],
};

// Dental-related primary types (used for dental specialty sub-filtering)
const DENTAL_TYPES = [
  "dentist",
  "dental_clinic",
  "orthodontist",
  "endodontist",
  "periodontist",
  "oral_surgeon",
  "pediatric_dentist",
  "prosthodontist",
];

const GENERAL_DENTAL_TYPES = ["dentist", "dental_clinic"];

interface ComparisonSpecialtyConfig {
  value: string;
  label: string;
  query: string;
  primaryTypes: string[];
  evidenceTerms: string[];
}

const COMPARISON_SPECIALTY_CONFIG: Record<string, ComparisonSpecialtyConfig> = {
  endodontics: {
    value: "endodontist",
    label: "Endodontists",
    query: "endodontist",
    primaryTypes: ["endodontist"],
    evidenceTerms: ["endodont", "root canal"],
  },
  orthodontics: {
    value: "orthodontist",
    label: "Orthodontists",
    query: "orthodontist",
    primaryTypes: ["orthodontist"],
    evidenceTerms: ["orthodont", "braces", "invisalign"],
  },
  periodontics: {
    value: "periodontist",
    label: "Periodontists",
    query: "periodontist",
    primaryTypes: ["periodontist"],
    evidenceTerms: ["periodont", "gum disease", "gum surgery"],
  },
  oral_surgery: {
    value: "oral_surgeon",
    label: "Oral surgeons",
    query: "oral surgeon",
    primaryTypes: ["oral_surgeon"],
    evidenceTerms: ["oral surgeon", "oral surgery", "wisdom teeth"],
  },
  pediatric: {
    value: "pediatric_dentist",
    label: "Pediatric dentists",
    query: "pediatric dentist",
    primaryTypes: ["pediatric_dentist"],
    evidenceTerms: ["pediatric", "children", "kids"],
  },
  prosthodontics: {
    value: "prosthodontist",
    label: "Prosthodontists",
    query: "prosthodontist",
    primaryTypes: ["prosthodontist"],
    evidenceTerms: ["prosthodont", "denture", "implant restoration"],
  },
  general: {
    value: "dentist",
    label: "General dentists",
    query: "dentist",
    primaryTypes: ["dentist", "dental_clinic"],
    evidenceTerms: [],
  },
};

export const COMPARISON_SPECIALTY_OPTIONS = Object.values(
  COMPARISON_SPECIALTY_CONFIG
).map((config) => ({
  value: config.value,
  label: config.label,
  query: config.query,
}));

// All known valid business types across all verticals
const ALL_KNOWN_TYPES = [
  ...DENTAL_TYPES,
  ...Object.values(SPECIALTY_PRIMARY_TYPES).flat(),
];

// =====================================================================
// HELPERS
// =====================================================================

const METERS_PER_MILE = 1609.344;
const RADIUS_FILTER_TOLERANCE = 1.05;

function log(message: string): void {
  console.log(`[PLACES-DISCOVERY] ${message}`);
}

function distanceMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

function destinationPoint(
  origin: { lat: number; lng: number },
  distanceMeters: number,
  bearingDegrees: number
): { lat: number; lng: number } {
  const earthRadiusMeters = 6371000;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const angularDistance = distanceMeters / earthRadiusMeters;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: ((((lng2 * 180) / Math.PI + 540) % 360) - 180),
  };
}

function bearingDegrees(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function wideRadiusSampleBiases(locationBias: {
  lat: number;
  lng: number;
  radiusMeters?: number;
}): Array<{ lat: number; lng: number; radiusMeters: number; sector: number }> {
  const radiusMeters = locationBias.radiusMeters ?? 40234;
  const center = { lat: locationBias.lat, lng: locationBias.lng };
  const sampleDistanceMeters = radiusMeters * 0.62;
  const sampleRadiusMeters = Math.max(12070, radiusMeters * 0.28);
  const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
  return [
    { ...center, radiusMeters: Math.max(12070, radiusMeters * 0.22), sector: -1 },
    ...bearings.map((bearing, index) => ({
      ...destinationPoint(center, sampleDistanceMeters, bearing),
      radiusMeters: sampleRadiusMeters,
      sector: index,
    })),
  ];
}

function sortBestWithinRadius(
  competitors: DiscoveredCompetitor[],
  locationBias: { lat: number; lng: number; radiusMeters?: number },
): DiscoveredCompetitor[] {
  const radiusMiles = (locationBias.radiusMeters ?? 40234) / METERS_PER_MILE;
  const center = { lat: locationBias.lat, lng: locationBias.lng };
  return competitors
    .map((competitor) => ({
      competitor,
      distance:
        competitor.location
          ? distanceMiles(center, competitor.location)
          : Number.NEGATIVE_INFINITY,
    }))
    .filter(({ distance }) => distance <= radiusMiles * 1.05)
    .sort((a, b) => {
      if (b.competitor.reviewsCount !== a.competitor.reviewsCount) {
        return b.competitor.reviewsCount - a.competitor.reviewsCount;
      }
      if (b.competitor.totalScore !== a.competitor.totalScore) {
        return b.competitor.totalScore - a.competitor.totalScore;
      }
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.competitor.placeId.localeCompare(b.competitor.placeId);
    })
    .map(({ competitor }, index) => ({
      ...competitor,
      discoveryPosition: index + 1,
    }));
}

function selectDistributedBestWithinRadius(
  competitors: DiscoveredCompetitor[],
  locationBias: { lat: number; lng: number; radiusMeters?: number },
): DiscoveredCompetitor[] {
  const radiusMiles = (locationBias.radiusMeters ?? 40234) / METERS_PER_MILE;
  const center = { lat: locationBias.lat, lng: locationBias.lng };
  const scored = competitors
    .map((competitor) => {
      const distance =
        competitor.location
          ? distanceMiles(center, competitor.location)
          : Number.POSITIVE_INFINITY;
      const bearing =
        competitor.location && distance > 5
          ? bearingDegrees(center, competitor.location)
          : -1;
      return {
        competitor,
        distance,
        sector: bearing >= 0 ? Math.floor((bearing + 22.5) / 45) % 8 : -1,
      };
    })
    .filter(({ distance }) => distance <= radiusMiles * 1.05);

  const byQuality = (a: typeof scored[number], b: typeof scored[number]) => {
    if (b.competitor.reviewsCount !== a.competitor.reviewsCount) {
      return b.competitor.reviewsCount - a.competitor.reviewsCount;
    }
    if (b.competitor.totalScore !== a.competitor.totalScore) {
      return b.competitor.totalScore - a.competitor.totalScore;
    }
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.competitor.placeId.localeCompare(b.competitor.placeId);
  };

  const selected = new Map<string, DiscoveredCompetitor>();
  for (const sector of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const bestInSector = scored
      .filter((item) => item.sector === sector)
      .sort(byQuality)[0];
    if (bestInSector) {
      selected.set(bestInSector.competitor.placeId, bestInSector.competitor);
    }
  }

  for (const item of scored.sort(byQuality)) {
    selected.set(item.competitor.placeId, item.competitor);
  }

  return Array.from(selected.values()).map((competitor, index) => ({
    ...competitor,
    discoveryPosition: index + 1,
  }));
}

function compareByMapsEstimateThenProfile(
  a: DiscoveredCompetitor,
  b: DiscoveredCompetitor,
): number {
  const aPosition =
    typeof a.discoveryPosition === "number" && a.discoveryPosition > 0
      ? a.discoveryPosition
      : Number.POSITIVE_INFINITY;
  const bPosition =
    typeof b.discoveryPosition === "number" && b.discoveryPosition > 0
      ? b.discoveryPosition
      : Number.POSITIVE_INFINITY;

  if (aPosition !== bPosition) return aPosition - bPosition;
  if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
  return a.placeId.localeCompare(b.placeId);
}

function filterWithinLocationBiasRadius(
  competitors: DiscoveredCompetitor[],
  locationBias?: { lat: number; lng: number; radiusMeters?: number },
): DiscoveredCompetitor[] {
  if (!locationBias?.radiusMeters) return competitors;

  const radiusMiles = locationBias.radiusMeters / METERS_PER_MILE;
  const center = { lat: locationBias.lat, lng: locationBias.lng };
  return competitors.filter((competitor) => {
    if (!competitor.location) return false;
    return (
      distanceMiles(center, competitor.location) <=
      radiusMiles * RADIUS_FILTER_TOLERANCE
    );
  });
}

/**
 * Normalize specialty input to internal key.
 * Supports dental specialties + all universal verticals.
 */
function normalizeSpecialty(specialty: string): string {
  const aliases: Record<string, string> = {
    // Dental
    orthodontist: "orthodontics",
    orthodontists: "orthodontics",
    endodontist: "endodontics",
    endodontists: "endodontics",
    periodontist: "periodontics",
    periodontists: "periodontics",
    "oral surgeon": "oral_surgery",
    "oral surgeons": "oral_surgery",
    oral_surgeon: "oral_surgery",
    prosthodontist: "prosthodontics",
    prosthodontists: "prosthodontics",
    "pediatric dentist": "pediatric",
    "pediatric dentists": "pediatric",
    pediatric_dentist: "pediatric",
    dentist: "general",
    dentists: "general",
    "general dentist": "general",
    "general dentists": "general",
    "general dentistry": "general",
    dental_clinic: "general",
    "dental clinic": "general",
    orthodontics: "orthodontics",
    endodontics: "endodontics",
    periodontics: "periodontics",
    oral_surgery: "oral_surgery",
    pediatric: "pediatric",
    prosthodontics: "prosthodontics",
    general: "general",
    // Non-dental
    barber: "barber",
    "barber shop": "barber",
    "hair salon": "hair_salon",
    salon: "hair_salon",
    veterinarian: "veterinary",
    veterinary: "veterinary",
    attorney: "legal",
    lawyer: "legal",
    legal: "legal",
    accountant: "accounting",
    cpa: "accounting",
    accounting: "accounting",
    chiropractor: "chiropractic",
    chiropractic: "chiropractic",
    "physical therapist": "physical_therapy",
    physical_therapy: "physical_therapy",
    optometrist: "optometry",
    optometry: "optometry",
    plumber: "home_services",
    electrician: "home_services",
    hvac: "home_services",
    contractor: "home_services",
    home_services: "home_services",
    "real estate agent": "real_estate",
    realtor: "real_estate",
    real_estate: "real_estate",
    "financial advisor": "financial_advisor",
    financial_advisor: "financial_advisor",
    gym: "fitness",
    "personal trainer": "fitness",
    fitness: "fitness",
    "auto repair": "automotive",
    mechanic: "automotive",
    automotive: "automotive",
    restaurant: "food_service",
    cafe: "food_service",
    food_service: "food_service",
    "med spa": "medspa",
    medspa: "medspa",
    dermatologist: "medspa",
    "plastic surgeon": "plastic_surgery",
    "plastic surgery": "plastic_surgery",
    "cosmetic surgeon": "plastic_surgery",
    plastic_surgery: "plastic_surgery",
  };
  return aliases[specialty.toLowerCase().trim()] || specialty.toLowerCase().trim();
}

export function resolveComparisonSpecialty(raw: string | null | undefined): ComparisonSpecialty {
  const input = raw?.trim() || "dentist";
  const normalizedSpecialty = normalizeSpecialty(input);
  const config = COMPARISON_SPECIALTY_CONFIG[normalizedSpecialty];
  if (config) {
    return {
      value: config.value,
      label: config.label,
      query: config.query,
      normalizedSpecialty,
      primaryTypes: config.primaryTypes,
      isDental: DENTAL_TYPES.some((type) =>
        config.primaryTypes.includes(type)
      ),
      isDentalSpecialist: normalizedSpecialty !== "general",
    };
  }

  const primaryTypes = SPECIALTY_PRIMARY_TYPES[normalizedSpecialty] || [];
  const title = input
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return {
    value: input.toLowerCase().replace(/\s+/g, "_"),
    label: title,
    query: input,
    normalizedSpecialty,
    primaryTypes,
    isDental: primaryTypes.some((type) => DENTAL_TYPES.includes(type)),
    isDentalSpecialist:
      primaryTypes.some((type) => DENTAL_TYPES.includes(type)) &&
      normalizedSpecialty !== "general",
  };
}

function hasSpecialtyTextEvidence(
  comp: DiscoveredCompetitor,
  normalizedSpecialty: string
): boolean {
  const terms =
    COMPARISON_SPECIALTY_CONFIG[normalizedSpecialty]?.evidenceTerms || [];
  if (terms.length === 0) return false;
  const haystack = [
    comp.name,
    comp.category,
    comp.primaryType,
    ...(comp.types || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/_/g, " ");
  return terms.some((term) => haystack.includes(term));
}

export function classifyCompetitorSpecialtyEvidence(
  comp: DiscoveredCompetitor,
  specialty: string
): CompetitorSpecialtyEvidenceTier {
  const comparison = resolveComparisonSpecialty(specialty);
  const pt = comp.primaryType.toLowerCase();
  const types = (comp.types || []).map((type) => type.toLowerCase());
  const isDental =
    DENTAL_TYPES.includes(pt) ||
    types.some((type) => DENTAL_TYPES.includes(type));
  const hasExactType =
    comparison.primaryTypes.includes(pt) ||
    types.some((type) => comparison.primaryTypes.includes(type));

  if (hasExactType) {
    return "exact_specialist";
  }

  if (!comparison.isDentalSpecialist) {
    return hasSpecialtyTextEvidence(comp, comparison.normalizedSpecialty)
      ? "multi_specialty_evidence"
      : "unknown";
  }

  if (!isDental) {
    return "unknown";
  }

  if (hasSpecialtyTextEvidence(comp, comparison.normalizedSpecialty)) {
    return "multi_specialty_evidence";
  }

  if (
    GENERAL_DENTAL_TYPES.includes(pt) ||
    types.some((type) => GENERAL_DENTAL_TYPES.includes(type))
  ) {
    return "general_only";
  }

  return "unknown";
}

// =====================================================================
// BROADENING MAP: specialty -> adjacent broader category for fallback
// =====================================================================

const BROADENING_MAP: Record<string, string> = {
  // Dental specialties broaden to general dentist
  endodontics: "dentist",
  orthodontics: "dentist",
  periodontics: "dentist",
  oral_surgery: "dentist",
  pediatric: "dentist",
  prosthodontics: "dentist",
  // Medical specialties broaden to their parent category
  plastic_surgery: "cosmetic doctor",
  medspa: "dermatologist",
  chiropractic: "doctor",
  physical_therapy: "doctor",
  optometry: "eye doctor",
  // Professional services broaden generically
  accounting: "financial services",
  financial_advisor: "financial services",
  // Home services broaden to general contractor
  home_services: "contractor",
};

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
// CATEGORY FILTERING
// =====================================================================

/**
 * Filter competitors to same-category businesses.
 *
 * Universal: works for any GBP-listed business type. For dental specialists,
 * applies strict specialty matching. For all other verticals, uses the
 * Google Places types from SPECIALTY_PRIMARY_TYPES to reject junk results
 * while trusting the Text Search query's category scoping.
 *
 * @param competitors - Raw discovered competitors
 * @param specialty - Target specialty (e.g. "endodontist", "barber", "cpa")
 * @returns Filtered competitors in the same business category
 */
export function filterBySpecialty(
  competitors: DiscoveredCompetitor[],
  specialty: string,
): DiscoveredCompetitor[] {
  const comparison = resolveComparisonSpecialty(specialty);
  const normalizedSpecialty = comparison.normalizedSpecialty;
  const targetDisplayNames = (
    SPECIALTY_CATEGORIES[normalizedSpecialty] || []
  ).map((name) => name.toLowerCase());

  const beforeCount = competitors.length;
  const isDentalVertical = comparison.isDental || normalizedSpecialty === "general";
  const isGeneral = normalizedSpecialty === "general";
  const specialtyTypes =
    comparison.primaryTypes.length > 0
      ? comparison.primaryTypes
      : SPECIALTY_PRIMARY_TYPES[normalizedSpecialty] || [];

  const filtered = competitors.map((comp) => ({
    ...comp,
    specialtyEvidenceTier: classifyCompetitorSpecialtyEvidence(
      comp,
      comparison.query
    ),
  })).filter((comp) => {
    const pt = comp.primaryType.toLowerCase();
    const displayCat = comp.category.toLowerCase();

    if (isDentalVertical) {
      if (comparison.isDentalSpecialist) {
        return (
          comp.specialtyEvidenceTier === "exact_specialist" ||
          comp.specialtyEvidenceTier === "multi_specialty_evidence"
        );
      }
      // Dental verticals: type filtering with name/category fallback.
      // Google often lists specialists under generic "dentist" primaryType,
      // so we also check display category and business name for the specialty term.
      const isDental =
        DENTAL_TYPES.includes(pt) ||
        comp.types?.some((t) => DENTAL_TYPES.includes(t.toLowerCase()));
      if (!isDental) return false;
      if (isGeneral) return true;
      // Exact type match (e.g. primaryType === "orthodontist")
      if (specialtyTypes.includes(pt)) return true;
      if (comp.types?.some((t) => specialtyTypes.includes(t.toLowerCase()))) return true;
      // Display category match (e.g. "Orthodontist" in category text)
      if (targetDisplayNames.some((name) => displayCat.includes(name))) return true;
      // Name-based match: if business name contains the specialty term,
      // trust it. Google's text search already scoped to this specialty.
      const specTerms = specialtyTypes.map((t) => t.replace(/_/g, " "));
      const nameLower = comp.name.toLowerCase();
      if (specTerms.some((term) => nameLower.includes(term))) return true;
      // Display category keyword fallback for specialists listed as "dentist":
      // check if the original specialty word appears in the category or name
      const specWord = specialty.toLowerCase().replace(/s$/, "");
      if (displayCat.includes(specWord) || nameLower.includes(specWord)) return true;
      return false;
    }

    // Non-dental verticals: accept if type matches any of the vertical's known types
    if (specialtyTypes.length > 0) {
      const matchesType =
        specialtyTypes.includes(pt) ||
        comp.types?.some((t) => specialtyTypes.includes(t.toLowerCase()));
      if (matchesType) return true;

      // Fallback: check display category contains the specialty keyword
      const specLower = specialty.toLowerCase();
      if (displayCat.includes(specLower)) return true;

      return false;
    }

    // Unknown vertical with no type mapping: trust the Text Search results,
    // but reject obvious junk and cross-specialty medical businesses.
    const junkTypes = [
      "hospital", "school", "university", "government", "church", "museum", "library",
      // Medical cross-contamination: urgent care and general medical should not
      // match specialist searches (e.g. plastic surgeon should not match urgent care)
      "urgent_care", "emergency_room", "pharmacy", "drugstore",
    ];
    if (junkTypes.some((j) => pt.includes(j) || comp.types?.some((t) => t.toLowerCase().includes(j)))) {
      return false;
    }

    // For unknown specialties that look medical/specialist, require the competitor's
    // display category to share at least one significant word with the search specialty.
    // This prevents "Plastic Surgeon" from matching "Urgent Care" or "Family Medicine".
    const specWords = specialty.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (specWords.length > 0) {
      const catWords = displayCat.toLowerCase().split(/\s+/);
      const nameWords = comp.name.toLowerCase().split(/\s+/);
      const hasOverlap = specWords.some(
        (sw) => catWords.some((cw) => cw.includes(sw) || sw.includes(cw))
          || nameWords.some((nw) => nw.includes(sw) || sw.includes(nw))
      );
      if (!hasOverlap) {
        // Also check if the competitor's types overlap with the client types
        // (e.g. both have "doctor" or "plastic_surgeon" in their types)
        return false;
      }
    }

    return true;
  });

  const afterCount = filtered.length;
  log(
    `Category filter (${specialty}): ${beforeCount} → ${afterCount} competitors`,
  );

  if (afterCount < 5) {
    log(
      `⚠ Only ${afterCount} competitors match specialty "${specialty}". Consider broadening search.`,
    );
  }

  return filtered;
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
