import { getValidOAuth2ClientByConnection } from "../../../auth/oauth2Helper";
import { getLocationProfileForRanking } from "../../gbp/gbp-services/location-handler.service";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { LocationModel, type ILocation } from "../../../models/LocationModel";
import { MarketKeywordModel, type IMarketKeyword } from "../../../models/MarketKeywordModel";
import { OrganizationModel, type IOrganization } from "../../../models/OrganizationModel";
import {
  PracticeRankingMarketContextModel,
  type MarketRankingContext,
} from "../../../models/PracticeRankingMarketContextModel";
import { ProjectModel, type IProject } from "../../../models/website-builder/ProjectModel";
import { GscDataModel } from "../../../models/website-builder/GscDataModel";
import { buildLocationNameCandidates } from "../../../services/integrations/search-volume/searchVolumeKeywords";
import logger from "../../../lib/logger";
import { extractGscQueries, type GscQueryEvidence } from "../feature-utils/gscQueryExtraction";
import { resolveMarketGeo } from "../feature-utils/locationSignals";

export interface BusinessLocationContext {
  locationId: number;
  locationName: string;
  domain: string | null;
  isPrimary: boolean;
  specialty: string | null;
  marketLocation: string | null;
  rankKeywords: string[];
  city: string | null;
  state: string | null;
  county: string | null;
  postalCode: string | null;
  dataForSeoLocationName: string | null;
  gbpAccountId: string | null;
  gbpLocationId: string | null;
  gbpLocationName: string | null;
  gbpProfile: Record<string, unknown> | null;
  existingMarketKeywords: IMarketKeyword[];
  missing: string[];
}

export interface BusinessContext {
  organizationId: number;
  businessName: string;
  industry: string | null;
  domain: string | null;
  website: string | null;
  projectId: string | null;
  language: "en";
  locations: BusinessLocationContext[];
  recentGscQueries: GscQueryEvidence[];
  missing: string[];
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().split("T")[0];
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function splitRankKeywords(value: string | null): string[] {
  if (!value) return [];
  return value.split(/[,\n]/).map((keyword) => keyword.trim()).filter(Boolean);
}

function firstLocationName(city: string | null, state: string | null): string | null {
  return buildLocationNameCandidates(city, state)[0] ?? null;
}

function projectWebsite(project: IProject | undefined, organization: IOrganization): string | null {
  return project?.custom_domain
    ?? project?.selected_website_url
    ?? project?.generated_hostname
    ?? organization.domain
    ?? null;
}

function rankingByLocation(
  rankings: MarketRankingContext[],
): Map<number, MarketRankingContext> {
  return new Map(rankings.map((ranking) => [Number(ranking.location_id), ranking]));
}

async function fetchFreshGbpProfile(
  connectionId: number | null,
  ranking: MarketRankingContext | undefined,
): Promise<{ profile: Record<string, unknown> | null; missing: string[] }> {
  if (!connectionId) return { profile: null, missing: ["gbp_connection_missing"] };
  if (!ranking?.gbp_account_id || !ranking.gbp_location_id) {
    return { profile: null, missing: ["gbp_location_mapping_missing"] };
  }

  try {
    const auth = await getValidOAuth2ClientByConnection(connectionId);
    const profile = await getLocationProfileForRanking(
      auth,
      ranking.gbp_account_id,
      ranking.gbp_location_id,
    );
    if (!profile || typeof profile !== "object") {
      return { profile: null, missing: ["gbp_profile_unavailable"] };
    }
    return { profile: profile as Record<string, unknown>, missing: [] };
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        locationId: ranking.location_id,
      },
      "[market-intelligence] fresh GBP profile fetch failed",
    );
    return { profile: null, missing: ["gbp_profile_fetch_failed"] };
  }
}

async function readRecentGscQueries(projectId: string | null, days: number): Promise<GscQueryEvidence[]> {
  if (!projectId) return [];
  const rows = await GscDataModel.findByProjectAndDateRange(projectId, daysAgoIso(days), todayIso());
  return extractGscQueries(rows.map((row) => ({
    report_date: row.report_date,
    data: row.data,
  })));
}

export async function buildBusinessContext(
  organizationId: number,
  options: { gscLookbackDays?: number; fetchFreshGbp?: boolean } = {},
): Promise<BusinessContext> {
  const organization = await OrganizationModel.findById(organizationId);
  if (!organization) {
    throw new Error(`Organization ${organizationId} not found`);
  }

  const [locations, project, rankings, googleConnection] = await Promise.all([
    LocationModel.findByOrganizationId(organizationId),
    ProjectModel.findByOrganizationId(organizationId),
    PracticeRankingMarketContextModel.findLatestByOrganization(organizationId),
    GoogleConnectionModel.findOneByOrganization(organizationId),
  ]);

  const rankingMap = rankingByLocation(rankings);
  const recentGscQueries = await readRecentGscQueries(
    project?.id ?? null,
    options.gscLookbackDays ?? 90,
  );
  const missing: string[] = [];
  if (!project) missing.push("website_project_missing");
  if (!googleConnection) missing.push("gbp_connection_missing");
  if (recentGscQueries.length === 0) missing.push("gsc_queries_missing");

  const locationContexts: BusinessLocationContext[] = [];
  for (const location of locations) {
    const ranking = rankingMap.get(location.id);
    const existingMarketKeywords = await MarketKeywordModel.findByLocation(
      organizationId,
      location.id,
    );
    const gbpResult = options.fetchFreshGbp === false
      ? { profile: null, missing: ["fresh_gbp_disabled"] }
      : await fetchFreshGbpProfile(googleConnection?.id ?? null, ranking);

    locationContexts.push(buildLocationContext(
      location,
      ranking,
      existingMarketKeywords,
      gbpResult.profile,
      gbpResult.missing,
    ));
  }

  return {
    organizationId,
    businessName: organization.name,
    industry: organization.organization_type,
    domain: organization.domain,
    website: projectWebsite(project, organization),
    projectId: project?.id ?? null,
    language: "en",
    locations: locationContexts,
    recentGscQueries,
    missing,
  };
}

function buildLocationContext(
  location: ILocation,
  ranking: MarketRankingContext | undefined,
  existingMarketKeywords: IMarketKeyword[],
  gbpProfile: Record<string, unknown> | null,
  missing: string[],
): BusinessLocationContext {
  const geo = resolveMarketGeo(
    ranking?.search_city ?? null,
    ranking?.search_state ?? null,
    ranking?.market_location ?? null,
  );
  return {
    locationId: location.id,
    locationName: location.name,
    domain: location.domain,
    isPrimary: location.is_primary,
    specialty: ranking?.specialty ?? null,
    marketLocation: ranking?.market_location ?? null,
    rankKeywords: splitRankKeywords(ranking?.rank_keywords ?? null),
    city: geo.city,
    state: geo.state,
    county: ranking?.search_county ?? null,
    postalCode: ranking?.search_postal_code ?? null,
    dataForSeoLocationName: firstLocationName(geo.city, geo.state),
    gbpAccountId: ranking?.gbp_account_id ?? null,
    gbpLocationId: ranking?.gbp_location_id ?? null,
    gbpLocationName: ranking?.gbp_location_name ?? null,
    gbpProfile,
    existingMarketKeywords,
    missing,
  };
}
