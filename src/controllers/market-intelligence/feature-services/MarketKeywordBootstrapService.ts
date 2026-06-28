import { MarketKeywordModel } from "../../../models/MarketKeywordModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import logger from "../../../lib/logger";
import { buildBusinessContext } from "./BusinessContextBuilder";
import { generateMarketKeywordsForLocation } from "./MarketKeywordGenerationService";

export interface MarketKeywordBootstrapOptions {
  gscLookbackDays?: number;
  fetchFreshGbp?: boolean;
  skipAgent?: boolean;
  maxKeywordsPerLocation?: number;
}

export interface MarketKeywordBootstrapResult {
  organizationId: number;
  locationsProcessed: number;
  keywordsUpserted: number;
  gscKeywordsDemoted: number;
  errors: string[];
}

export async function bootstrapMarketKeywordsForOrganization(
  organizationId: number,
  options: MarketKeywordBootstrapOptions = {},
): Promise<MarketKeywordBootstrapResult> {
  const errors: string[] = [];
  const gscKeywordsDemoted = await MarketKeywordModel.demoteApprovedGscKeywordsToCandidates(
    organizationId,
  );
  const context = await buildBusinessContext(organizationId, {
    gscLookbackDays: options.gscLookbackDays,
    fetchFreshGbp: options.fetchFreshGbp,
  });

  let keywordsUpserted = 0;
  for (const location of context.locations) {
    try {
      const rows = await generateMarketKeywordsForLocation(context, location, {
        skipAgent: options.skipAgent,
        maxKeywords: options.maxKeywordsPerLocation,
      });
      await MarketKeywordModel.transaction(async (trx) => {
        await MarketKeywordModel.archiveApprovedKeywordsNotInSet(
          organizationId,
          location.locationId,
          rows.map((row) => row.normalizedKeyword),
          trx,
        );
        await MarketKeywordModel.upsertMany(rows, trx);
      });
      keywordsUpserted += rows.length;
      logger.info(
        {
          organizationId,
          locationId: location.locationId,
          keywords: rows.length,
        },
        "[market-intelligence] bootstrapped location keywords",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`location ${location.locationId}: ${message}`);
      logger.warn(
        { err: message, organizationId, locationId: location.locationId },
        "[market-intelligence] location keyword bootstrap failed",
      );
    }
  }

  return {
    organizationId,
    locationsProcessed: context.locations.length,
    keywordsUpserted,
    gscKeywordsDemoted,
    errors,
  };
}

export async function bootstrapMarketKeywordsForAllOrganizations(
  options: MarketKeywordBootstrapOptions = {},
): Promise<MarketKeywordBootstrapResult[]> {
  const organizations = await OrganizationModel.listAll({ view: "active" });
  const results: MarketKeywordBootstrapResult[] = [];
  for (const organization of organizations) {
    results.push(await bootstrapMarketKeywordsForOrganization(organization.id, options));
  }
  return results;
}
