/**
 * Location context loader (competitor onboarding)
 *
 * Extracted verbatim from service.location-competitor-onboarding.ts.
 * Loads + validates the location, its (non-archived) organization, and the
 * selected GBP property into a single LoadedLocationContext that every
 * onboarding service threads through. DB stays in models.
 */

import { LocationModel } from "../../../models/LocationModel";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS } from "../feature-utils/util.competitor-validator";

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

export async function loadLocationContext(
  locationId: number
): Promise<LoadedLocationContext> {
  const location = await LocationModel.findById(locationId);
  if (!location) {
    throw new Error(`Location ${locationId} not found`);
  }

  const org = await OrganizationModel.findContextById(location.organization_id);
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
