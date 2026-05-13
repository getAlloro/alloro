/**
 * Practice Ranking Response Formatters
 *
 * Pure formatting functions that transform DB records into
 * the exact response shapes the frontend expects.
 * No database calls, no side effects.
 */

import { parseJsonField } from "./util.json-parser";

type SearchResultEntry = {
  placeId?: string;
  name?: string;
  position?: number;
  rating?: number;
  reviewCount?: number;
  primaryType?: string;
  types?: string[];
  isClient?: boolean;
};

type CompetitorSnapshotEntry = {
  placeId?: string;
  name?: string;
  address?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  lat?: number | null;
  lng?: number | null;
  discoveryPosition?: number | null;
  discoveryQuery?: string | null;
  discoverySource?: string | null;
  discoveryCheckedAt?: string | null;
  profileStrengthScore?: number | null;
  profileStrengthTier?: string | null;
};

type CompetitorSnapshot = {
  competitors?: CompetitorSnapshotEntry[];
};

function haversineMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

function buildSelectedCompetitorSearchResults(ranking: any) {
  const searchResults = parseJsonField(ranking.search_results);
  const competitorSnapshot = parseJsonField(
    ranking.competitor_snapshot,
  ) as CompetitorSnapshot | null;
  const selected = Array.isArray(competitorSnapshot?.competitors)
    ? competitorSnapshot.competitors
    : [];

  if (selected.length === 0) return null;

  const searchByPlaceId = new Map<string, SearchResultEntry>();
  if (Array.isArray(searchResults)) {
    for (const result of searchResults as SearchResultEntry[]) {
      if (typeof result?.placeId === "string") {
        searchByPlaceId.set(result.placeId, result);
      }
    }
  }

  const searchFailed =
    ranking.search_status === "api_error" ||
    ranking.search_status === "bias_unavailable" ||
    !Array.isArray(searchResults);
  const searchLat =
    ranking.search_lat === null || ranking.search_lat === undefined
      ? null
      : Number(ranking.search_lat);
  const searchLng =
    ranking.search_lng === null || ranking.search_lng === undefined
      ? null
      : Number(ranking.search_lng);

  const mapped = selected.map((competitor, index) => {
    const match =
      typeof competitor.placeId === "string"
        ? searchByPlaceId.get(competitor.placeId)
        : undefined;
    const measuredPosition =
      typeof match?.position === "number" && Number.isFinite(match.position)
        ? match.position
        : null;
    const competitorLat =
      competitor.lat === null || competitor.lat === undefined
        ? null
        : Number(competitor.lat);
    const competitorLng =
      competitor.lng === null || competitor.lng === undefined
        ? null
        : Number(competitor.lng);
    const distanceMiles =
      searchLat !== null &&
      searchLng !== null &&
      competitorLat !== null &&
      competitorLng !== null
        ? haversineMiles(
            { lat: searchLat, lng: searchLng },
            { lat: competitorLat, lng: competitorLng },
          )
        : null;

    return {
      placeId: competitor.placeId ?? null,
      name: match?.name ?? competitor.name ?? "Selected competitor",
      position: measuredPosition,
      status: measuredPosition
        ? "measured"
        : searchFailed
          ? "not_measured"
          : "not_in_top_20",
      rating:
        typeof match?.rating === "number"
          ? match.rating
          : competitor.rating ?? null,
      reviewCount:
        typeof match?.reviewCount === "number"
          ? match.reviewCount
          : competitor.reviewCount ?? null,
      primaryType: match?.primaryType ?? null,
      address: competitor.address ?? null,
      discoveryPosition: competitor.discoveryPosition ?? null,
      distanceMiles,
      profileStrengthScore: competitor.profileStrengthScore ?? null,
      profileStrengthTier: competitor.profileStrengthTier ?? null,
      selectedOrder: index + 1,
    };
  });

  return mapped.sort((a, b) => {
    if (a.position !== null && b.position !== null) {
      return a.position - b.position;
    }
    if (a.position !== null) return -1;
    if (b.position !== null) return 1;
    return a.selectedOrder - b.selectedOrder;
  });
}

// =====================================================================
// TRIGGER RESPONSE
// =====================================================================

interface LocationInput {
  gbpLocationId: string;
  gbpLocationName: string;
  specialty?: string;
  marketLocation?: string;
}

export function formatTriggerResponse(
  batchId: string,
  locations: LocationInput[],
  rankingIds: number[],
) {
  return {
    success: true,
    message: `Batch ranking analysis started for ${locations.length} locations`,
    batchId: batchId,
    totalLocations: locations.length,
    rankingIds: rankingIds,
    locations: locations.map((l) => ({
      gbpLocationId: l.gbpLocationId,
      gbpLocationName: l.gbpLocationName,
      specialty: l.specialty || "auto-detecting...",
      marketLocation: l.marketLocation || "auto-detecting...",
    })),
  };
}

export function formatLegacyTriggerResponse(batchId: string) {
  return {
    success: true,
    message: "Ranking analysis started",
    batchId: batchId,
    totalLocations: 1,
  };
}

// =====================================================================
// BATCH STATUS RESPONSE
// =====================================================================

export function formatInMemoryBatchStatus(inMemoryStatus: any) {
  return {
    success: true,
    batchId: inMemoryStatus.batchId,
    status: inMemoryStatus.status,
    totalLocations: inMemoryStatus.totalLocations,
    completedLocations: inMemoryStatus.completedLocations,
    failedLocations: inMemoryStatus.failedLocations,
    currentLocationIndex: inMemoryStatus.currentLocationIndex,
    currentLocationName: inMemoryStatus.currentLocationName,
    rankingIds: inMemoryStatus.rankingIds,
    errors: inMemoryStatus.errors,
    startedAt: inMemoryStatus.startedAt,
    completedAt: inMemoryStatus.completedAt,
    progress: Math.round(
      (inMemoryStatus.completedLocations / inMemoryStatus.totalLocations) *
        100,
    ),
  };
}

export function formatDbBatchStatus(batchId: string, rankings: any[]) {
  const completed = rankings.filter((r) => r.status === "completed").length;
  const failed = rankings.filter((r) => r.status === "failed").length;
  const pending = rankings.filter(
    (r) => r.status === "pending" || r.status === "processing",
  ).length;

  let batchStatus: "processing" | "completed" | "failed" = "processing";
  if (failed > 0) {
    batchStatus = "failed";
  } else if (pending === 0) {
    batchStatus = "completed";
  }

  return {
    success: true,
    batchId: batchId,
    status: batchStatus,
    totalLocations: rankings.length,
    completedLocations: completed,
    failedLocations: failed,
    pendingLocations: pending,
    rankings: rankings.map((r) => ({
      id: r.id,
      gbpLocationId: r.gbp_location_id,
      gbpLocationName: r.gbp_location_name,
      status: r.status,
      statusDetail: parseJsonField(r.status_detail),
      rankScore: r.rank_score,
      rankPosition: r.rank_position,
      errorMessage: r.error_message,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    progress: Math.round((completed / rankings.length) * 100),
  };
}

// =====================================================================
// RANKING STATUS RESPONSE
// =====================================================================

export function formatRankingStatus(ranking: any) {
  const statusDetail = parseJsonField(ranking.status_detail);

  return {
    success: true,
    rankingId: ranking.id,
    status: ranking.status,
    statusDetail: statusDetail,
    rankScore: ranking.rank_score,
    rankPosition: ranking.rank_position,
    totalCompetitors: ranking.total_competitors,
    gbpLocationId: ranking.gbp_location_id,
    gbpLocationName: ranking.gbp_location_name,
    batchId: ranking.batch_id,
    createdAt: ranking.created_at,
    updatedAt: ranking.updated_at,
  };
}

// =====================================================================
// FULL RESULTS RESPONSE
// =====================================================================

export function formatFullResults(ranking: any) {
  return {
    success: true,
    ranking: {
      id: ranking.id,
      organizationId: ranking.organization_id,
      specialty: ranking.specialty,
      location: ranking.location,
      rankKeywords: ranking.rank_keywords,
      gbpAccountId: ranking.gbp_account_id,
      gbpLocationId: ranking.gbp_location_id,
      gbpLocationName: ranking.gbp_location_name,
      batchId: ranking.batch_id,
      observedAt: ranking.observed_at,
      status: ranking.status,
      rankScore: ranking.rank_score,
      rankPosition: ranking.rank_position,
      totalCompetitors: ranking.total_competitors,
      competitorSetRevision: ranking.competitor_set_revision ?? null,
      competitorSnapshot: parseJsonField(ranking.competitor_snapshot),
      competitorDiscoveryRadiusMeters:
        ranking.competitor_discovery_radius_meters ?? null,
      selectedCompetitorSearchResults:
        buildSelectedCompetitorSearchResults(ranking),
      runReason: ranking.run_reason ?? null,
      includeInSummaryRecommendations:
        ranking.include_in_summary_recommendations ?? true,
      rankingFactors: parseJsonField(ranking.ranking_factors),
      rawData: parseJsonField(ranking.raw_data),
      llmAnalysis: parseJsonField(ranking.llm_analysis),
      statusDetail: parseJsonField(ranking.status_detail),
      errorMessage: ranking.error_message,
      // Location params used for Apify search (for debugging)
      searchParams: {
        city: ranking.search_city,
        state: ranking.search_state,
        county: ranking.search_county,
        postalCode: ranking.search_postal_code,
      },
      createdAt: ranking.created_at,
      updatedAt: ranking.updated_at,
    },
  };
}

// =====================================================================
// LIST RESPONSE
// =====================================================================

export function formatRankingsList(rankings: any[]) {
  return {
    success: true,
    count: rankings.length,
    rankings: rankings.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      specialty: r.specialty,
      location: r.location,
      rankKeywords: r.rank_keywords,
      gbpLocationId: r.gbp_location_id,
      gbpLocationName: r.gbp_location_name,
      batchId: r.batch_id,
      status: r.status,
      rankScore: r.rank_score,
      rankPosition: r.rank_position,
      totalCompetitors: r.total_competitors,
      searchParams: {
        city: r.search_city,
        state: r.search_state,
        county: r.search_county,
        postalCode: r.search_postal_code,
      },
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  };
}

// =====================================================================
// ACCOUNTS RESPONSE
// =====================================================================

export function formatAccountsList(accounts: any[]) {
  return {
    success: true,
    accounts: accounts,
  };
}

// =====================================================================
// LATEST RANKINGS RESPONSE
// =====================================================================

export interface LatestRankingOnboardingMeta {
  status: "pending" | "curating" | "finalized";
  finalizedAt: Date | string | null;
}

export function formatLatestRanking(
  ranking: any,
  previous: any | null,
  onboardingMeta: LatestRankingOnboardingMeta | null = null
) {
  // Coerce decimal columns (search_lat, search_lng) — Postgres returns DECIMAL
  // as a string in some pg driver versions; cast to number for the frontend.
  const toNumberOrNull = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v);

  return {
    id: ranking.id,
    organizationId: ranking.organization_id,
    locationId: ranking.location_id ?? null,
    specialty: ranking.specialty,
    location: ranking.location,
    gbpAccountId: ranking.gbp_account_id,
    gbpLocationId: ranking.gbp_location_id,
    gbpLocationName: ranking.gbp_location_name,
    batchId: ranking.batch_id,
    observedAt: ranking.observed_at,
    status: ranking.status,
    rankScore: ranking.rank_score,
    rankPosition: ranking.rank_position,
    totalCompetitors: ranking.total_competitors,
    // v2: source of the competitor list used for Practice Health scoring.
    // 'curated' = user-curated v2 list, 'discovered_v2_pending' = post-v2
    // location that hasn't finalized yet, 'discovered_v1_legacy' = pre-v2 row.
    // Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
    competitorSource: ranking.competitor_source ?? null,
    // v2 onboarding status for this location (per-location, not per-org).
    locationOnboarding: onboardingMeta,
    // Practice Health aliases — same data, new label for the client UI.
    // The legacy rankScore/rankPosition fields stay above for backward compatibility.
    practiceHealth: ranking.rank_score,
    practiceHealthRank: ranking.rank_position,
    // Search Position fields (Practice Health + Search Position split).
    // Spec: plans/04122026-no-ticket-practice-health-search-position-split/spec.md
    searchPosition: ranking.search_position,
    searchQuery: ranking.search_query,
    searchStatus: ranking.search_status,
    searchResults: parseJsonField(ranking.search_results),
    selectedCompetitorSearchResults:
      buildSelectedCompetitorSearchResults(ranking),
    searchLat: toNumberOrNull(ranking.search_lat),
    searchLng: toNumberOrNull(ranking.search_lng),
    searchRadiusMeters: ranking.search_radius_meters,
    competitorDiscoveryRadiusMeters:
      ranking.competitor_discovery_radius_meters ?? null,
    searchCheckedAt: ranking.search_checked_at,
    // Source of `searchPosition` (apify_maps | places_text | null). Used by the
    // frontend to suppress the position trend arrow across the cutover.
    // Spec: plans/04282026-no-ticket-live-google-rank-apify-maps-swap/spec.md (T3)
    searchPositionSource: ranking.search_position_source ?? null,
    competitorSetRevision: ranking.competitor_set_revision ?? null,
    competitorSnapshot: parseJsonField(ranking.competitor_snapshot),
    runReason: ranking.run_reason ?? null,
    includeInSummaryRecommendations:
      ranking.include_in_summary_recommendations ?? true,
    rankingFactors: parseJsonField(ranking.ranking_factors),
    rawData: parseJsonField(ranking.raw_data),
    llmAnalysis: parseJsonField(ranking.llm_analysis),
    statusDetail: parseJsonField(ranking.status_detail),
    errorMessage: ranking.error_message,
    createdAt: ranking.created_at,
    updatedAt: ranking.updated_at,
    // Include previous ranking data for trend comparison (from any previous batch).
    // The query/lat/lng fields let the frontend decide whether the comparison is
    // valid (Revision 1, Gap A: stability check).
    previousAnalysis: previous
      ? {
          id: previous.id,
          observedAt: previous.observed_at,
          rankScore: previous.rank_score,
          rankPosition: previous.rank_position,
          totalCompetitors: previous.total_competitors,
          rawData: parseJsonField(previous.raw_data),
        }
      : null,
    previousSearchPosition: previous?.search_position ?? null,
    previousSearchQuery: previous?.search_query ?? null,
    previousSearchLat: toNumberOrNull(previous?.search_lat),
    previousSearchLng: toNumberOrNull(previous?.search_lng),
    previousSearchPositionSource: previous?.search_position_source ?? null,
    previousObservedAt: previous?.observed_at ?? null,
  };
}

export function formatLegacyLatestRanking(ranking: any) {
  return {
    id: ranking.id,
    organizationId: ranking.organization_id,
    specialty: ranking.specialty,
    location: ranking.location,
    gbpAccountId: null,
    gbpLocationId: null,
    gbpLocationName: null,
    batchId: null,
    observedAt: ranking.observed_at,
    status: ranking.status,
    rankScore: ranking.rank_score,
    rankPosition: ranking.rank_position,
    totalCompetitors: ranking.total_competitors,
    rankingFactors: parseJsonField(ranking.ranking_factors),
    rawData: parseJsonField(ranking.raw_data),
    llmAnalysis: parseJsonField(ranking.llm_analysis),
    statusDetail: parseJsonField(ranking.status_detail),
    errorMessage: ranking.error_message,
    createdAt: ranking.created_at,
    updatedAt: ranking.updated_at,
    previousAnalysis: null,
  };
}

// =====================================================================
// TASKS RESPONSE
// =====================================================================

export function formatTask(task: any) {
  let metadata = null;
  try {
    metadata =
      typeof task.metadata === "string"
        ? JSON.parse(task.metadata)
        : task.metadata;
  } catch (e) {
    // Ignore JSON parse errors
  }

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    category: task.category,
    agentType: task.agent_type,
    isApproved: task.is_approved,
    dueDate: task.due_date,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    completedAt: task.completed_at,
    metadata: {
      practiceRankingId: metadata?.practice_ranking_id || null,
      gbpLocationId: metadata?.gbp_location_id || null,
      gbpLocationName: metadata?.gbp_location_name || null,
      priority: metadata?.priority || null,
      impact: metadata?.impact || null,
      effort: metadata?.effort || null,
      timeline: metadata?.timeline || null,
    },
  };
}

export function formatTasksList(tasks: any[]) {
  const formattedTasks = tasks.map(formatTask);
  return {
    success: true,
    tasks: formattedTasks,
    total: formattedTasks.length,
  };
}
