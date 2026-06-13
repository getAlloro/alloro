export type AiSeoAuditScope = "url_only" | "organization" | "sitewide" | "location";
export type AiSeoAuditStatus = "queued" | "running" | "completed" | "failed";
export type AiSeoConfidence = "low" | "medium" | "high";
export type AiSeoResultStatus =
  | "pass"
  | "partial"
  | "fail"
  | "unavailable"
  | "not_applicable";
export type AiSeoMethod = "deterministic" | "llm_assisted" | "integration";
export type AiSeoDataScope = "url" | "organization" | "location" | "external";
export type AiSeoTargetType = "page" | "location" | "site";
export type AiSeoExternalMatchState =
  | "consistent"
  | "conflicting"
  | "missing_on_site"
  | "external_candidate"
  | "ambiguous_entity"
  | "unavailable";

export type AiSeoCategoryId =
  | "access_indexability"
  | "page_source_readiness"
  | "entity_external_consistency"
  | "connected_performance"
  | "authority_market";

export interface AiSeoEvidenceInput {
  evidence_type: string;
  source: string;
  excerpt?: string | null;
  value?: Record<string, unknown>;
}

export interface AiSeoCheckResultInput {
  category: AiSeoCategoryId;
  check_id: string;
  status: AiSeoResultStatus;
  weight: number;
  points_awarded: number;
  method: AiSeoMethod;
  data_scope: AiSeoDataScope;
  remediation?: string | null;
  details?: Record<string, unknown>;
  evidence?: AiSeoEvidenceInput[];
}

export interface AiSeoHardCap {
  code: string;
  label: string;
  maxScore: number;
  evidence: Record<string, unknown>;
}

export interface AiSeoCategorySummary {
  id: AiSeoCategoryId;
  label: string;
  weight: number;
  score: number | null;
  availablePoints: number;
  awardedPoints: number;
}

export interface AiSeoScoreSummary {
  score: number | null;
  rawScore: number | null;
  dataCoverage: number;
  confidence: AiSeoConfidence;
  hardCaps: AiSeoHardCap[];
  categories: AiSeoCategorySummary[];
}

export interface ExtractedBusinessIdentity {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  hours?: string | null;
  providers?: string[];
  services?: string[];
  sameAs?: string[];
}

export interface UrlAuditSnapshot {
  requestedUrl: string;
  finalUrl: string;
  finalStatus: number | null;
  ok: boolean;
  headers: Record<string, string>;
  html: string;
  text: string;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  metaRobots: string | null;
  robotsTxtStatus: number | null;
  robotsTxt: string | null;
  isBlockedByRobots: boolean;
  sitemapUrls: string[];
  isInSitemap: boolean | null;
  schemaTypes: string[];
  schemaItems: unknown[];
  internalLinks: string[];
  externalLinks: string[];
  identity: ExtractedBusinessIdentity;
  fetchError?: string | null;
}

export interface ExternalEntitySourceInput {
  query: string;
  url: string;
  title?: string | null;
  sourceHost: string;
  sourceType?: string | null;
  reliabilityScore?: number | null;
  entityMatchState: AiSeoExternalMatchState;
  extractedFields?: ExtractedBusinessIdentity;
  comparedFields?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  fetchedAt?: string | null;
}

export interface OrganizationAuditContext {
  organizationId: number;
  organizationName: string;
  projectId: string | null;
  projectUrl: string | null;
  projectIdentity: ExtractedBusinessIdentity;
  locations: Array<{
    id: number;
    name: string;
    domain: string | null;
    businessData: Record<string, unknown> | null;
    googlePropertyCount: number;
    selectedGoogleProperty: {
      id: number;
      accountId: string | null;
      externalId: string;
      googleConnectionId: number;
      displayName: string | null;
    } | null;
    gbpData: Record<string, unknown> | null;
    gbpError: string | null;
  }>;
  gsc: {
    hasActiveIntegration: boolean;
    latestReportDate: string | null;
    rowsForUrls: Record<string, number>;
    error: string | null;
  };
  pages: Array<{
    id: string;
    path: string;
    title: string;
    url: string;
    locationId: number | null;
    mappingConfidence: number | null;
    importanceWeight: number;
  }>;
  totalPublishedPages: number;
}
