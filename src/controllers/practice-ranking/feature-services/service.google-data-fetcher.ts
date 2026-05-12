/**
 * Google Data Fetcher Service
 *
 * Encapsulates fetching GBP and OAuth2 data for ranking analysis.
 * Delegates to existing service modules.
 */

import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import {
  fetchGBPDataForRange,
  FetchGBPDataOptions,
} from "../../../utils/dataAggregation/dataAggregator";

interface GbpLocation {
  accountId: string;
  locationId: string;
  displayName: string;
}

/**
 * Get a valid OAuth2 client for the given Google Account.
 */
export async function getOAuth2Client(
  googleAccountId: number,
  options: { forceRefresh?: boolean } = {},
) {
  return getValidOAuth2Client(googleAccountId, options);
}

/**
 * Fetch GBP data for the last 30 days for a target location.
 */
export async function fetchRecentGBPData(
  oauth2Client: any,
  targetLocation: GbpLocation,
  options: FetchGBPDataOptions = {},
) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const startDateStr = startDate.toISOString().split("T")[0];
  const endDateStr = endDate.toISOString().split("T")[0];

  return fetchGBPDataForRange(
    oauth2Client,
    [targetLocation],
    startDateStr,
    endDateStr,
    options,
  );
}
