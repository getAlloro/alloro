import { apiGet, apiPost, apiPut, apiPatch, apiDelete, unwrap } from "./index";
import type { LocationBillingMode } from "./billing";

export interface GooglePropertyInfo {
  type: string;
  external_id: string;
  account_id: string | null;
  display_name: string | null;
}

export interface LocationBusinessData {
  name?: string;
  address?: {
    street?: string;
    suite?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  phone?: string;
  website?: string;
  coordinates?: { lat: number; lng: number };
  hours?: Record<string, { open: string; close: string } | null>;
  categories?: string[];
  place_id?: string;
  refreshed_at?: string;
}

export interface OrgBusinessData {
  name?: string;
  description?: string;
  logo_url?: string;
  founding_year?: number;
  service_area?: string;
  social_profiles?: Record<string, string>;
  specialties?: string[];
  refreshed_at?: string;
}

export type LocationStatus = "active" | "pending_cancellation" | "cancelled";

export interface Location {
  id: number;
  organization_id: number;
  name: string;
  domain: string | null;
  is_primary: boolean;
  status: LocationStatus;
  cancel_effective_at: string | null;
  cancelled_at: string | null;
  business_data: LocationBusinessData | null;
  created_at: string;
  updated_at: string;
  googleProperties: GooglePropertyInfo[];
}

/**
 * Fetch all locations accessible to the current user.
 * Backend filters by organization + user_locations for non-admin users.
 * Cancelled locations are excluded unless includeCancelled is set
 * (PropertiesTab shows them greyed out; the sidebar switcher never does).
 */
export async function getLocations(options?: {
  includeCancelled?: boolean;
}): Promise<Location[]> {
  const response = await apiGet({
    path: options?.includeCancelled
      ? "/locations?include_cancelled=true"
      : "/locations",
  });
  // apiGet already unwraps axios { data } — response IS the body
  return response.locations || [];
}

/**
 * Fetch the primary location for the current organization.
 */
export async function getPrimaryLocation(): Promise<Location | null> {
  const response = await apiGet({ path: "/locations/primary" });
  return response.location || null;
}

export interface GBPSelection {
  accountId: string;
  locationId: string;
  displayName: string;
}

/**
 * Create a new location with a required GBP profile.
 * PLATFORM-ADMIN ONLY on the backend — client flows use purchaseLocation().
 */
export async function createLocation(data: {
  name: string;
  domain?: string;
  gbp: GBPSelection;
}): Promise<Location> {
  const response = await apiPost({
    path: "/locations",
    passedData: data,
  });
  return response.location;
}

export interface PurchaseLocationBilling {
  mode: LocationBillingMode;
  /** Cents actually invoiced now (null when nothing was charged) */
  chargedNow: number | null;
  newMonthlyTotal: number | null;
  currency: string | null;
}

/**
 * Paid location-add flow: the server recomputes the quote, charges the
 * prorated delta on the card on file, and creates the location only after
 * the charge succeeds. Throws ApiError with codes like PAYMENT_FAILED,
 * NO_PAYMENT_METHOD, GBP_ALREADY_LINKED, QUOTE_STALE.
 */
export async function purchaseLocation(data: {
  name: string;
  domain?: string;
  gbp: GBPSelection;
  /** Echo of the quote's newMonthlyTotal (cents) for consent integrity */
  expectedNewMonthlyTotal?: number | null;
}): Promise<{ location: Location; billing: PurchaseLocationBilling }> {
  return unwrap(
    await apiPost({ path: "/locations/purchase", passedData: data })
  );
}

/**
 * Update location metadata (name, domain, is_primary).
 */
export async function updateLocation(
  locationId: number,
  data: { name?: string; domain?: string; is_primary?: boolean }
): Promise<Location> {
  const response = await apiPut({
    path: `/locations/${locationId}`,
    passedData: data,
  });
  return response.location;
}

export interface LocationLifecycleResult {
  location: Location;
  billing: {
    action:
      | "quantity_decremented"
      | "subscription_ending"
      | "quantity_restored"
      | "subscription_resumed"
      | "charged"
      | "none";
    effectiveAt: string | null;
    chargedNow: number | null;
  };
}

/**
 * Schedule a location's cancellation. It stays fully usable until the end of
 * the current billing period (immediate for orgs without a subscription);
 * data is never deleted and the location can always be reopened.
 * Cancelling the LAST active location schedules the whole subscription to end.
 */
export async function cancelLocation(
  locationId: number
): Promise<LocationLifecycleResult> {
  return unwrap(await apiPost({ path: `/locations/${locationId}/cancel` }));
}

/**
 * Reopen a pending (free undo) or cancelled (paid re-add, prorated charge)
 * location. Throws ApiError with PAYMENT_FAILED / QUOTE_STALE codes on the
 * paid path.
 */
export async function reopenLocation(
  locationId: number,
  options?: { expectedNewMonthlyTotal?: number | null }
): Promise<LocationLifecycleResult> {
  return unwrap(
    await apiPost({
      path: `/locations/${locationId}/reopen`,
      passedData: options ?? {},
    })
  );
}

/**
 * Set or change the GBP profile for a location.
 */
export async function updateLocationGBP(
  locationId: number,
  gbp: GBPSelection
): Promise<Location> {
  const response = await apiPut({
    path: `/locations/${locationId}/gbp`,
    passedData: gbp,
  });
  return response.location;
}

/**
 * Disconnect GBP from a location.
 */
export async function disconnectLocationGBP(
  locationId: number
): Promise<void> {
  await apiDelete({ path: `/locations/${locationId}/gbp` });
}

// =====================================================================
// BUSINESS DATA
// =====================================================================

/**
 * Fetch all business data (org-level + locations).
 */
export async function getBusinessData(): Promise<{
  organization: { id: number; name: string; business_data: OrgBusinessData | null };
  locations: Array<{ id: number; name: string; is_primary: boolean; business_data: LocationBusinessData | null }>;
}> {
  const response = await apiGet({ path: "/locations/business-data" });
  return { organization: response.organization, locations: response.locations };
}

/**
 * Refresh location business data from Google Places API.
 */
export async function refreshLocationBusinessData(
  locationId: number
): Promise<LocationBusinessData> {
  const response = await apiPost({
    path: `/locations/${locationId}/refresh-business-data`,
  });
  return response.business_data;
}

/**
 * Update location business data overrides.
 */
export async function updateLocationBusinessData(
  locationId: number,
  data: Partial<LocationBusinessData>
): Promise<LocationBusinessData> {
  const response = await apiPatch({
    path: `/locations/${locationId}/business-data`,
    passedData: data,
  });
  return response.business_data;
}

/**
 * Update organization-level umbrella business data.
 */
export async function updateOrgBusinessData(
  data: Partial<OrgBusinessData>
): Promise<OrgBusinessData> {
  const response = await apiPatch({
    path: "/locations/org-business-data",
    passedData: data,
  });
  return response.business_data;
}
