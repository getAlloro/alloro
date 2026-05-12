/**
 * Specialty Identifier Service
 *
 * Auto-detects specialty, market location, and search keywords
 * for a GBP location using the Identifier Agent and GBP data.
 * Extracted from the duplicated logic in processBatchAnalysis
 * and processBatchAnalysisWithExistingRecords.
 */

import { db } from "../../../database/connection";
import { identifyLocationMeta } from "./service.identifier";
import { getSpecialtyKeywords } from "./service.apify";
import { LocationParams } from "./service.ranking-pipeline";
import * as googleDataFetcher from "./service.google-data-fetcher";
import { log, logDebug } from "../feature-utils/util.ranking-logger";
import { parseJsonField } from "../feature-utils/util.json-parser";

interface LocationInput {
  gbpAccountId: string;
  gbpLocationId: string;
  gbpLocationName: string;
  specialty?: string;
  marketLocation?: string;
  locationParams?: LocationParams;
}

export interface IdentificationResult {
  specialty: string;
  marketLocation: string;
  locationParams?: LocationParams;
}

/**
 * Identify or resolve specialty, market location, and keywords for a ranking.
 * Updates the ranking record in DB with identified metadata.
 *
 * If specialty and marketLocation are both provided, only keywords are resolved.
 * Otherwise, calls the Identifier Agent to auto-detect from GBP data.
 */
export async function identifyAndUpdate(
  rankingId: number,
  googleAccountId: number,
  locationInput: LocationInput,
  domain: string,
  batchId: string,
): Promise<IdentificationResult> {
  let specialty = locationInput.specialty;
  let marketLocation = locationInput.marketLocation;
  let locationParams = locationInput.locationParams;

  if (!specialty || !marketLocation) {
    log(
      `[Batch ${batchId}] Auto-detecting specialty/location for ${locationInput.gbpLocationName}...`,
    );

    try {
      await db("practice_rankings")
        .where({ id: rankingId })
        .update({
          status_detail: JSON.stringify({
            currentStep: "identifying",
            message: "Identifying specialty and market location...",
            progress: 3,
            stepsCompleted: ["queued"],
            timestamps: { identifying_at: new Date().toISOString() },
          }),
          updated_at: new Date(),
        });

      let oauth2Client =
        await googleDataFetcher.getOAuth2Client(googleAccountId);
      const account = await db("google_connections")
        .where({ id: googleAccountId })
        .first();
      const propertyIds = parseJsonField(account.google_property_ids);

      const targetLocation = propertyIds?.gbp?.find(
        (loc: any) =>
          loc.locationId === locationInput.gbpLocationId &&
          loc.accountId === locationInput.gbpAccountId,
      );

      if (targetLocation) {
        const gbpData = await googleDataFetcher.fetchRecentGBPData(
          oauth2Client,
          targetLocation,
          {
            refreshOAuth2Client: async () => {
              oauth2Client = await googleDataFetcher.getOAuth2Client(
                googleAccountId,
                { forceRefresh: true },
              );
              return oauth2Client;
            },
            throwOnLocationError: true,
          },
        );

        const locationData = gbpData?.locations?.[0]?.data || {};
        const identifiedMeta = await identifyLocationMeta(
          locationData,
          domain,
          log,
        );

        specialty = specialty || identifiedMeta.specialty;
        marketLocation = marketLocation || identifiedMeta.marketLocation;

        // Use dynamic keywords from Identifier Agent if available, otherwise fallback to hardcoded
        const specialtyKeywords =
          identifiedMeta.specialtyKeywords &&
          identifiedMeta.specialtyKeywords.length > 0
            ? identifiedMeta.specialtyKeywords
            : getSpecialtyKeywords(specialty);
        const keywordsString = specialtyKeywords.join(", ");

        // Extract location params for Apify from Identifier Agent
        locationParams = {
          county: identifiedMeta.county || null,
          state: identifiedMeta.state || null,
          postalCode: identifiedMeta.postalCode || null,
          city: identifiedMeta.city || null,
        };

        log(
          `[Batch ${batchId}] Keywords source: ${
            identifiedMeta.specialtyKeywords &&
            identifiedMeta.specialtyKeywords.length > 0
              ? "Identifier Agent"
              : "Hardcoded fallback"
          }`,
        );
        log(
          `[Batch ${batchId}] Location params: city=${identifiedMeta.city}, state=${identifiedMeta.state}, county=${identifiedMeta.county}, postalCode=${identifiedMeta.postalCode}`,
        );

        await db("practice_rankings")
          .where({ id: rankingId })
          .update({
            specialty: specialty,
            location: marketLocation,
            rank_keywords: keywordsString,
            // Store location params for debugging
            search_city: identifiedMeta.city || null,
            search_state: identifiedMeta.state || null,
            search_county: identifiedMeta.county || null,
            search_postal_code: identifiedMeta.postalCode || null,
            updated_at: new Date(),
          });

        log(
          `[Batch ${batchId}] ✓ Identified: ${specialty} in ${marketLocation} (keywords: ${keywordsString})`,
        );
      }
    } catch (identifyError: any) {
      log(
        `[Batch ${batchId}] ⚠ Failed to auto-detect: ${identifyError.message}. Using defaults.`,
      );
      specialty = specialty || "dentist";
      marketLocation = marketLocation || "Unknown, US";

      await db("practice_rankings").where({ id: rankingId }).update({
        specialty: specialty,
        location: marketLocation,
        updated_at: new Date(),
      });
    }
  } else {
    // If specialty/location were provided, still get and store keywords
    const specialtyKeywords = getSpecialtyKeywords(specialty);
    const keywordsString = specialtyKeywords.join(", ");
    await db("practice_rankings").where({ id: rankingId }).update({
      rank_keywords: keywordsString,
      updated_at: new Date(),
    });
  }

  return {
    specialty: specialty!,
    marketLocation: marketLocation!,
    locationParams,
  };
}
