import { z } from "zod";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { runAgent } from "../../../agents/service.llm-runner";
import type { MarketKeywordUpsert } from "../../../models/MarketKeywordModel";
import logger from "../../../lib/logger";
import type { BusinessContext, BusinessLocationContext } from "./BusinessContextBuilder";
import {
  dedupeKeywords,
  defaultCluster,
  inferIntent,
  limitKeywordCandidates,
  MARKET_KEYWORD_LIMIT_PER_LOCATION,
  splitKeywordText,
  type KeywordCandidate,
} from "../feature-utils/keywordNormalization";

const AgentKeywordSchema = z.object({
  keyword: z.string().min(1),
  intent: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const AgentClusterSchema = z.object({
  name: z.string().min(1),
  keywords: z.array(AgentKeywordSchema),
});

const MarketIntelligenceAgentSchema = z.object({
  clusters: z.array(AgentClusterSchema),
});

const AGENT_EXISTING_KEYWORD_LIMIT = 120;
const AGENT_GSC_QUERY_LIMIT = 150;
const AGENT_OUTPUT_KEYWORD_LIMIT = 220;
const AGENT_MAX_TOKENS = 12_000;

export interface GenerateMarketKeywordsOptions {
  skipAgent?: boolean;
  maxKeywords?: number;
}

function seedCandidates(location: BusinessLocationContext): KeywordCandidate[] {
  return location.rankKeywords.map((keyword) => ({
    keyword,
    cluster: defaultCluster(keyword, location.specialty),
    intent: inferIntent(keyword),
    confidence: 0.7,
    source: "identifier_seed",
    metadata: { reason: "latest_rank_keywords" },
  }));
}

function businessContextForAgent(
  context: BusinessContext,
  location: BusinessLocationContext,
  outputKeywordLimit: number,
): Record<string, unknown> {
  const approvedExistingKeywords = location.existingMarketKeywords
    .filter((keyword) => keyword.status === "approved")
    .slice(0, AGENT_EXISTING_KEYWORD_LIMIT);

  return {
    organizationId: context.organizationId,
    businessName: context.businessName,
    industry: context.industry,
    website: context.website,
    language: context.language,
    outputKeywordLimit,
    location: {
      locationId: location.locationId,
      locationName: location.locationName,
      specialty: location.specialty,
      marketLocation: location.marketLocation,
      city: location.city,
      state: location.state,
      county: location.county,
      postalCode: location.postalCode,
      gbpProfile: location.gbpProfile,
      existingMarketKeywords: approvedExistingKeywords.map((keyword) => ({
        keyword: keyword.keyword,
        cluster: keyword.cluster,
        intent: keyword.intent,
        source: keyword.source,
        status: keyword.status,
        confidence: keyword.confidence,
      })),
      existingRankKeywords: location.rankKeywords,
    },
    recentGscQueries: context.recentGscQueries.slice(0, AGENT_GSC_QUERY_LIMIT).map((query) => ({
      query: query.query,
      impressions: query.impressions,
      clicks: query.clicks,
    })),
    missing: [...context.missing, ...location.missing],
  };
}

async function agentCandidates(
  context: BusinessContext,
  location: BusinessLocationContext,
  outputKeywordLimit: number,
): Promise<KeywordCandidate[]> {
  const prompt = loadPrompt("marketIntelligence/MarketIntelligenceAgent");
  const result = await runAgent({
    systemPrompt: prompt,
    userMessage: JSON.stringify(businessContextForAgent(context, location, outputKeywordLimit)),
    maxTokens: AGENT_MAX_TOKENS,
    temperature: 0,
    outputSchema: MarketIntelligenceAgentSchema,
    costContext: {
      projectId: context.projectId,
      eventType: "market-intelligence-keyword-generation",
      metadata: {
        organizationId: context.organizationId,
        locationId: location.locationId,
      },
    },
  });

  const parsed = MarketIntelligenceAgentSchema.safeParse(result.parsed);
  if (!parsed.success) {
    throw new Error(`MarketIntelligenceAgent returned invalid JSON: ${parsed.error.message}`);
  }

  return parsed.data.clusters.flatMap((cluster) =>
    cluster.keywords.map((keyword) => ({
      keyword: keyword.keyword,
      cluster: cluster.name,
      intent: keyword.intent ?? inferIntent(keyword.keyword),
      confidence: keyword.confidence ?? 0.85,
      source: "market_intelligence_agent" as const,
      metadata: { cluster: cluster.name },
    })),
  );
}

export async function generateMarketKeywordsForLocation(
  context: BusinessContext,
  location: BusinessLocationContext,
  options: GenerateMarketKeywordsOptions = {},
): Promise<MarketKeywordUpsert[]> {
  const candidates: KeywordCandidate[] = [...seedCandidates(location)];
  if (!options.skipAgent) {
    try {
      const outputKeywordLimit = Math.min(
        options.maxKeywords ?? MARKET_KEYWORD_LIMIT_PER_LOCATION,
        AGENT_OUTPUT_KEYWORD_LIMIT,
      );
      candidates.push(...await agentCandidates(context, location, outputKeywordLimit));
    } catch (err) {
      logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          organizationId: context.organizationId,
          locationId: location.locationId,
        },
        "[market-intelligence] agent keyword generation failed; using seed keywords",
      );
    }
  }

  const serviceCandidates = splitKeywordText(location.specialty).map((keyword) => ({
    keyword,
    cluster: defaultCluster(keyword, location.specialty),
    intent: inferIntent(keyword),
    confidence: 0.65,
    source: "service_taxonomy" as const,
    metadata: { reason: "specialty_seed" },
  }));

  const deduped = limitKeywordCandidates(
    dedupeKeywords([...candidates, ...serviceCandidates]),
    options.maxKeywords,
  );

  return deduped.map((candidate) => ({
    organizationId: context.organizationId,
    locationId: location.locationId,
    specialty: location.specialty,
    keyword: candidate.keyword,
    normalizedKeyword: candidate.normalizedKeyword,
    canonicalKeyword: candidate.canonicalKeyword,
    cluster: candidate.cluster ?? defaultCluster(candidate.keyword, location.specialty),
    intent: candidate.intent ?? inferIntent(candidate.keyword),
    source: candidate.source,
    status: "approved",
    confidence: candidate.confidence ?? 0.8,
    languageCode: context.language,
    locationName: location.dataForSeoLocationName,
    metadata: candidate.metadata ?? {},
  }));
}
