/**
 * LocationService
 *
 * Central service for managing locations and their google_properties.
 * Makes the `locations` + `google_properties` tables the source of truth
 * for GBP location data, replacing the legacy JSON blob approach.
 *
 * All mutations sync the JSON blob on `google_connections.google_property_ids`
 * for backward compatibility.
 */

import { QueryContext } from "../../models/BaseModel";
import { LocationModel, ILocation } from "../../models/LocationModel";
import {
  GooglePropertyModel,
  IGoogleProperty,
} from "../../models/GooglePropertyModel";
import {
  GoogleConnectionModel,
  IGoogleConnection,
} from "../../models/GoogleConnectionModel";
import { OrganizationModel } from "../../models/OrganizationModel";
import { syncSubscriptionQuantity } from "../billing/BillingService";
import { LocationError } from "./feature-utils/LocationError";

interface GBPSelection {
  accountId: string;
  locationId: string;
  displayName: string;
}

/**
 * Guard: a GBP profile (external_id) may be linked to at most one location
 * per Google connection. Without this, the (google_connection_id, external_id)
 * unique index rejects the insert with an opaque 500 — clients wrongly
 * re-selecting an already-linked profile must get a clean typed error instead.
 *
 * @param excludeLocationId - skip the check when the match is this location
 *   (re-selecting the same GBP for the same location is a no-op, not a clash)
 */
async function assertGbpNotLinked(
  connectionId: number,
  externalId: string,
  trx: QueryContext,
  excludeLocationId?: number
): Promise<void> {
  const existing = await GooglePropertyModel.findByConnectionAndExternalId(
    connectionId,
    externalId,
    trx
  );
  if (existing && existing.location_id !== excludeLocationId) {
    throw new LocationError(
      "GBP_ALREADY_LINKED",
      "This Google Business Profile is already linked to another location.",
      { externalId, linkedLocationId: existing.location_id }
    );
  }
}

/**
 * Sync locations + google_properties from a set of GBP selections.
 * Called by onboarding (save-gbp) and can be used for full re-sync from settings.
 *
 * Within a transaction:
 * 1. Determine additions and removals by comparing selections to existing google_properties
 * 2. Remove properties/locations for deselected GBP profiles
 * 3. Create locations + properties for newly selected GBP profiles
 * 4. Ensure exactly one is_primary location
 * 5. Sync JSON blob for backward compat
 */
export async function syncLocationsFromGBP(
  organizationId: number,
  googleConnectionId: number,
  selections: GBPSelection[]
): Promise<ILocation[]> {
  return LocationModel.transaction(async (trx) => {
    // Get org domain for new locations
    const org = await OrganizationModel.findById(organizationId, trx);
    const orgDomain = org?.domain || null;

    // Get existing google_properties for this connection
    const existingProperties = await GooglePropertyModel.findByConnectionId(
      googleConnectionId,
      trx
    );

    // Build lookup: external_id → existing property
    const existingByExternalId = new Map<string, IGoogleProperty>();
    for (const prop of existingProperties) {
      existingByExternalId.set(prop.external_id, prop);
    }

    // Determine which are new vs kept vs removed
    const selectedExternalIds = new Set(selections.map((s) => s.locationId));
    const toRemove = existingProperties.filter(
      (p) => !selectedExternalIds.has(p.external_id)
    );
    const toAdd = selections.filter(
      (s) => !existingByExternalId.has(s.locationId)
    );

    // --- Removals ---
    for (const prop of toRemove) {
      // Delete the google_properties row
      await GooglePropertyModel.deleteById(prop.id, trx);

      // Check if the parent location has any remaining properties
      const remainingProps = await GooglePropertyModel.findByLocationId(
        prop.location_id,
        trx
      );
      if (remainingProps.length === 0) {
        // Null out location_id on downstream tables before deleting
        await LocationModel.nullOutLocationReferences(prop.location_id, trx);
        await LocationModel.deleteById(prop.location_id, trx);
      }
    }

    // --- Additions ---
    for (const selection of toAdd) {
      // Determine if this should be primary
      // (first location for the org, or no primary exists after removals)
      const existingLocations = await LocationModel.findByOrganizationId(
        organizationId,
        trx
      );
      const hasPrimary = existingLocations.some((l) => l.is_primary);

      const location = await LocationModel.create(
        {
          organization_id: organizationId,
          name: selection.displayName,
          domain: orgDomain,
          is_primary: !hasPrimary,
        },
        trx
      );

      await GooglePropertyModel.create(
        {
          location_id: location.id,
          google_connection_id: googleConnectionId,
          type: "gbp",
          external_id: selection.locationId,
          account_id: selection.accountId || null,
          display_name: selection.displayName,
          metadata: null,
          selected: true,
        },
        trx
      );
    }

    // --- Ensure exactly one primary ---
    await ensurePrimary(organizationId, trx);

    // --- Sync JSON blob for backward compat ---
    await syncJsonBlobFromProperties(organizationId, googleConnectionId, trx);

    // Return final state
    return LocationModel.findByOrganizationId(organizationId, trx);
  });
}

/**
 * Transaction body of location creation: guards, inserts, and blob sync.
 * Exported so the paid purchase flow (LocationBillingService) can run the
 * exact same creation inside its own charge-wrapping transaction — commit
 * only happens after the Stripe charge succeeds ("create after paid").
 */
export async function createLocationInTransaction(
  trx: QueryContext,
  organizationId: number,
  name: string,
  gbp: GBPSelection,
  domain?: string | null
): Promise<ILocation> {
  const connection = await GoogleConnectionModel.findOneByOrganization(
    organizationId,
    trx
  );
  if (!connection) {
    throw new LocationError(
      "NO_GOOGLE_CONNECTION",
      "No Google connection found for organization",
      { organizationId }
    );
  }

  // A GBP profile may only back one location per org connection
  await assertGbpNotLinked(connection.id, gbp.locationId, trx);

  // If no domain provided, use org domain
  const orgDomain =
    domain ??
    (await OrganizationModel.findById(organizationId, trx))?.domain ??
    null;

  // Determine primary status
  const existingCount = await LocationModel.count(
    { organization_id: organizationId },
    trx
  );

  const loc = await LocationModel.create(
    {
      organization_id: organizationId,
      name,
      domain: orgDomain,
      is_primary: existingCount === 0,
    },
    trx
  );

  await GooglePropertyModel.create(
    {
      location_id: loc.id,
      google_connection_id: connection.id,
      type: "gbp",
      external_id: gbp.locationId,
      account_id: gbp.accountId || null,
      display_name: gbp.displayName,
      metadata: null,
      selected: true,
    },
    trx
  );

  await syncJsonBlobFromProperties(organizationId, connection.id, trx);

  return loc;
}

/**
 * Create a single location with a required GBP connection.
 * (Platform-admin path — clients go through LocationBillingService.purchaseLocation.)
 */
export async function createLocation(
  organizationId: number,
  name: string,
  gbp: GBPSelection,
  domain?: string | null
): Promise<ILocation> {
  const location = await LocationModel.transaction(async (trx) =>
    createLocationInTransaction(trx, organizationId, name, gbp, domain)
  );

  // Sync Stripe subscription quantity (fire-and-forget, after transaction commits)
  syncSubscriptionQuantity(organizationId);

  return location;
}

/**
 * Update location metadata (name, domain, is_primary).
 */
export async function updateLocation(
  locationId: number,
  organizationId: number,
  data: { name?: string; domain?: string; is_primary?: boolean }
): Promise<void> {
  return LocationModel.transaction(async (trx) => {
    const location = await LocationModel.findById(locationId, trx);
    if (!location || location.organization_id !== organizationId) {
      throw new Error("Location not found or does not belong to organization");
    }

    // If setting as primary, unset current primary first
    if (data.is_primary === true && !location.is_primary) {
      const currentPrimary = await LocationModel.findPrimaryByOrganizationId(
        organizationId,
        trx
      );
      if (currentPrimary) {
        await LocationModel.updateById(
          currentPrimary.id,
          { is_primary: false },
          trx
        );
      }
    }

    await LocationModel.updateById(locationId, data, trx);
  });
}

/**
 * Set or change the GBP profile for an existing location.
 */
export async function setLocationGBP(
  locationId: number,
  organizationId: number,
  gbp: GBPSelection
): Promise<void> {
  return LocationModel.transaction(async (trx) => {
    const location = await LocationModel.findById(locationId, trx);
    if (!location || location.organization_id !== organizationId) {
      throw new Error("Location not found or does not belong to organization");
    }

    const connection = await GoogleConnectionModel.findOneByOrganization(
      organizationId,
      trx
    );
    if (!connection) {
      throw new Error("No Google connection found for organization");
    }

    // Changing to a GBP that already backs a DIFFERENT location must fail
    // cleanly (same unique index as create; re-selecting this location's own
    // GBP is a harmless no-op re-link)
    await assertGbpNotLinked(connection.id, gbp.locationId, trx, locationId);

    // Remove existing google_properties for this location
    await GooglePropertyModel.deleteByLocationId(locationId, trx);

    // Create new one
    await GooglePropertyModel.create(
      {
        location_id: locationId,
        google_connection_id: connection.id,
        type: "gbp",
        external_id: gbp.locationId,
        account_id: gbp.accountId || null,
        display_name: gbp.displayName,
        metadata: null,
        selected: true,
      },
      trx
    );

    await syncJsonBlobFromProperties(organizationId, connection.id, trx);
  });
}

/**
 * Disconnect GBP from a location (remove google_properties rows).
 */
export async function disconnectLocationGBP(
  locationId: number,
  organizationId: number
): Promise<void> {
  return LocationModel.transaction(async (trx) => {
    const location = await LocationModel.findById(locationId, trx);
    if (!location || location.organization_id !== organizationId) {
      throw new Error("Location not found or does not belong to organization");
    }

    await GooglePropertyModel.deleteByLocationId(locationId, trx);

    const connection = await GoogleConnectionModel.findOneByOrganization(
      organizationId,
      trx
    );
    if (connection) {
      await syncJsonBlobFromProperties(organizationId, connection.id, trx);
    }
  });
}

// =====================================================================
// Internal helpers
// =====================================================================

/**
 * Rebuild the JSON blob on google_connections.google_property_ids
 * from the current google_properties rows.
 */
async function syncJsonBlobFromProperties(
  organizationId: number,
  connectionId: number,
  trx: QueryContext
): Promise<void> {
  const properties = await GooglePropertyModel.findByConnectionId(
    connectionId,
    trx
  );

  const gbpBlob = properties
    .filter((p) => p.type === "gbp" && p.selected)
    .map((p) => ({
      accountId: p.account_id || "",
      locationId: p.external_id,
      displayName: p.display_name || "",
    }));

  await GoogleConnectionModel.updatePropertyIds(
    connectionId,
    { gbp: gbpBlob },
    trx
  );
}

/**
 * Ensure exactly one location is marked is_primary for the org.
 * If none is primary, promote the first one.
 */
async function ensurePrimary(
  organizationId: number,
  trx: QueryContext
): Promise<void> {
  const locations = await LocationModel.findByOrganizationId(
    organizationId,
    trx
  );
  if (locations.length === 0) return;

  const hasPrimary = locations.some((l) => l.is_primary);
  if (!hasPrimary) {
    await LocationModel.updateById(locations[0].id, { is_primary: true }, trx);
  }
}

