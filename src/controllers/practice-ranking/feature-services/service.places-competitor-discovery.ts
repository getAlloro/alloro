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
  location?: {
    lat: number;
    lng: number;
  };
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

// Name/category stems that signal a dental specialty when Google lists the
// place under generic primaryType="dentist" (which it does for the vast
// majority of dental specialists in the SLC market and elsewhere). Stems
// match both noun form (Endodontics) and practitioner form (Endodontist),
// and are long enough to avoid false positives on unrelated dental names
// (e.g. "Brendon's Dental" does not contain "endodont").
const SPECIALTY_NAME_STEMS: Record<string, string[]> = {
  orthodontics: ["orthodont"],
  endodontics: ["endodont", "root canal"],
  periodontics: ["periodont"],
  oral_surgery: ["oral surgeon", "oral surgery", "maxillofacial"],
  pediatric: ["pediatric dent", "children's dent", "kids dent"],
  prosthodontics: ["prosthodont"],
};

// All known valid business types across all verticals
const ALL_KNOWN_TYPES = [
  ...DENTAL_TYPES,
  ...Object.values(SPECIALTY_PRIMARY_TYPES).flat(),
];

// =====================================================================
// HELPERS
// =====================================================================

function log(message: string): void {
  console.log(`[PLACES-DISCOVERY] ${message}`);
}

/**
 * Normalize specialty input to internal key.
 * Supports dental specialties + all universal verticals.
 */
function normalizeSpecialty(specialty: string): string {
  const aliases: Record<string, string> = {
    // Dental
    orthodontist: "orthodontics",
    endodontist: "endodontics",
    periodontist: "periodontics",
    "oral surgeon": "oral_surgery",
    prosthodontist: "prosthodontics",
    "pediatric dentist": "pediatric",
    dentist: "general",
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
function placesToCompetitors(places: any[]): DiscoveredCompetitor[] {
  return places.map((place: any) => {
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

  const places = await textSearch(searchQuery, limit, locationBias);
  log(`Found ${places.length} raw results`);

  const competitors = placesToCompetitors(places);

  // Sort by review count (desc), then rating (desc), then placeId (deterministic)
  competitors.sort((a, b) => {
    if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.placeId.localeCompare(b.placeId);
  });

  return competitors;
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

  // Step 6: Merge, deduplicating by placeId (specialty results first)
  const seenIds = new Set(specialtyFiltered.map((c) => c.placeId));
  const additionalCompetitors = broaderResults.filter((c) => !seenIds.has(c.placeId));

  // Sort each group by reviews, but ALWAYS put specialty matches first.
  // An endodontist's real competitor is another endodontist, not a general
  // dentist with more reviews. Trust depends on this.
  const specialtySet = new Set(specialtyFiltered.map((c) => c.placeId));

  const sortByReviews = (a: any, b: any) => {
    if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.placeId.localeCompare(b.placeId);
  };

  specialtyFiltered.sort(sortByReviews);
  additionalCompetitors.sort(sortByReviews);

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
  const normalizedSpecialty = normalizeSpecialty(specialty);
  const targetDisplayNames = (
    SPECIALTY_CATEGORIES[normalizedSpecialty] || []
  ).map((name) => name.toLowerCase());

  const beforeCount = competitors.length;
  const isDentalVertical = DENTAL_TYPES.some((t) =>
    (SPECIALTY_PRIMARY_TYPES[normalizedSpecialty] || []).includes(t)
  ) || normalizedSpecialty === "general";
  const isGeneral = normalizedSpecialty === "general";
  const specialtyTypes = SPECIALTY_PRIMARY_TYPES[normalizedSpecialty] || [];

  const filtered = competitors.filter((comp) => {
    const pt = comp.primaryType.toLowerCase();
    const displayCat = comp.category.toLowerCase();

    if (isDentalVertical) {
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
      // Stem match on name or category. Covers the common case where Google
      // lists a real specialist as primaryType="dentist" with the specialty
      // signal carried only by the business name (e.g. "Greater Endodontics
      // Riverton"). Stems are long enough that a general dentist's name
      // ("Smith Family Dental") will not falsely match.
      const nameLower = comp.name.toLowerCase();
      const stems = SPECIALTY_NAME_STEMS[normalizedSpecialty] || [];
      if (stems.some((s) => nameLower.includes(s) || displayCat.includes(s))) return true;
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
 * Get client's photo count via Google Places API.
 * Replaces the 2 Apify runs (search + detail scrape) previously used.
 *
 * @param practiceName - Client business name
 * @param marketLocation - Market location (e.g. "Austin, TX")
 * @returns Object with placeId and photosCount
 */
export async function getClientPhotosViaPlaces(
  practiceName: string,
  marketLocation: string,
): Promise<{ placeId: string | null; photosCount: number }> {
  const searchQuery = `${practiceName} ${marketLocation}`;
  log(`Searching for client: "${searchQuery}"`);

  const places = await textSearch(searchQuery, 5);

  if (places.length === 0) {
    log(`✗ No results found for client`);
    return { placeId: null, photosCount: 0 };
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
    return { placeId: null, photosCount: 0 };
  }

  const placeId = match.id;
  const photosCount = match.photos?.length ?? 0;

  log(`✓ Found client: ${match.displayName?.text} (${placeId}), ${photosCount} photos`);

  return { placeId, photosCount };
}
