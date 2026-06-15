import { OAuth2Client } from "google-auth-library";
import { fetchAvailableGBPProperties } from "../../settings/feature-services/service.google-properties";
import { syncLocationsFromGBP } from "../../locations/LocationService";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { buildAuthHeaders } from "../../gbp/gbp-services/gbp-api.service";
import { extractDomainFromUrl } from "../../places/feature-utils/domainExtractor";
import axios from "axios";
import logger from "../../../lib/logger";

export interface GBPLocationItem {
  accountId: string;
  locationId: string;
  displayName: string;
}

/**
 * Fetch available GBP locations for the authenticated user's Google account.
 * Delegates to the shared settings service function.
 */
export async function getAvailableGBPLocations(
  oauth2Client: OAuth2Client
): Promise<any[]> {
  return fetchAvailableGBPProperties(oauth2Client);
}

/**
 * Save selected GBP locations.
 * Creates/syncs locations + google_properties rows (source of truth),
 * and also updates the JSON blob on google_connections for backward compat.
 */
export async function saveGBPSelection(
  organizationId: number,
  data: GBPLocationItem[]
): Promise<any> {
  const connection =
    await GoogleConnectionModel.findOneByOrganization(organizationId);
  if (!connection) {
    throw new Error("No Google connection found for organization");
  }

  const locations = await syncLocationsFromGBP(
    organizationId,
    connection.id,
    data
  );

  return {
    properties: { gbp: data },
    locations,
    message: "Successfully saved GBP locations",
  };
}

/**
 * Fetch the websiteUri for a specific GBP location and return the clean domain.
 *
 * Uses the Business Information REST API to fetch the location profile
 * with websiteUri in the readMask.
 */
export async function getGBPLocationWebsite(
  oauth2Client: OAuth2Client,
  accountId: string,
  locationId: string
): Promise<{ websiteUri: string | null; domain: string }> {
  const name = `accounts/${accountId}/locations/${locationId}`;
  const headers = await buildAuthHeaders(oauth2Client);

  try {
    const { data } = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${name}`,
      {
        params: {
          readMask: "websiteUri",
        },
        headers,
      }
    );

    const websiteUri = data?.websiteUri || null;
    const domain = extractDomainFromUrl(websiteUri);

    logger.info(
      `[GBP Onboarding] Fetched website for ${locationId}: ${websiteUri} → ${domain}`
    );

    return { websiteUri, domain };
  } catch (error: any) {
    logger.warn(
      `[GBP Onboarding] Could not fetch website for location ${locationId}: ${error.message}`
    );
    return { websiteUri: null, domain: "" };
  }
}
