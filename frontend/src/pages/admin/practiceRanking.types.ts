// GBP Location from the API
export interface GbpLocation {
  accountId: string;
  locationId: string;
  displayName: string;
  address?: string;
}

export interface GoogleAccount {
  id: number;
  domain: string;
  practiceName: string;
  hasGbp: boolean;
  gbpLocations: GbpLocation[];
  gbpCount: number;
}

// Location form state for multi-location trigger (simplified - specialty/location auto-detected)
export interface LocationFormData {
  gbpAccountId: string;
  gbpLocationId: string;
  gbpLocationName: string;
}

export interface StatusDetail {
  currentStep: string;
  message: string;
  progress: number;
  stepsCompleted: string[];
  timestamps: Record<string, string>;
}

// Search params from Identifier Agent for Apify
export interface SearchParams {
  city?: string | null;
  state?: string | null;
  county?: string | null;
  postalCode?: string | null;
}

export interface RankingJob {
  id: number;
  organizationId?: number;
  organization_id?: number;
  location_id?: number | null;
  organization_name?: string | null;
  location_name?: string | null;
  specialty: string;
  location: string | null;
  rankKeywords?: string | null;
  rank_keywords?: string | null;
  gbpLocationId?: string | null;
  gbp_location_id?: string | null;
  gbpLocationName?: string | null;
  gbp_location_name?: string | null;
  batchId?: string | null;
  batch_id?: string | null;
  status: string;
  rankScore?: number | null;
  rank_score?: number | null;
  rankPosition?: number | null;
  rank_position?: number | null;
  totalCompetitors?: number | null;
  total_competitors?: number | null;
  observedAt?: string;
  observed_at?: string;
  createdAt?: string;
  created_at?: string;
  statusDetail?: StatusDetail | null;
  status_detail?: StatusDetail | null;
  // Search params used for Apify (for debugging)
  searchParams?: SearchParams | null;
}

// Batch status for polling
export interface BatchStatus {
  batchId: string;
  status: "processing" | "completed" | "failed";
  totalLocations: number;
  completedLocations: number;
  failedLocations: number;
  currentLocationIndex: number;
  currentLocationName: string;
  rankingIds: number[];
  progress: number;
  errors?: Array<{ locationId: string; error: string; attempt: number }>;
}

export interface RankingResult {
  id: number;
  specialty: string;
  location: string | null;
  rankKeywords?: string | null;
  gbpLocationId?: string | null;
  gbpLocationName?: string | null;
  // Search params used for Apify (for debugging)
  searchParams?: SearchParams | null;
  observedAt: string;
  rankScore: number | string;
  rankPosition: number;
  totalCompetitors: number;
  rankingFactors: {
    category_match: {
      score: number;
      weighted: number;
      weight: number;
      details?: string;
    };
    review_count: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
      details?: string;
    };
    star_rating: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
      details?: string;
    };
    keyword_name: {
      score: number;
      weighted: number;
      weight: number;
      details?: string;
    };
    review_velocity: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
      details?: string;
    };
    nap_consistency: {
      score: number;
      weighted: number;
      weight: number;
      details?: string;
    };
    gbp_activity: {
      score: number;
      weighted: number;
      weight: number;
      value?: number;
      details?: string;
    };
    sentiment: {
      score: number;
      weighted: number;
      weight: number;
      details?: string;
    };
  } | null;
  rawData: {
    client_gbp: {
      totalReviewCount?: number;
      averageRating?: number;
      primaryCategory?: string;
      reviewsLast30d?: number;
      postsLast30d?: number;
      photosCount?: number;
      hasWebsite?: boolean;
      hasPhone?: boolean;
      hasHours?: boolean;
      performance?: {
        calls?: number;
        directions?: number;
        clicks?: number;
      };
      gbpLocationId?: string;
      gbpLocationName?: string;
      _raw?: unknown;
    } | null;
    competitors: Record<string, unknown>[];
    competitors_discovered?: number;
    competitors_from_cache?: boolean;
    website_audit: Record<string, unknown> | null;
  } | null;
  llmAnalysis: {
    gaps: Array<{
      type: string;
      query_class?: string;
      area?: string;
      impact: string;
      reason: string;
    }>;
    drivers: Array<{
      factor: string;
      weight: string | number;
      direction: string;
    }>;
    render_text: string;
    client_summary?: string | null;
    top_recommendations?: Array<{
      priority: number;
      title: string;
      description?: string;
      expected_outcome?: string;
      impact?: string;
      effort?: string;
      timeline?: string;
    }>;
    verdict: string;
    confidence: number;
  } | null;
}

// Group structure for display - flat batch list
export interface BatchGroup {
  batchId: string;
  organization_id: number | null;
  organization_name: string | null;
  jobs: RankingJob[];
  status: "processing" | "completed" | "failed" | "pending";
  createdAt: Date;
  totalLocations: number;
  completedLocations: number;
}

// Month group for card layout
export interface MonthGroup {
  label: string; // e.g. "February 2026"
  sortKey: string; // e.g. "2026-02"
  batches: BatchGroup[];
}
