import { MarketKeywordModel, type MarketKeywordUpsert } from "../../../models/MarketKeywordModel";
import logger from "../../../lib/logger";
import {
  type BusinessContext,
  type BusinessLocationContext,
  buildBusinessContext,
} from "./BusinessContextBuilder";
import {
  canonicalizeKeyword,
  defaultCluster,
  inferIntent,
  isMeaningfulSearchQuery,
  normalizeKeyword,
} from "../feature-utils/keywordNormalization";
import type { GscQueryEvidence } from "../feature-utils/gscQueryExtraction";

export interface GscMarketKeywordEnrichmentOptions {
  gscLookbackDays?: number;
}

export interface GscMarketKeywordEnrichmentResult {
  organizationId: number;
  queriesRead: number;
  keywordsCreated: number;
  keywordsRefreshed: number;
  skippedQueries: number;
}

function includesLocationSignal(query: string, location: BusinessLocationContext): boolean {
  const candidates = [
    location.locationName,
    location.city,
    location.state,
    location.county,
    location.postalCode,
  ].filter((value): value is string => Boolean(value));
  const normalizedQuery = normalizeKeyword(query);
  return candidates.some((candidate) => normalizedQuery.includes(normalizeKeyword(candidate)));
}

function assignQueryToLocation(
  query: GscQueryEvidence,
  context: BusinessContext,
): BusinessLocationContext | null {
  const directMatch = context.locations.find((location) =>
    includesLocationSignal(query.query, location),
  );
  if (directMatch) return directMatch;
  return context.locations.find((location) => location.isPrimary)
    ?? context.locations[0]
    ?? null;
}

function toKeywordUpsert(
  context: BusinessContext,
  location: BusinessLocationContext,
  query: GscQueryEvidence,
): MarketKeywordUpsert {
  const normalizedKeyword = normalizeKeyword(query.query);
  return {
    organizationId: context.organizationId,
    locationId: location.locationId,
    specialty: location.specialty,
    keyword: query.query,
    normalizedKeyword,
    canonicalKeyword: canonicalizeKeyword(query.query),
    cluster: defaultCluster(query.query, location.specialty),
    intent: inferIntent(query.query),
    source: "gsc_query",
    status: "candidate",
    confidence: 0.75,
    languageCode: context.language,
    locationName: location.dataForSeoLocationName,
    lastSeenAt: query.lastSeenAt,
    metadata: {
      impressions: query.impressions,
      clicks: query.clicks,
      source: "gsc_queries",
    },
  };
}

export async function enrichMarketKeywordsFromGsc(
  organizationId: number,
  options: GscMarketKeywordEnrichmentOptions = {},
): Promise<GscMarketKeywordEnrichmentResult> {
  const context = await buildBusinessContext(organizationId, {
    gscLookbackDays: options.gscLookbackDays ?? 90,
    fetchFreshGbp: false,
  });
  const existingByLocation = new Map<number, Set<string>>();
  for (const location of context.locations) {
    existingByLocation.set(
      location.locationId,
      new Set(location.existingMarketKeywords.map((keyword) => keyword.normalized_keyword)),
    );
  }

  let keywordsCreated = 0;
  let keywordsRefreshed = 0;
  let skippedQueries = 0;
  for (const query of context.recentGscQueries) {
    if (!isMeaningfulSearchQuery(query.query)) {
      skippedQueries += 1;
      continue;
    }
    const location = assignQueryToLocation(query, context);
    if (!location) {
      skippedQueries += 1;
      continue;
    }
    const normalizedKeyword = normalizeKeyword(query.query);
    const existing = existingByLocation.get(location.locationId) ?? new Set<string>();
    if (existing.has(normalizedKeyword)) {
      await MarketKeywordModel.markLastSeen(
        context.organizationId,
        location.locationId,
        normalizedKeyword,
        new Date(),
      );
      keywordsRefreshed += 1;
      continue;
    }

    await MarketKeywordModel.upsert(toKeywordUpsert(context, location, query));
    existing.add(normalizedKeyword);
    existingByLocation.set(location.locationId, existing);
    keywordsCreated += 1;
  }

  logger.info(
    {
      organizationId,
      queriesRead: context.recentGscQueries.length,
      keywordsCreated,
      keywordsRefreshed,
      skippedQueries,
    },
    "[market-intelligence] enriched keywords from GSC",
  );

  return {
    organizationId,
    queriesRead: context.recentGscQueries.length,
    keywordsCreated,
    keywordsRefreshed,
    skippedQueries,
  };
}
