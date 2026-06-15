import axios from "axios";
import { buildAuthHeaders } from "./gbp-api.service";
import logger from "../../../lib/logger";

/**
 * Fetch location profile with comprehensive data using REST API (with retry fallback).
 * Used by AI ranking system.
 */
export async function getLocationProfileForRanking(
  auth: any,
  accountId: string,
  locationId: string,
) {
  try {
    // Business Information API v1 uses locations/{locationId} format
    const locationName = `locations/${locationId}`;
    const headers = await buildAuthHeaders(auth);

    logger.info(`[GBP Profile] Fetching profile for location ${locationId}...`);

    // Fetch comprehensive profile data including hours and address
    const { data } = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}`,
      {
        params: {
          readMask:
            "name,title,profile,websiteUri,phoneNumbers,categories,regularHours,specialHours,adWordsLocationExtensions,storefrontAddress",
        },
        headers,
      },
    );

    logger.info(
      `[GBP Profile] ✓ Got profile for ${locationId}: title=${data?.title}, website=${data?.websiteUri}, phone=${data?.phoneNumbers?.primaryPhone}, category=${data?.categories?.primaryCategory?.displayName}, address=${data?.storefrontAddress?.locality}, ${data?.storefrontAddress?.administrativeArea}`,
    );

    return data;
  } catch (error: any) {
    // Try alternate format with accounts prefix
    try {
      const alternateName = `accounts/${accountId}/locations/${locationId}`;
      const headers = await buildAuthHeaders(auth);

      logger.info(
        `[GBP Profile] Retrying with alternate format: ${alternateName}`,
      );

      const { data } = await axios.get(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${alternateName}`,
        {
          params: {
            readMask:
              "name,title,profile,websiteUri,phoneNumbers,categories,regularHours,specialHours,adWordsLocationExtensions,storefrontAddress",
          },
          headers,
        },
      );

      logger.info(
        `[GBP Profile] ✓ Got profile with alternate format for ${locationId}`,
      );

      return data;
    } catch (altError: any) {
      logger.warn(
        `[GBP Profile] ✗ Could not fetch profile for location ${locationId}: ${error.message} | Alt: ${altError.message}`,
      );
      // Log full error details for debugging
      if (error?.response?.data) {
        logger.warn({ err: JSON.stringify(error.response.data) }, `[GBP Profile] Error response:`);
      }
      return null;
    }
  }
}

/**
 * Fetch location profile with comprehensive data using REST API.
 * Returns null if profile cannot be fetched (graceful degradation).
 * Used by text sources (no retry).
 */
export async function getLocationProfile(
  auth: any,
  accountId: string,
  locationId: string,
) {
  try {
    const name = `accounts/${accountId}/locations/${locationId}`;
    const headers = await buildAuthHeaders(auth);

    // Try the v1 endpoint
    const { data } = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${name}`,
      {
        params: {
          readMask:
            "name,title,profile,websiteUri,phoneNumbers,categories,adWordsLocationExtensions",
        },
        headers,
      },
    );
    return data;
  } catch (error: any) {
    logger.warn(
      `[GBP] Could not fetch detailed profile for location ${locationId}: ${error.message}`,
    );
    // Return null to use fallback data
    return null;
  }
}
