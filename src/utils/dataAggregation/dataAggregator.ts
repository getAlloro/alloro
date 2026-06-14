/**
 * Data Aggregation Service
 * Wraps existing service functions to provide flexible date range support
 * for agent processing with multiple clients
 */

import { getGBPAIReadyData } from "../../routes/gbp";
import logger from "../../lib/logger";

// =====================================================================
// TYPE DEFINITIONS
// =====================================================================

export interface ServiceDataResult {
  gbpData: any;
}

export interface GooglePropertyIds {
  gbp?: Array<{
    accountId: string;
    locationId: string;
    displayName: string;
  }>;
}

export interface FetchGBPDataOptions {
  refreshOAuth2Client?: () => Promise<any>;
  throwOnLocationError?: boolean;
}

function isUnauthorizedGoogleError(error: any): boolean {
  const status = error?.response?.status ?? error?.code;
  return Number(status) === 401;
}

// =====================================================================
// GOOGLE SERVICES DATA AGGREGATION
// =====================================================================

/**
 * Fetch GBP data for all locations in a date range
 * Returns grouped data by locationId with display names
 * @param oauth2Client - Authenticated OAuth2 client
 * @param locations - Array of GBP locations with accountId, locationId, displayName
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export async function fetchGBPDataForRange(
  oauth2Client: any,
  locations: Array<{
    accountId: string;
    locationId: string;
    displayName: string;
  }>,
  startDate: string,
  endDate: string,
  options: FetchGBPDataOptions = {}
): Promise<any> {
  try {
    if (!locations || locations.length === 0) {
      return { locations: [] };
    }

    let refreshedClientPromise: Promise<any> | null = null;
    const getRefreshedClient = async () => {
      if (!options.refreshOAuth2Client) return null;
      if (!refreshedClientPromise) {
        refreshedClientPromise = options.refreshOAuth2Client();
      }
      return refreshedClientPromise;
    };

    // Fetch data for all locations in parallel
    const locationDataPromises = locations.map(async (location) => {
      try {
        let data = await getGBPAIReadyData(
          oauth2Client,
          location.accountId,
          location.locationId,
          startDate,
          endDate
        );

        if (!data) {
          throw new Error(`GBP data unavailable for location ${location.locationId}`);
        }

        return {
          locationId: location.locationId,
          displayName: location.displayName,
          data,
        };
      } catch (error: any) {
        if (isUnauthorizedGoogleError(error) && options.refreshOAuth2Client) {
          try {
            const refreshedClient = await getRefreshedClient();
            if (refreshedClient) {
              const data = await getGBPAIReadyData(
                refreshedClient,
                location.accountId,
                location.locationId,
                startDate,
                endDate
              );

              if (!data) {
                throw new Error(
                  `GBP data unavailable after token refresh for location ${location.locationId}`
                );
              }

              return {
                locationId: location.locationId,
                displayName: location.displayName,
                data,
              };
            }
          } catch (retryError: any) {
            logger.error(
              `Error retrying GBP data for location ${location.locationId} after token refresh: ${retryError}`
            );
            if (options.throwOnLocationError) {
              throw retryError;
            }
            return {
              locationId: location.locationId,
              displayName: location.displayName,
              data: null,
              error: retryError?.message || String(retryError),
            };
          }
        }

        logger.error(
          `Error fetching GBP data for location ${location.locationId}: ${error}`
        );
        if (options.throwOnLocationError) {
          throw error;
        }
        return {
          locationId: location.locationId,
          displayName: location.displayName,
          data: null,
          error: error?.message || String(error),
        };
      }
    });

    const locationData = await Promise.all(locationDataPromises);

    return {
      locations: locationData,
      totalLocations: locations.length,
    };
  } catch (error: any) {
    logger.error(`Error fetching GBP data: ${error}`);
    if (options.throwOnLocationError) {
      throw error;
    }
    return { locations: [], error: error?.message || String(error) };
  }
}

// =====================================================================
// COMBINED DATA FETCHING
// =====================================================================

/**
 * Fetch all service data for a specific date range
 * Returns GBP data for the resolved location
 * @param oauth2Client - Authenticated OAuth2 client
 * @param googleAccountId - Google account ID (legacy param name, will be org ID)
 * @param domain - Domain name
 * @param propertyIds - Google property IDs (GBP)
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export async function fetchAllServiceData(
  oauth2Client: any,
  googleAccountId: number,
  domain: string,
  propertyIds: GooglePropertyIds,
  startDate: string,
  endDate: string
): Promise<ServiceDataResult> {
  logger.info(
    `[DataAggregator] Fetching all services for ${domain} (${startDate} to ${endDate})`
  );

  // Fetch GBP data for the location
  const gbpData =
    propertyIds.gbp && propertyIds.gbp.length > 0
      ? await fetchGBPDataForRange(oauth2Client, propertyIds.gbp, startDate, endDate)
      : null;

  return {
    gbpData,
  };
}
