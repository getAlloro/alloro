import axios from "axios";
import { LocationModel } from "../../models/LocationModel";
import { OrganizationModel } from "../../models/OrganizationModel";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";
import { buildAuthHeaders } from "../gbp/gbp-services/gbp-api.service";
import logger from "../../lib/logger";

/**
 * Fetch location profile from Google Business Profile API
 * and persist as business_data on the location row.
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

  return businessData;
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
