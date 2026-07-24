import axios from "axios";
import { LocationModel } from "../../models/LocationModel";
import { OrganizationModel } from "../../models/OrganizationModel";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";
import { buildAuthHeaders } from "../gbp/gbp-services/gbp-api.service";
import { autoConfigureVocabulary } from "../../services/vocabularyAutoMapper";
import logger from "../../lib/logger";

/**
 * Fetch a location's profile from the Google Business Profile API, persist it
 * as `business_data` on the location row, and — because the org's GBP primary
 * category only becomes known here — resolve the org's vocabulary from it.
 *
 * The vocabulary resolution is a deliberate second responsibility on this
 * lifecycle point, not an oversight (§2.1): this is where the category lands.
 * It is non-fatal and first-write-wins, so it cannot break or alter a refresh.
 */
export async function refreshLocationBusinessData(
  locationId: number,
  organizationId: number,
  auth: any
): Promise<Record<string, unknown>> {
  const location = await LocationModel.findById(locationId);
  if (!location || location.organization_id !== organizationId) {
    throw new Error("Location not found or does not belong to organization");
  }

  const properties = await GooglePropertyModel.findByLocationId(locationId);
  const gbp = properties[0];
  if (!gbp) {
    throw new Error("No GBP profile connected to this location");
  }

  const externalId = gbp.external_id;
  const accountId = gbp.account_id;

  // Fetch from Google Business Information API v1
  const profileData = await fetchGBPProfile(auth, accountId, externalId);
  if (!profileData) {
    throw new Error("Failed to fetch business profile from Google");
  }

  // Map to our business_data schema
  const businessData = mapGBPToBusinessData(profileData, externalId);

  // Persist
  await LocationModel.updateById(locationId, {
    business_data: businessData,
  } as any);

  // The GBP category just landed — this is the lifecycle point where the org's
  // vocabulary can be resolved. Auto-configure it so Alloro speaks the owner's
  // language. Idempotent (first-write-wins) and non-fatal.
  //
  // Read the category off the RAW profile, not off businessData.categories[0]:
  // that array only receives the primary category when it has a displayName,
  // so a primary category without one silently promotes the first ADDITIONAL
  // category into position 0. Combined with first-write-wins, that would label
  // the org from a secondary category permanently.
  await configureVocabularyFromBusinessData(
    organizationId,
    readCategoryDisplayNames(profileData)
  );

  return businessData;
}

interface GbpCategoryDisplayNames {
  /** null when Google returned no usable primary-category display name. */
  primary: string | null;
  additional: string[];
}

/**
 * Read the GBP category display names off a raw profile response BY NAME.
 *
 * The primary category is identified by its field, never by array position:
 * Google can return a `primaryCategory` that carries a resource `name` but no
 * `displayName`, and a position-based read would then hand an additional
 * category to the mapper as if it were the primary one.
 */
function readCategoryDisplayNames(profile: unknown): GbpCategoryDisplayNames {
  const categories = (
    profile as {
      categories?: {
        primaryCategory?: { displayName?: unknown };
        additionalCategories?: { displayName?: unknown }[];
      };
    } | null
  )?.categories;

  const primaryRaw = categories?.primaryCategory?.displayName;
  const primary =
    typeof primaryRaw === "string" && primaryRaw.trim().length > 0
      ? primaryRaw.trim()
      : null;

  const additional = Array.isArray(categories?.additionalCategories)
    ? categories.additionalCategories
        .map((category) => category?.displayName)
        .filter(
          (name): name is string =>
            typeof name === "string" && name.trim().length > 0
        )
        .map((name) => name.trim())
    : [];

  return { primary, additional };
}

/**
 * Hand the GBP category signal to the vocabulary auto-mapper. The primary
 * category drives detection; additional categories are extra signal.
 *
 * Writes nothing when there is no primary category display name. The mapper is
 * first-write-wins, so a guess made from a secondary category would be
 * permanent — better to leave the org unconfigured and resolve it on a later
 * refresh. Non-fatal: a vocabulary failure must never break the business-data
 * refresh, but it is logged (§3.2).
 */
async function configureVocabularyFromBusinessData(
  organizationId: number,
  categories: GbpCategoryDisplayNames
): Promise<void> {
  if (!categories.primary) {
    logger.warn(
      `[BusinessData] No GBP primary category display name for org ${organizationId}; skipping vocabulary auto-config rather than guessing from an additional category`
    );
    return;
  }

  try {
    await autoConfigureVocabulary(
      organizationId,
      categories.primary,
      categories.additional
    );
  } catch (error) {
    logger.warn(
      `[BusinessData] Vocabulary auto-config skipped for org ${organizationId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Update organization-level business data (manual entry).
 */
export async function updateOrgBusinessData(
  organizationId: number,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const org = await OrganizationModel.findById(organizationId);
  if (!org) {
    throw new Error("Organization not found");
  }

  const existing = (org.business_data as Record<string, unknown>) || {};
  const merged = { ...existing, ...data, refreshed_at: new Date().toISOString() };

  await OrganizationModel.updateById(organizationId, {
    business_data: merged,
  } as any);

  return merged;
}

/**
 * Update location-level business data overrides (manual entry).
 */
export async function updateLocationBusinessData(
  locationId: number,
  organizationId: number,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const location = await LocationModel.findById(locationId);
  if (!location || location.organization_id !== organizationId) {
    throw new Error("Location not found or does not belong to organization");
  }

  const existing = (location.business_data as Record<string, unknown>) || {};
  const merged = { ...existing, ...data, refreshed_at: new Date().toISOString() };

  await LocationModel.updateById(locationId, {
    business_data: merged,
  } as any);

  return merged;
}

/**
 * Get all business data for an organization (org-level + all locations).
 */
export async function getOrgBusinessData(organizationId: number) {
  const org = await OrganizationModel.findById(organizationId);
  if (!org) {
    throw new Error("Organization not found");
  }

  const locations = await LocationModel.findByOrganizationId(organizationId);

  return {
    organization: {
      id: org.id,
      name: org.name,
      business_data: org.business_data || null,
    },
    locations: locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      is_primary: loc.is_primary,
      business_data: loc.business_data || null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchGBPProfile(
  auth: any,
  accountId: string | null,
  locationId: string
) {
  const readMask =
    "name,title,profile,websiteUri,phoneNumbers,categories,regularHours,specialHours,storefrontAddress";

  // Try locations/{id} format first
  try {
    const headers = await buildAuthHeaders(auth);
    const { data } = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationId}`,
      { params: { readMask }, headers }
    );
    return data;
  } catch {
    // Fallback to accounts/{accountId}/locations/{locationId}
    if (!accountId) return null;
    try {
      const headers = await buildAuthHeaders(auth);
      const { data } = await axios.get(
        `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations/${locationId}`,
        { params: { readMask }, headers }
      );
      return data;
    } catch (err: any) {
      logger.error({ err: err.message }, `[BusinessData] Failed to fetch GBP profile for ${locationId}:`);
      return null;
    }
  }
}

function mapGBPToBusinessData(
  profile: any,
  placeId: string
): Record<string, unknown> {
  const addr = profile.storefrontAddress || {};
  const addressLines = addr.addressLines || [];
  const hours = profile.regularHours?.periods || [];

  // Map hours to our schema
  const dayMap: Record<string, string> = {
    MONDAY: "monday",
    TUESDAY: "tuesday",
    WEDNESDAY: "wednesday",
    THURSDAY: "thursday",
    FRIDAY: "friday",
    SATURDAY: "saturday",
    SUNDAY: "sunday",
  };

  const mappedHours: Record<string, any> = {
    monday: null,
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  };

  for (const period of hours) {
    const day = dayMap[period.openDay];
    if (day) {
      const openTime = period.openTime
        ? `${String(period.openTime.hours || 0).padStart(2, "0")}:${String(period.openTime.minutes || 0).padStart(2, "0")}`
        : null;
      const closeTime = period.closeTime
        ? `${String(period.closeTime.hours || 0).padStart(2, "0")}:${String(period.closeTime.minutes || 0).padStart(2, "0")}`
        : null;
      mappedHours[day] = { open: openTime, close: closeTime };
    }
  }

  // Categories
  const categories: string[] = [];
  if (profile.categories?.primaryCategory?.displayName) {
    categories.push(profile.categories.primaryCategory.displayName);
  }
  if (profile.categories?.additionalCategories) {
    for (const cat of profile.categories.additionalCategories) {
      if (cat.displayName) categories.push(cat.displayName);
    }
  }

  return {
    name: profile.title || null,
    description: profile.profile?.description || null,
    address: {
      street: addressLines[0] || null,
      suite: addressLines[1] || null,
      city: addr.locality || null,
      state: addr.administrativeArea || null,
      zip: addr.postalCode || null,
      country: addr.regionCode || "US",
    },
    phone: profile.phoneNumbers?.primaryPhone || null,
    website: profile.websiteUri || null,
    coordinates: addr.latlng
      ? { lat: addr.latlng.latitude, lng: addr.latlng.longitude }
      : null,
    hours: mappedHours,
    categories,
    place_id: placeId,
    refreshed_at: new Date().toISOString(),
  };
}
