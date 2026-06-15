/**
 * Location Resolver
 *
 * Centralized utility to resolve the correct location_id for a given
 * organization and optional GBP location identifier.
 *
 * Resolution order:
 * 1. If gbpLocationId provided → match google_properties.external_id → location_id
 * 2. If no match → use primary location for the organization
 * 3. If no organization → return null
 */

import { LocationModel } from "../models/LocationModel";
import { GooglePropertyModel } from "../models/GooglePropertyModel";
import logger from "../lib/logger";

export async function resolveLocationId(
  organizationId: number | null | undefined,
  gbpLocationId?: string | null
): Promise<number | null> {
  if (!organizationId) return null;

  // If a specific GBP location ID is provided, try to match it
  if (gbpLocationId) {
    const property = await GooglePropertyModel.findByExternalId(gbpLocationId);
    if (property?.location_id) {
      // Verify the matched property belongs to this organization's locations
      const location = await LocationModel.findById(property.location_id);
      if (location && location.organization_id === organizationId) {
        return property.location_id;
      }
      // Property belongs to a different org — fall through to primary
      logger.warn(
        `[locationResolver] Property ${gbpLocationId} resolved to location ${property.location_id} but it belongs to org ${location?.organization_id}, not ${organizationId}. Falling through to primary.`
      );
    }
  }

  // Fallback: use the primary location for this organization
  const primaryLocation =
    await LocationModel.findPrimaryByOrganizationId(organizationId);
  if (primaryLocation) {
    return primaryLocation.id;
  }

  // No primary — use the first location for this org
  const allLocations = await LocationModel.findByOrganizationId(organizationId);
  if (allLocations.length > 0) {
    logger.warn(
      `[locationResolver] No primary location for org ${organizationId}, using first location ${allLocations[0].id}`
    );
    return allLocations[0].id;
  }

  logger.warn(
    `[locationResolver] No locations found for organization ${organizationId}`
  );
  return null;
}
