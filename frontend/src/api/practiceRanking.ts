import { apiGet, apiPost, apiDelete } from "./index";

/**
 * Practice Ranking v2 — Curated Competitor Lists frontend API
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 */

export type LocationCompetitorOnboardingStatus =
  | "pending"
  | "curating"
  | "finalized";
export type LocationCompetitorSource = "initial_scrape" | "user_added";
export type CompetitorDiscoverySource =
  | "apify_maps"
  | "places_text"
  | "user_added"
  | "unknown";
export type ProfileStrengthTier =
  | "strong"
  | "competitive"
  | "needs_review"
  | "not_measured";

export interface ProfileStrengthFactors {
  rating: number | null;
  reviewCount: number | null;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasCategory: boolean;
  hasCoordinates: boolean;
  hasPhoto: boolean;
}

export interface CuratedCompetitor {
  id: number;
  placeId: string;
  name: string;
  address: string | null;
  primaryType: string | null;
  rating: number | null;
  reviewCount: number | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  photoName: string | null;
  discoveryPosition: number | null;
  discoveryQuery: string | null;
  discoverySource: CompetitorDiscoverySource | null;
  discoveryCheckedAt: string | null;
  discoveryRadiusMeters: number | null;
  profileStrengthScore: number | null;
  profileStrengthTier: ProfileStrengthTier | null;
  profileStrengthFactors: ProfileStrengthFactors | null;
  source: LocationCompetitorSource;
  addedAt: string;
  addedByUserId: number | null;
}

export interface PracticeLocationRef {
  placeId: string;
  lat: number;
  lng: number;
}

export type SelfFilterStatus = "resolved" | "unresolved";

export interface GetLocationCompetitorsResponse {
  success: true;
  onboarding: {
    status: LocationCompetitorOnboardingStatus;
    finalizedAt: string | null;
  };
  practiceLocation: PracticeLocationRef | null;
  selfFilterStatus: SelfFilterStatus;
  competitorDiscoveryRadiusMeters: number;
  comparisonSpecialty: ComparisonSpecialtyRef | null;
  comparisonSpecialtyOptions: ComparisonSpecialtyOption[];
  competitors: CuratedCompetitor[];
  count: number;
  cap: number;
}

export interface ComparisonSpecialtyRef {
  value: string;
  label: string;
  query: string;
  sourceSpecialty: string;
}

export interface ComparisonSpecialtyOption {
  value: string;
  label: string;
  query: string;
}

export interface RunDiscoveryResponse {
  success: true;
  status: "fresh" | "stale_skipped" | "completed";
  competitorCount: number;
  specialty: string | null;
  marketLocation: string | null;
  radiusMeters: number;
  comparisonSpecialty: ComparisonSpecialtyRef | null;
}

export interface CompetitorDiscoverySuggestion {
  placeId: string;
  name: string;
  address: string | null;
  primaryType: string | null;
  rating: number | null;
  reviewCount: number | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  photoName: string | null;
  discoveryPosition: number | null;
  discoveryQuery: string | null;
  discoverySource: CompetitorDiscoverySource | null;
  discoveryCheckedAt: string | null;
  discoveryRadiusMeters: number;
  profileStrengthScore: number | null;
  profileStrengthTier: ProfileStrengthTier | null;
  profileStrengthFactors: ProfileStrengthFactors | null;
}

export interface PreviewCompetitorDiscoveryResponse
  extends RunDiscoveryResponse {
  suggestions: CompetitorDiscoverySuggestion[];
}

export interface PreviewCompetitorPlaceResponse {
  success: true;
  competitor: CompetitorDiscoverySuggestion;
  radiusMeters: number;
  mapsMatched: boolean;
  comparisonSpecialty: ComparisonSpecialtyRef | null;
}

export type SelectedCompetitorSearchStatus =
  | "measured"
  | "not_in_top_20"
  | "not_measured";

export interface SelectedCompetitorSearchResult {
  placeId: string | null;
  name: string;
  position: number | null;
  status: SelectedCompetitorSearchStatus;
  rating: number | null;
  reviewCount: number | null;
  primaryType: string | null;
  discoveryPosition: number | null;
  distanceMiles: number | null;
  profileStrengthScore: number | null;
  profileStrengthTier: ProfileStrengthTier | null;
  selectedOrder: number;
}

export interface AddCompetitorResponse {
  success: true;
  added: CuratedCompetitor;
  activeCount: number;
  cap: number;
}

export interface RemoveCompetitorResponse {
  success: true;
  removed: number;
  activeCount: number;
  cap: number;
}

export interface FinalizeAndRunResponse {
  success: true;
  batchId: string;
  rankingId: number;
  reused: boolean;
  competitorSetRevision: number;
  selectedCount: number;
}

export type ReselectAndRunResponse = FinalizeAndRunResponse;

export type BatchStatus = "processing" | "completed" | "failed";

export interface RankingStatusDetail {
  currentStep?: string;
  message?: string;
  progress?: number;
  stepsCompleted?: string[];
  timestamps?: Record<string, string>;
}

export interface BatchRankingItem {
  id: number;
  gbpLocationId: string;
  gbpLocationName: string | null;
  status: string;
  statusDetail: RankingStatusDetail | null;
  rankScore: number | null;
  rankPosition: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetBatchStatusResponse {
  success: true;
  batchId: string;
  status: BatchStatus;
  totalLocations: number;
  completedLocations: number;
  failedLocations: number;
  pendingLocations?: number;
  rankings: BatchRankingItem[];
  progress: number;
}

const BASE = "/practice-ranking/locations";

export async function getLocationCompetitors(
  locationId: number
): Promise<GetLocationCompetitorsResponse> {
  return apiGet({ path: `${BASE}/${locationId}/competitors` });
}

export async function runCompetitorDiscovery(
  locationId: number,
  radiusMeters?: number,
  comparisonSpecialty?: string | null
): Promise<RunDiscoveryResponse> {
  return apiPost({
    path: `${BASE}/${locationId}/competitors/discover`,
    passedData: {
      ...(radiusMeters ? { radiusMeters } : {}),
      ...(comparisonSpecialty ? { comparisonSpecialty } : {}),
    },
  });
}

export async function previewCompetitorDiscovery(
  locationId: number,
  radiusMeters?: number,
  comparisonSpecialty?: string | null
): Promise<PreviewCompetitorDiscoveryResponse> {
  return apiPost({
    path: `${BASE}/${locationId}/competitors/discover-candidates`,
    passedData: {
      ...(radiusMeters ? { radiusMeters } : {}),
      ...(comparisonSpecialty ? { comparisonSpecialty } : {}),
    },
  });
}

export async function previewCompetitorPlace(
  locationId: number,
  placeId: string,
  radiusMeters?: number,
  comparisonSpecialty?: string | null
): Promise<PreviewCompetitorPlaceResponse> {
  return apiPost({
    path: `${BASE}/${locationId}/competitors/preview-place`,
    passedData: {
      placeId,
      ...(radiusMeters ? { radiusMeters } : {}),
      ...(comparisonSpecialty ? { comparisonSpecialty } : {}),
    },
  });
}

export async function addLocationCompetitor(
  locationId: number,
  placeId: string
): Promise<AddCompetitorResponse> {
  return apiPost({
    path: `${BASE}/${locationId}/competitors`,
    passedData: { placeId },
  });
}

export async function removeLocationCompetitor(
  locationId: number,
  placeId: string
): Promise<RemoveCompetitorResponse> {
  return apiDelete({
    path: `${BASE}/${locationId}/competitors/${encodeURIComponent(placeId)}`,
  });
}

export async function finalizeAndRun(
  locationId: number
): Promise<FinalizeAndRunResponse> {
  return apiPost({
    path: `${BASE}/${locationId}/competitors/finalize-and-run`,
    passedData: {},
  });
}

export async function reselectAndRun(
  locationId: number,
  placeIds: string[],
  radiusMeters?: number
): Promise<ReselectAndRunResponse> {
  return apiPost({
    path: `${BASE}/${locationId}/competitors/reselect-and-run`,
    passedData: radiusMeters ? { placeIds, radiusMeters } : { placeIds },
  });
}

export async function getBatchStatus(
  batchId: string
): Promise<GetBatchStatusResponse> {
  return apiGet({
    path: `/practice-ranking/batch/${encodeURIComponent(batchId)}/status`,
  });
}

export interface InFlightRanking {
  rankingId: number;
  batchId: string;
  status: string;
  statusDetail: RankingStatusDetail | null;
  gbpLocationName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GetInFlightRankingResponse {
  success: true;
  ranking: InFlightRanking | null;
}

export async function getInFlightRanking(
  googleAccountId: number,
  locationId?: number | null
): Promise<GetInFlightRankingResponse> {
  const qs = new URLSearchParams({
    googleAccountId: String(googleAccountId),
  });
  if (locationId) qs.set("locationId", String(locationId));
  return apiGet({ path: `/practice-ranking/in-flight?${qs.toString()}` });
}
