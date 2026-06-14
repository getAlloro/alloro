/**
 * Identifier Service
 *
 * Calls the Identifier Agent webhook to determine specialty and market location
 * from GBP (Google Business Profile) data.
 *
 * Used by:
 * - src/routes/practiceRanking.ts (Admin Trigger)
 * - src/routes/agentsV2.ts (Automated Agent Run)
 */

import axios from "axios";

// Aliased to avoid shadowing the optional `logger` PARAM below.
import appLogger from "../../../lib/logger";

// Webhook URL from environment
const IDENTIFIER_AGENT_WEBHOOK = process.env.IDENTIFIER_AGENT_WEBHOOK || "";

export interface IdentifierResult {
  specialty: string;
  marketLocation: string;
  specialtyKeywords?: string[];
  // Location fields for Apify competitor discovery
  county?: string | null;
  state?: string | null;
  postalCode?: string | null;
  city?: string | null;
}

/**
 * Call Identifier Agent to determine specialty and market location from GBP profile
 *
 * @param gbpData - GBP data containing profile and storefront address
 * @param domain - The domain of the practice
 * @param logger - Optional logging function
 * @returns Object with specialty, marketLocation, specialtyKeywords, and location fields (county, state, postalCode, city)
 */
export async function identifyLocationMeta(
  gbpData: any,
  domain: string,
  logger?: (msg: string) => void,
): Promise<IdentifierResult> {
  const log = logger || ((msg: string) => appLogger.info(msg));
  log(`  [IDENTIFIER] Identifying specialty and market for ${domain}`);

  if (!IDENTIFIER_AGENT_WEBHOOK) {
    log(
      `  [IDENTIFIER] ⚠ IDENTIFIER_AGENT_WEBHOOK not configured, using fallbacks`,
    );
    return getFallbackMeta(gbpData);
  }

  try {
    const payload = {
      domain,
      gbp_profile: gbpData.profile || {},
      // Include full storefront address fields for better location identification
      storefront_address: gbpData.profile?.storefrontAddress || {},
      address: {
        locality: gbpData.profile?.storefrontAddress?.locality || "",
        administrativeArea:
          gbpData.profile?.storefrontAddress?.administrativeArea || "",
        postalCode: gbpData.profile?.storefrontAddress?.postalCode || "",
        addressLines: gbpData.profile?.storefrontAddress?.addressLines || [],
      },
    };

    const response = await axios.post(IDENTIFIER_AGENT_WEBHOOK, payload, {
      timeout: 60000,
      headers: { "Content-Type": "application/json" },
    });

    let data = response.data;
    if (Array.isArray(data)) data = data[0] || {};

    const specialty = data.specialty || deriveSpecialtyFromGbp(gbpData);
    const marketLocation = data.marketLocation || getFallbackMarket(gbpData);
    const specialtyKeywords = data.specialtyKeywords || undefined;

    // Extract location fields (use null if not provided)
    const county = data.county || null;
    const state = data.state || null;
    const postalCode = data.postalCode || null;
    const city = data.city || null;

    log(`  [IDENTIFIER] ✓ Identified: ${specialty} in ${marketLocation}`);
    if (specialtyKeywords && specialtyKeywords.length > 0) {
      log(`  [IDENTIFIER] ✓ Keywords: ${specialtyKeywords.join(", ")}`);
    }
    if (city || state || county || postalCode) {
      log(
        `  [IDENTIFIER] ✓ Location: city=${city}, state=${state}, county=${county}, postalCode=${postalCode}`,
      );
    }

    return {
      specialty,
      marketLocation,
      specialtyKeywords,
      county,
      state,
      postalCode,
      city,
    };
  } catch (error: any) {
    log(`  [IDENTIFIER] ✗ Webhook failed: ${error.message}. Using fallbacks.`);
    return getFallbackMeta(gbpData);
  }
}

/**
 * Derive specialty from GBP primary category when Identifier Agent
 * doesn't return one. Falls back to "dentist" (general) instead of
 * hardcoding "orthodontist" which skewed rankings for non-ortho practices.
 */
function deriveSpecialtyFromGbp(gbpData: any): string {
  const primaryCategory = (
    gbpData?.profile?.primaryCategory || ""
  ).toLowerCase();

  const categoryMap: Record<string, string> = {
    orthodontist: "orthodontist",
    endodontist: "endodontist",
    periodontist: "periodontist",
    "oral surgeon": "oral surgeon",
    "pediatric dentist": "pediatric dentist",
    prosthodontist: "prosthodontist",
  };

  for (const [keyword, specialty] of Object.entries(categoryMap)) {
    if (primaryCategory.includes(keyword)) return specialty;
  }

  return "dentist";
}

/**
 * Fallback logic for location metadata when webhook is not available
 */
export function getFallbackMeta(gbpData: any): IdentifierResult {
  const addr = gbpData.profile?.storefrontAddress;
  return {
    specialty: deriveSpecialtyFromGbp(gbpData),
    marketLocation: getFallbackMarket(gbpData),
    // Extract location fields from GBP address as fallback
    county: null,
    state: addr?.administrativeArea || null,
    postalCode: addr?.postalCode || null,
    city: addr?.locality || null,
  };
}

/**
 * Extract city, state from GBP profile storefront address
 */
export function getFallbackMarket(gbpData: any): string {
  const addr = gbpData.profile?.storefrontAddress;
  if (addr && addr.locality && addr.administrativeArea) {
    return `${addr.locality}, ${addr.administrativeArea}`;
  }
  return "Unknown, US";
}

export default {
  identifyLocationMeta,
  getFallbackMeta,
  getFallbackMarket,
};
