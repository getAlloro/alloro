/**
 * Websites API - Admin portal for website-builder data
 */

import type { Section } from "./templates";
import { getCommonHeaders } from "./index";

// ---------------------------------------------------------------------------
// Project Identity (new consolidated source of truth)
// ---------------------------------------------------------------------------

export interface ProjectIdentityBusiness {
  name: string | null;
  category: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  hours: unknown | null;
  rating: number | null;
  review_count: number | null;
  website_url: string | null;
  place_id: string | null;
}

export interface ProjectIdentityBrand {
  primary_color: string | null;
  accent_color: string | null;
  gradient_enabled: boolean;
  gradient_from: string | null;
  gradient_to: string | null;
  gradient_direction: string;
  /** Preferred text color when rendering content on top of bg-gradient-brand ("white" | "dark") */
  gradient_text_color?: "white" | "dark" | null;
  /** Named preset controlling stop distribution — all presets are subtle (no hard edges). */
  gradient_preset?:
    | "smooth"
    | "lean-primary"
    | "lean-accent"
    | "soft-lean-primary"
    | "soft-lean-accent"
    | "warm-middle"
    | "quick-transition"
    | "long-transition"
    | null;
  logo_s3_url: string | null;
  logo_alt_text: string | null;
  fonts?: { heading: string; body: string };
}

export interface ProjectIdentity {
  version: number;
  warmed_up_at?: string | null;
  last_updated_at?: string | null;
  sources_used?: {
    gbp?: { place_id: string; scraped_at: string } | null;
    urls?: Array<{ url: string; scraped_at: string; char_length: number | null }>;
    text_inputs?: Array<{ label: string; char_length: number }>;
  };
  business?: ProjectIdentityBusiness;
  brand?: ProjectIdentityBrand;
  voice_and_tone?: {
    archetype: string | null;
    tone_descriptor: string | null;
    voice_samples: string[];
  };
  content_essentials?: {
    unique_value_proposition: string | null;
    founding_story: string | null;
    core_values: string[];
    certifications: string[];
    service_areas: string[];
    social_links: Record<string, string | null>;
    review_themes: string[];
    featured_testimonials: Array<{
      author: string | null;
      rating: number | null;
      text: string | null;
    }>;
    doctors?: ProjectIdentityListEntry[];
    services?: ProjectIdentityListEntry[];
  };
  locations?: ProjectIdentityLocation[];
  extracted_assets?: {
    images: Array<{
      source_url: string | null;
      s3_url: string | null;
      description: string | null;
      use_case: string | null;
      resolution: string | null;
      is_logo: boolean;
      usability_rank: number | null;
    }>;
    discovered_pages: Array<{
      url: string | null;
      title: string | null;
      content_excerpt: string | null;
    }>;
  };
  raw_inputs?: {
    gbp_raw?: unknown;
    scraped_pages_raw?: Record<string, string>;
    user_text_inputs?: Array<{ label: string; text: string }>;
  };
  meta?: {
    warmup_status?: "queued" | "running" | "ready" | "failed" | null;
  };
}

export type WarmupStatus = "queued" | "running" | "ready" | "failed" | null;

export interface WebsiteProject {
  id: string;
  user_id: string;
  generated_hostname: string;
  display_name: string | null;
  custom_domain: string | null;
  status: string;
  selected_place_id: string | null;
  selected_website_url: string | null;
  template_id: string | null;
  wrapper: string;
  header: string;
  footer: string;
  primary_color: string | null;
  accent_color: string | null;
  step_gbp_scrape: Record<string, unknown> | null;
  project_identity?: ProjectIdentity | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  organization?: {
    id: number;
    name: string;
    subscription_tier: string;
  } | null;
  active_integrations?: Array<{
    platform: "hubspot" | "rybbit" | "clarity" | "gsc";
    status: string;
  }>;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export type EditChatHistory = Record<string, ChatHistoryMessage[]>;

export interface SeoData {
  location_context?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  canonical_url?: string | null;
  robots?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  og_type?: string | null;
  max_image_preview?: string | null;
  schema_json?: Record<string, unknown>[] | null;
  scores?: Record<string, unknown> | null;
  insights?: Record<string, string> | null;
}

export interface WebsitePage {
  id: string;
  project_id: string;
  path: string;
  display_name: string | null;
  version: number;
  status: string;
  generation_status?: PageGenerationStatus | null;
  generation_progress?: GenerationProgress | null;
  page_type?: "sections" | "artifact";
  artifact_s3_prefix?: string | null;
  sections: Section[];
  seo_data: SeoData | null;
  edit_chat_history: EditChatHistory | null;
  created_at: string;
  updated_at: string;
}

export interface WebsiteProjectWithPages extends WebsiteProject {
  pages: WebsitePage[];
}

export type WebsiteProjectListView = "active" | "inactive" | "archive";

export interface FetchWebsitesRequest {
  status?: string;
  projectListView?: WebsiteProjectListView;
  page?: number;
  limit?: number;
}

export interface WebsitesResponse {
  success: boolean;
  data: WebsiteProject[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface WebsiteDetailResponse {
  success: boolean;
  data: WebsiteProjectWithPages;
}

export interface StatusesResponse {
  success: boolean;
  statuses: string[];
}

const API_BASE = "/api/admin/websites";

const adminFetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  Object.entries(getCommonHeaders()).forEach(([key, value]) => {
    if (!headers.has(key)) headers.set(key, value);
  });
  return fetch(input, { ...init, headers });
};

/**
 * Fetch all website projects with pagination
 */
export const fetchWebsites = async (
  filters: FetchWebsitesRequest = {},
): Promise<WebsitesResponse> => {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  });

  const response = await adminFetch(
    `${API_BASE}${params.toString() ? `?${params.toString()}` : ""}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch websites: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Fetch a single website project with pages
 */
export const fetchWebsiteDetail = async (
  id: string,
): Promise<WebsiteDetailResponse> => {
  const response = await adminFetch(`${API_BASE}/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch website: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get unique statuses for filter dropdown
 */
export const fetchStatuses = async (): Promise<StatusesResponse> => {
  const response = await adminFetch(`${API_BASE}/statuses`);

  if (!response.ok) {
    throw new Error(`Failed to fetch statuses: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Create a new website project
 */
export const createWebsite = async (data: {
  user_id?: string;
  hostname?: string;
}): Promise<{ success: boolean; data: WebsiteProject }> => {
  const response = await adminFetch(API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create website");
  }

  return response.json();
};

/**
 * Delete a website project
 */
export const deleteWebsite = async (
  id: string,
): Promise<{ success: boolean; message: string }> => {
  const response = await adminFetch(`${API_BASE}/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete website");
  }

  return response.json();
};

/**
 * Update a website project
 */
export const updateWebsite = async (
  id: string,
  data: Partial<WebsiteProject>,
): Promise<{ success: boolean; data: WebsiteProject }> => {
  const response = await adminFetch(`${API_BASE}/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update website");
  }

  return response.json();
};

// =====================================================================
// PIPELINE
// =====================================================================

export interface StartPipelineRequest {
  projectId: string;
  /** Legacy input accepted by older callers. Generation now requires project_identity. */
  placeId?: string;
  templateId?: string;
  templatePageId?: string;
  path?: string;
  websiteUrl?: string | null;
  pageContext?: string;
  practiceSearchString?: string;
  businessName?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  phone?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  primaryColor?: string;
  accentColor?: string;
  scrapedData?: string | null;
  gradient?: GradientInput;
  dynamicSlotValues?: Record<string, string>;
}

/** Regenerate a single component on a page. */
export const regenerateComponent = async (
  projectId: string,
  pageId: string,
  componentName: string,
  instruction?: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/regenerate-component`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentName, instruction }),
    },
  );
  if (!response.ok) throw new Error(`Failed to regenerate: ${response.statusText}`);
  return response.json();
};

// =====================================================================
// LAYOUTS PIPELINE
// =====================================================================

export interface LayoutsStatus {
  status: "queued" | "generating" | "ready" | "failed" | "cancelled" | null;
  progress: { total: number; completed: number; current_component: string } | null;
  generated_at: string | null;
  slot_values: Record<string, string>;
  wrapper: string;
  header: string;
  footer: string;
}

/** Enqueue the Layouts generation job. */
export const startLayoutGeneration = async (
  projectId: string,
  slotValues: Record<string, string>,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/generate-layouts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slotValues }),
  });
  if (!response.ok) throw new Error(`Failed to start layouts: ${response.statusText}`);
  return response.json();
};

/** Poll layouts generation status. */
export const fetchLayoutsStatus = async (
  projectId: string,
): Promise<{ success: boolean; data: LayoutsStatus }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/layouts-status`);
  if (!response.ok) throw new Error(`Failed to fetch layouts status: ${response.statusText}`);
  return response.json();
};

/** Enqueue backend page generation for a project with ready identity. */
export const startPipeline = async (
  data: StartPipelineRequest,
): Promise<{ success: boolean; message: string }> => {
  const response = await adminFetch(`${API_BASE}/start-pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to start pipeline");
  }

  return response.json();
};

// =====================================================================
// STATUS POLLING
// =====================================================================

export interface WebsiteStatusResponse {
  id: string;
  status: string;
  selected_place_id: string | null;
  selected_website_url: string | null;
  step_gbp_scrape: Record<string, unknown> | null;
  step_website_scrape: Record<string, unknown> | null;
  step_image_analysis: Record<string, unknown> | null;
  updated_at: string;
}

/**
 * Poll website project status (lightweight endpoint)
 */
export const pollWebsiteStatus = async (
  id: string,
): Promise<WebsiteStatusResponse> => {
  const response = await adminFetch(`${API_BASE}/${id}/status`);

  if (!response.ok) {
    throw new Error(`Failed to fetch website status: ${response.statusText}`);
  }

  return response.json();
};

// =====================================================================
// PAGE GENERATION STATUS
// =====================================================================

export type PageGenerationStatus = 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled';

export interface GenerationProgress {
  total: number;
  completed: number;
  current_component: string;
}

export interface PageGenerationStatusItem {
  id: string;
  path: string;
  status: string;
  generation_status: PageGenerationStatus;
  generation_progress: GenerationProgress | null;
  template_page_name: string | null;
  updated_at: string;
}

/**
 * Poll per-page generation status for a project
 */
export const fetchPagesGenerationStatus = async (
  projectId: string,
): Promise<{ success: boolean; data: PageGenerationStatusItem[] }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages/generation-status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch page generation status: ${response.statusText}`);
  }
  return response.json();
};

export interface PageProgressiveState {
  pageId: string;
  name: string | null;
  path: string | null;
  generation_status: string | null;
  generation_progress: GenerationProgress | null;
  template_sections: Array<{ name: string; content: string }>;
  generated_sections: Array<{ name: string; content: string }>;
  wrapper: string | null;
  header: string | null;
  footer: string | null;
}

/**
 * Fetch the in-flight state of a single page — template section scaffolding
 * plus whichever sections have been generated so far. Used by the
 * ProgressivePagePreview during page generation.
 */
export const fetchPageProgressiveState = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: PageProgressiveState }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/progressive-state`,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch page progressive state: ${response.statusText}`,
    );
  }
  return response.json();
};

/**
 * Cancel all in-progress page generation for a project
 */
export const cancelGeneration = async (
  projectId: string,
): Promise<{ success: boolean; cancelledPages: number }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/cancel-generation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to cancel generation: ${response.statusText}`);
  }
  return response.json();
};

// =====================================================================
// PROJECT IDENTITY
// =====================================================================

export type ScrapeStrategy = "fetch" | "browser" | "screenshot";

export interface WarmupUrlInput {
  url: string;
  strategy?: ScrapeStrategy;
}

export type ManualHours = Record<string, string>;

export interface ManualBusinessInput {
  name: string;
  category: string;
  phone: string;
  websiteUrl?: string;
}

export interface ManualLocationInput {
  id?: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  websiteUrl?: string;
  hours: ManualHours;
  isPrimary?: boolean;
}

export interface WarmupInputs {
  /** Primary GBP place_id. When `placeIds` is present, primary should match its first entry. */
  placeId?: string;
  /** Full set of GBP place_ids (one per physical location). First is treated as primary. */
  placeIds?: string[];
  practiceSearchString?: string;
  /** String or object-with-strategy. Backend accepts both. */
  urls?: Array<string | WarmupUrlInput>;
  texts?: Array<{ label?: string; text: string }>;
  manualBusiness?: ManualBusinessInput;
  manualLocations?: ManualLocationInput[];
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  gradient?: {
    enabled: boolean;
    from?: string;
    to?: string;
    direction?: string;
  };
}

/** Start the identity warmup for a project. */
export const startIdentityWarmup = async (
  projectId: string,
  inputs: WarmupInputs,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/identity/warmup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });
  if (!response.ok) throw new Error(`Failed to start warmup: ${response.statusText}`);
  return response.json();
};

/** Fetch the full project identity. */
export const fetchIdentity = async (
  projectId: string,
): Promise<{ success: boolean; data: ProjectIdentity | null }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/identity`);
  if (!response.ok) throw new Error(`Failed to fetch identity: ${response.statusText}`);
  return response.json();
};

/** Poll warmup status (lightweight). */
export const fetchIdentityStatus = async (
  projectId: string,
): Promise<{
  success: boolean;
  data: { warmup_status: WarmupStatus; warmed_up_at: string | null };
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/identity/status`);
  if (!response.ok) throw new Error(`Failed to fetch identity status: ${response.statusText}`);
  return response.json();
};

/** Replace identity with admin-edited JSON. */
export const updateIdentity = async (
  projectId: string,
  identity: ProjectIdentity,
): Promise<{ success: boolean; data: ProjectIdentity }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/identity`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity }),
  });
  if (!response.ok) throw new Error(`Failed to update identity: ${response.statusText}`);
  return response.json();
};

// =====================================================================
// URL BLOCK DETECTION
// =====================================================================

export type BlockVendor =
  | "cloudflare"
  | "akamai"
  | "sucuri"
  | "datadome"
  | "perimeterx"
  | "imperva"
  | "kasada"
  | "aws_waf"
  | "f5_bigip"
  | "fastly"
  | "generic_waf"
  | "captcha"
  | "rate_limit"
  | "forbidden"
  | "timeout"
  | "empty"
  | "unknown";

export type BlockCheckResult =
  | {
      ok: true;
      status: number;
      preview_chars: number;
      preview_text?: string;
      /**
       * True when the URL returned a successful response but the extracted text
       * is under the 500-char threshold used by warmup. Rendered as an amber
       * "Looks thin" warning in the URL Test UI (distinct from blocked).
       */
      thin_content?: boolean;
    }
  | {
      ok: false;
      block_type: BlockVendor;
      status: number | null;
      detail: string;
      detected_signals: string[];
    };

/** Probe a URL to check if it is blocked by a WAF / anti-bot / CAPTCHA. */
export const testUrl = async (
  projectId: string,
  url: string,
): Promise<{ success: boolean; data: BlockCheckResult }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/test-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error(`Failed to test URL: ${response.statusText}`);
  return response.json();
};

// =====================================================================
// CREATE ALL FROM TEMPLATE
// =====================================================================

export interface GradientInput {
  enabled: boolean;
  from?: string;
  to?: string;
  direction?: "to-r" | "to-br" | "to-b" | "to-tr" | string;
}

export interface DynamicSlotDef {
  key: string;
  label: string;
  type: "text" | "url";
  description?: string;
  placeholder?: string;
}

export interface CreateAllFromTemplateRequest {
  templateId: string;
  /** Legacy input accepted by older callers. Generation now requires project_identity. */
  placeId?: string;
  pages: Array<{
    templatePageId: string;
    path: string;
    websiteUrl?: string | null;
  }>;
  businessName?: string;
  formattedAddress?: string;
  city?: string;
  state?: string;
  phone?: string;
  category?: string;
  primaryColor?: string;
  accentColor?: string;
  practiceSearchString?: string;
  rating?: number;
  reviewCount?: number;
  gradient?: GradientInput;
  dynamicSlotValues?: Record<string, string>;
}

/** Fetch the dynamic_slots JSONB for a template page */
export const fetchTemplatePageSlots = async (
  templateId: string,
  pageId: string,
): Promise<{ success: boolean; data: DynamicSlotDef[] }> => {
  const response = await adminFetch(
    `${API_BASE}/templates/${templateId}/pages/${pageId}/slots`,
  );
  if (!response.ok) throw new Error(`Failed to fetch slots: ${response.statusText}`);
  return response.json();
};

/** Fetch pre-filled slot values for a specific template page (derived from project_identity) */
export const fetchSlotPrefill = async (
  projectId: string,
  opts: { templatePageId?: string; layout?: boolean },
): Promise<{
  success: boolean;
  data: { slots: DynamicSlotDef[]; values: Record<string, string> };
}> => {
  const qs = opts.layout
    ? "?layout=true"
    : `?templatePageId=${encodeURIComponent(opts.templatePageId || "")}`;
  const response = await adminFetch(`${API_BASE}/${projectId}/slot-prefill${qs}`);
  if (!response.ok) throw new Error(`Failed to fetch slot prefill: ${response.statusText}`);
  return response.json();
};

/** LLM-generate concrete text values for every text-type slot on a template page. */
export const generateSlotValues = async (
  projectId: string,
  templatePageId: string,
  pageContext?: string,
): Promise<{
  success: boolean;
  data: { values: Record<string, string> };
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/slot-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templatePageId, pageContext }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Failed to generate slot values: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Create all pages from a template and kick off the generation pipeline per page
 */
export const createAllFromTemplate = async (
  projectId: string,
  data: CreateAllFromTemplateRequest,
): Promise<{ success: boolean; data: Array<{ id: string; path: string; templatePageId: string; generation_status: string }> }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/create-all-from-template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create pages from template');
  }
  return response.json();
};

// =====================================================================
// WEBSITE SCRAPE
// =====================================================================

export interface ScrapeResponse {
  success: boolean;
  baseUrl: string;
  pages: Record<string, string>;
  images: string[];
  elapsedMs: number;
  charLength: number;
  estimatedTokens: number;
  error?: string;
}

/**
 * Scrape a website for multi-page HTML content + images
 */
export const scrapeWebsite = async (url: string): Promise<ScrapeResponse> => {
  const response = await adminFetch(`${API_BASE}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to scrape website");
  }

  return response.json();
};

// =====================================================================
// PAGE EDITOR
// =====================================================================

/**
 * Fetch a single page by ID
 */
export const fetchPage = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages/${pageId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch page");
  }

  return response.json();
};

/**
 * Create a draft from a published page (idempotent)
 */
export const createDraftFromPage = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/create-draft`,
    { method: "POST" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create draft");
  }

  return response.json();
};

export type UpdatePageSectionsOptions = {
  /** Optional note recorded on the saved revision (shown in History). */
  revisionNote?: string | null;
  /** Loaded row's updated_at — server returns 409 STALE_WRITE on mismatch. */
  expectedUpdatedAt?: string | null;
  /** Overwrite even when the row changed since it was loaded. */
  force?: boolean;
};

export type ApiError = Error & { code?: string; status?: number };

/**
 * Update a draft page's sections and/or chat history
 */
export const updatePageSections = async (
  projectId: string,
  pageId: string,
  sections: Section[],
  editChatHistory?: EditChatHistory,
  options?: UpdatePageSectionsOptions,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const body: Record<string, unknown> = { sections };
  if (editChatHistory !== undefined) {
    body.edit_chat_history = editChatHistory;
  }
  if (options?.revisionNote) {
    body.revision_note = options.revisionNote;
  }
  if (options?.expectedUpdatedAt) {
    body.expected_updated_at = options.expectedUpdatedAt;
  }
  if (options?.force) {
    body.force = true;
  }

  const response = await adminFetch(`${API_BASE}/${projectId}/pages/${pageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.json();
    const error = new Error(
      errorBody.message || "Failed to update page",
    ) as ApiError;
    error.code = errorBody.error;
    error.status = response.status;
    throw error;
  }

  return response.json();
};

/**
 * Publish a draft page
 */
export const publishPage = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/publish`,
    { method: "POST" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to publish page");
  }

  return response.json();
};

export type PageVersionSummary = {
  id: string;
  version: number;
  status: "draft" | "published" | "inactive";
  created_at: string;
  updated_at: string;
};

/**
 * List version history at a page's path
 */
export const fetchPageVersions = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; data: { versions: PageVersionSummary[]; path: string } }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/versions`,
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch page versions");
  }

  return response.json();
};

/**
 * Fetch a single version's full content
 */
export const fetchPageVersionContent = async (
  projectId: string,
  pageId: string,
  versionId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/versions/${versionId}`,
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch page version");
  }

  return response.json();
};

/**
 * Restore a version's content into the current draft (never publishes)
 */
export const restorePageVersionIntoDraft = async (
  projectId: string,
  pageId: string,
  versionId: string,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/versions/${versionId}/restore`,
    { method: "POST" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to restore page version");
  }

  return response.json();
};

/**
 * Create a blank page (no template, no pipeline)
 */
export const createBlankPage = async (
  projectId: string,
  data: { path: string; display_name?: string; sections?: Section[] },
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: data.path,
      sections: data.sections ?? [],
      display_name: data.display_name,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create page");
  }

  return response.json();
};

/**
 * Upload an artifact page (React app zip build)
 */
export const uploadArtifactPage = async (
  projectId: string,
  data: { file: File; path: string; display_name?: string },
): Promise<{ success: boolean; data: WebsitePage }> => {
  const formData = new FormData();
  formData.append("file", data.file);
  formData.append("path", data.path);
  if (data.display_name) {
    formData.append("display_name", data.display_name);
  }

  const response = await adminFetch(`${API_BASE}/${projectId}/pages/artifact`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to upload artifact page");
  }

  return response.json();
};

/**
 * Replace an artifact page's build with a new zip
 */
export const replaceArtifactBuild = async (
  projectId: string,
  pageId: string,
  file: File,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/artifact`,
    {
      method: "PUT",
      body: formData,
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to replace artifact build");
  }

  return response.json();
};

/**
 * Delete a page version
 */
export const deletePageVersion = async (
  projectId: string,
  pageId: string,
): Promise<{ success: boolean; message: string }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages/${pageId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete page version");
  }

  return response.json();
};

/**
 * Delete ALL versions of a page at a given path
 */
export const deletePageByPath = async (
  projectId: string,
  path: string,
): Promise<{ success: boolean; message: string }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/by-path?path=${encodeURIComponent(path)}`,
    { method: "DELETE" },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete page");
  }

  return response.json();
};

export interface EditComponentRequest {
  alloroClass: string;
  currentHtml: string;
  instruction: string;
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface EditDebugInfo {
  model: string;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  inputTokens: number;
  outputTokens: number;
}

export interface EditComponentResponse {
  success: boolean;
  editedHtml: string | null;
  message?: string;
  rejected?: boolean;
  debug?: EditDebugInfo;
}

/**
 * Send an edit instruction to Claude for a specific component
 */
export const editPageComponent = async (
  projectId: string,
  pageId: string,
  payload: EditComponentRequest,
): Promise<EditComponentResponse> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/pages/${pageId}/edit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to edit component");
  }

  return response.json();
};

/**
 * Send an edit instruction to Claude for a layout component (header/footer)
 */
export const editLayoutComponent = async (
  projectId: string,
  payload: EditComponentRequest,
): Promise<EditComponentResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/edit-layout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to edit layout component");
  }

  return response.json();
};

/**
 * Fetch the page editor system prompt from admin settings
 */
export const fetchEditorSystemPrompt = async (): Promise<string> => {
  const response = await adminFetch(`${API_BASE}/editor/system-prompt`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch system prompt");
  }

  const data = await response.json();
  return data.prompt;
};

// =====================================================================
// CUSTOM DOMAIN
// =====================================================================

export interface ConnectDomainResponse {
  success: boolean;
  data: { custom_domain: string; server_ip: string };
}

export interface VerifyDomainResponse {
  success: boolean;
  data: { verified: boolean; custom_domain: string; resolved_ips?: string[] };
}

/** Connect a custom domain to a project (admin) */
export const connectDomain = async (
  projectId: string,
  domain: string,
): Promise<ConnectDomainResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/connect-domain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to connect domain");
  }

  return response.json();
};

/** Verify DNS for a project's custom domain (admin) */
export const verifyDomainAdmin = async (
  projectId: string,
): Promise<VerifyDomainResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/verify-domain`, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to verify domain");
  }

  return response.json();
};

/** Disconnect custom domain from a project (admin) */
export const disconnectDomain = async (
  projectId: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/disconnect-domain`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to disconnect domain");
  }

  return response.json();
};

// =====================================================================
// ORGANIZATION LINKING
// =====================================================================

/**
 * Link or unlink a website to/from an organization
 */
export const linkWebsiteToOrganization = async (
  projectId: string,
  organizationId: number | null,
): Promise<{ success: boolean; data: WebsiteProject }> => {
  const token = localStorage.getItem("auth_token");
  const response = await adminFetch(`${API_BASE}/${projectId}/link-organization`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ organizationId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to link organization");
  }

  return response.json();
};

// =====================================================================
// CONTACT FORM
// =====================================================================

export interface ContactFormData {
  name: string;
  phone: string;
  email: string;
  service?: string;
  message?: string;
  captchaToken: string;
}

// =====================================================================
// RECIPIENTS
// =====================================================================

export interface RecipientsResponse {
  success: boolean;
  data: {
    recipients: string[];
    orgUsers: { name: string; email: string; role: string }[];
  };
}

export const fetchRecipients = async (
  projectId: string,
): Promise<RecipientsResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/recipients`);
  if (!response.ok) throw new Error("Failed to fetch recipients");
  return response.json();
};

export const updateRecipients = async (
  projectId: string,
  recipients: string[],
): Promise<{ success: boolean; data: { recipients: string[] } }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/recipients`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipients }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update recipients");
  }
  return response.json();
};

export interface WebsiteFormCatalogItem {
  form_name: string;
  form_key: string;
  display_label: string | null;
  sort_order: number | null;
  submission_count: number;
  last_seen: string | null;
  unread_count: number;
  sources: {
    submissions: boolean;
    markup: boolean;
  };
  rule: {
    id: string;
    recipients: string[];
    is_enabled: boolean;
    updated_at: string;
  } | null;
}

export interface FormRecipientCatalogResponse {
  success: boolean;
  data: WebsiteFormCatalogItem[];
}

export const fetchFormRecipientCatalog = async (
  projectId: string,
): Promise<FormRecipientCatalogResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/forms/catalog`);
  if (!response.ok) throw new Error("Failed to fetch form catalog");
  return response.json();
};

export const updateFormRecipientRule = async (
  projectId: string,
  payload: { formName: string; recipients: string[]; isEnabled: boolean },
): Promise<{
  success: boolean;
  data: {
    id: string;
    project_id: string;
    form_name: string;
    form_key: string;
    recipients: string[];
    is_enabled: boolean;
    updated_at: string;
  };
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/forms/recipients`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update form recipients");
  }
  return response.json();
};

export type FormCatalogPreferenceInput = {
  formName: string;
  displayLabel: string | null;
  sortOrder: number;
};

export const updateFormCatalogPreferences = async (
  projectId: string,
  payload: { preferences: FormCatalogPreferenceInput[] },
): Promise<{
  success: boolean;
  data: Array<{
    id: string;
    project_id: string;
    form_name: string;
    form_key: string;
    display_label: string | null;
    sort_order: number | null;
    updated_at: string;
  }>;
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/forms/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update form preferences");
  }
  return response.json();
};

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

export interface FileValue {
  url: string;
  name: string;
  type: string;
  s3Key: string;
}

export interface FormSection {
  title: string;
  fields: [string, string | FileValue][];
}

/** Contents can be flat key-value (legacy) or ordered sections array (new) */
export type FormContents = Record<string, string | FileValue> | FormSection[];

export interface FormSubmission {
  id: string;
  project_id: string;
  form_name: string;
  contents: FormContents;
  recipients_sent_to: string[];
  submitted_at: string;
  is_read: boolean;
  is_flagged?: boolean;
  flag_reason?: string;
}

export interface FormSubmissionsResponse {
  success: boolean;
  data: FormSubmission[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  allCount?: number;
  unreadCount: number;
  flaggedCount: number;
  verifiedCount: number;
  optinsCount: number;
}

export const fetchFormSubmissions = async (
  projectId: string,
  page = 1,
  limit = 20,
  filter?: string,
  formName?: string,
): Promise<FormSubmissionsResponse> => {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (filter) params.set("filter", filter);
  if (formName) params.set("formName", formName);
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions?${params}`);
  if (!response.ok) throw new Error("Failed to fetch form submissions");
  return response.json();
};

export const markAllFormSubmissionsRead = async (
  projectId: string,
  formName?: string,
): Promise<{ success: boolean; data?: { updated: number }; updated?: number }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/mark-all-read`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ formName }),
  });
  if (!response.ok) throw new Error("Failed to mark submissions read");
  return response.json();
};

export const fetchFormSubmission = async (
  projectId: string,
  submissionId: string,
): Promise<{ success: boolean; data: FormSubmission }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/${submissionId}`);
  if (!response.ok) throw new Error("Failed to fetch submission");
  return response.json();
};

export const toggleFormSubmissionRead = async (
  projectId: string,
  submissionId: string,
  is_read: boolean,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/${submissionId}/read`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_read }),
  });
  if (!response.ok) throw new Error("Failed to update submission");
  return response.json();
};

export const deleteFormSubmission = async (
  projectId: string,
  submissionId: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/${submissionId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete submission");
  return response.json();
};

export const sendFormSubmissionEmail = async (
  projectId: string,
  submissionId: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/${submissionId}/send-email`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Failed to send submission");
  return response.json();
};

export const bulkSendFormSubmissionsEmail = async (
  projectId: string,
  submissionIds: string[],
): Promise<{ success: boolean; data: { sent: number; skipped: number } }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/bulk/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionIds }),
  });
  if (!response.ok) throw new Error("Failed to bulk send submissions");
  return response.json();
};

export const bulkDeleteFormSubmissions = async (
  projectId: string,
  submissionIds: string[],
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/bulk`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionIds }),
  });
  if (!response.ok) throw new Error("Failed to bulk delete submissions");
  return response.json();
};

export const bulkToggleFormSubmissionsRead = async (
  projectId: string,
  submissionIds: string[],
  is_read: boolean,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/form-submissions/bulk/read`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissionIds, is_read }),
  });
  if (!response.ok) throw new Error("Failed to bulk update submissions");
  return response.json();
};

/**
 * Submit a contact form from a rendered site
 */
export const submitContactForm = async (
  data: ContactFormData,
): Promise<{ success: boolean }> => {
  const response = await adminFetch("/api/websites/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to submit contact form");
  }

  return response.json();
};

// =====================================================================
// SEO
// =====================================================================

/**
 * Update page SEO data
 */
export const updatePageSeo = async (
  projectId: string,
  pageId: string,
  seoData: SeoData,
): Promise<{ success: boolean; data: WebsitePage }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages/${pageId}/seo`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seo_data: seoData }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update SEO data");
  }
  return response.json();
};

/**
 * Update post SEO data
 */
export const updatePostSeo = async (
  projectId: string,
  postId: string,
  seoData: SeoData,
): Promise<{ success: boolean; data: unknown }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/posts/${postId}/seo`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seo_data: seoData }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update post SEO data");
  }
  return response.json();
};

/**
 * AI-generate SEO data for a specific section
 */
export const generateSeo = async (
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: Record<string, unknown>,
): Promise<{ success: boolean; section: string; generated: Record<string, unknown>; insight: string }> => {
  const path = entityType === "page"
    ? `${API_BASE}/${projectId}/pages/${entityId}/seo/generate`
    : `${API_BASE}/${projectId}/posts/${entityId}/seo/generate`;
  const response = await adminFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to generate SEO data");
  }
  return response.json();
};

/**
 * Generate ALL SEO sections in a single request (fetches shared context once)
 */
export const generateAllSeo = async (
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: Record<string, unknown>,
): Promise<{ success: boolean; results: Array<{ section: string; generated: Record<string, unknown>; insight: string }> }> => {
  const path = entityType === "page"
    ? `${API_BASE}/${projectId}/pages/${entityId}/seo/generate-all`
    : `${API_BASE}/${projectId}/posts/${entityId}/seo/generate-all`;
  const response = await adminFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to generate all SEO data");
  }
  return response.json();
};

/**
 * Analyze existing SEO data for a page or post section (insights only, no regeneration)
 */
export const analyzeSeo = async (
  projectId: string,
  entityId: string,
  entityType: "page" | "post",
  body: Record<string, unknown>,
): Promise<{ success: boolean; section: string; insight: string }> => {
  const path = entityType === "page"
    ? `${API_BASE}/${projectId}/pages/${entityId}/seo/analyze`
    : `${API_BASE}/${projectId}/posts/${entityId}/seo/analyze`;
  const response = await adminFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to analyze SEO data");
  }
  return response.json();
};

/**
 * Start a bulk SEO generation job
 */
export const aiGeneratePostContent = async (
  projectId: string,
  data: { post_type_id: string; title: string; reference_url?: string; reference_content?: string },
): Promise<{ success: boolean; data: { content: string } }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/posts/ai-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to generate post content");
  }
  return response.json();
};

export const updatePageDisplayName = async (
  projectId: string,
  path: string,
  displayName: string | null,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/pages/display-name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, display_name: displayName }),
  });
  if (!response.ok) throw new Error("Failed to update display name");
  return response.json();
};

export const startBulkSeoGenerate = async (
  projectId: string,
  entityType: "page" | "post",
  postTypeId?: string,
  pagePaths?: string[],
): Promise<{ success: boolean; job_id: string; already_active?: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/seo/bulk-generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_type: entityType, post_type_id: postTypeId, page_paths: pagePaths }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to start bulk SEO generation");
  }
  return response.json();
};

/**
 * Poll bulk SEO generation progress
 */
export interface BulkSeoStatus {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  total_count: number;
  completed_count: number;
  failed_count: number;
  failed_items: Array<{ id: string; title: string; error: string }> | null;
}

export const getBulkSeoStatus = async (
  projectId: string,
  jobId: string,
): Promise<{ success: boolean; data: BulkSeoStatus }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/seo/bulk-generate/${jobId}/status`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch bulk SEO status");
  }
  return response.json();
};

/**
 * Check for an active bulk SEO job
 */
export const getActiveBulkSeoJob = async (
  projectId: string,
  entityType: "page" | "post",
  postTypeId?: string,
): Promise<{ success: boolean; data: BulkSeoStatus | null }> => {
  const params = new URLSearchParams({ entity_type: entityType });
  if (postTypeId) params.set("post_type_id", postTypeId);
  const response = await adminFetch(`${API_BASE}/${projectId}/seo/bulk-generate/active?${params.toString()}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to check active SEO job");
  }
  return response.json();
};

/**
 * Fetch all page/post SEO meta for uniqueness checking
 */
export const fetchAllSeoMeta = async (
  projectId: string,
): Promise<{
  success: boolean;
  data: {
    pages: Array<{ id: string; path: string; meta_title: string | null; meta_description: string | null }>;
    posts: Array<{ id: string; title: string; slug: string; meta_title: string | null; meta_description: string | null }>;
  };
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/seo/all-meta`);
  if (!response.ok) throw new Error("Failed to fetch SEO meta");
  return response.json();
};

// =====================================================================
// AI COMMAND
// =====================================================================

export interface AiCommandTargets {
  pages?: string[] | "all";
  posts?: string[] | "all";
  layouts?: string[] | "all";
}

export interface AiCommandBatchStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
  failed: number;
}

export interface AiCommandBatch {
  id: string;
  project_id: string;
  prompt: string;
  targets: AiCommandTargets;
  status: "analyzing" | "ready" | "executing" | "completed" | "failed";
  summary: string | null;
  stats: AiCommandBatchStats;
  created_at: string;
  updated_at: string;
}

export interface AiCommandRecommendation {
  id: string;
  batch_id: string;
  target_type: "page_section" | "layout" | "post" | "create_redirect" | "update_redirect" | "delete_redirect" | "create_page" | "create_post" | "create_menu" | "update_menu" | "update_post_meta" | "update_page_path";
  target_id: string;
  target_label: string;
  target_meta: Record<string, unknown>;
  recommendation: string;
  instruction: string;
  current_html: string;
  status: "pending" | "approved" | "rejected" | "executed" | "failed";
  execution_result: { success: boolean; error?: string; edited_html?: string } | null;
  sort_order: number;
  created_at: string;
}

export const createAiCommandBatch = async (
  projectId: string,
  data: { prompt?: string; targets?: AiCommandTargets; batch_type?: "ai_editor" | "ui_checker" | "link_checker" },
): Promise<{ success: boolean; data: AiCommandBatch }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/ai-command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create AI command batch");
  return response.json();
};

export const fetchAiCommandBatch = async (
  projectId: string,
  batchId: string,
): Promise<{ success: boolean; data: AiCommandBatch }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/ai-command/${batchId}`);
  if (!response.ok) throw new Error("Failed to fetch AI command batch");
  return response.json();
};

export const fetchAiCommandRecommendations = async (
  projectId: string,
  batchId: string,
  filters?: { status?: string; target_type?: string },
): Promise<{ success: boolean; data: AiCommandRecommendation[] }> => {
  const params = new URLSearchParams();
  if (filters?.status) params.append("status", filters.status);
  if (filters?.target_type) params.append("target_type", filters.target_type);
  const qs = params.toString() ? `?${params.toString()}` : "";

  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/recommendations${qs}`,
  );
  if (!response.ok) throw new Error("Failed to fetch recommendations");
  return response.json();
};

export const updateAiCommandRecommendation = async (
  projectId: string,
  batchId: string,
  recId: string,
  status: "approved" | "rejected",
  referenceData?: { reference_url?: string; reference_content?: string },
): Promise<{ success: boolean; data: AiCommandRecommendation }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/recommendations/${recId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...referenceData }),
    },
  );
  if (!response.ok) throw new Error("Failed to update recommendation");
  return response.json();
};

export const bulkUpdateAiCommandRecommendations = async (
  projectId: string,
  batchId: string,
  status: "approved" | "rejected",
  filters?: { target_type?: string },
): Promise<{ success: boolean; data: { updated: number } }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/recommendations/bulk`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...filters }),
    },
  );
  if (!response.ok) throw new Error("Failed to bulk update recommendations");
  return response.json();
};

export const executeAiCommandBatch = async (
  projectId: string,
  batchId: string,
): Promise<{ success: boolean; data: { status: string } }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}/execute`,
    { method: "POST" },
  );
  if (!response.ok) throw new Error("Failed to execute AI command batch");
  return response.json();
};

// =====================================================================
// REDIRECTS
// =====================================================================

export interface Redirect {
  id: string;
  project_id: string;
  from_path: string;
  to_path: string;
  type: number;
  is_wildcard: boolean;
  created_at: string;
  updated_at: string;
}

export const listRedirects = async (
  projectId: string,
): Promise<{ success: boolean; data: Redirect[] }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/redirects`);
  if (!response.ok) throw new Error("Failed to list redirects");
  return response.json();
};

export const createRedirect = async (
  projectId: string,
  data: { from_path: string; to_path: string; type?: number },
): Promise<{ success: boolean; data: Redirect }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/redirects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to create redirect");
  }
  return response.json();
};

export const updateRedirect = async (
  projectId: string,
  redirectId: string,
  data: Partial<{ from_path: string; to_path: string; type: number }>,
): Promise<{ success: boolean; data: Redirect }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/redirects/${redirectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update redirect");
  return response.json();
};

export const deleteRedirect = async (
  projectId: string,
  redirectId: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/redirects/${redirectId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete redirect");
  return response.json();
};

export const listAiCommandBatches = async (
  projectId: string,
): Promise<{ success: boolean; data: AiCommandBatch[] }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/ai-command`);
  if (!response.ok) throw new Error("Failed to list AI command batches");
  return response.json();
};

export const renameAiCommandBatch = async (
  projectId: string,
  batchId: string,
  summary: string,
): Promise<{ success: boolean; data: AiCommandBatch }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    },
  );
  if (!response.ok) throw new Error("Failed to rename batch");
  return response.json();
};

export const deleteAiCommandBatch = async (
  projectId: string,
  batchId: string,
): Promise<{ success: boolean }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/ai-command/${batchId}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error("Failed to delete AI command batch");
  return response.json();
};

// =====================================================================
// AI COSTS — per-project rollup of LLM spend
// =====================================================================

export interface AiCostEvent {
  id: string;
  event_type: string;
  vendor: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number | null;
  cache_read_tokens: number | null;
  estimated_cost_usd: number;
  metadata: Record<string, unknown> | null;
  parent_event_id: string | null;
  created_at: string;
}

export interface ProjectCostsResponse {
  success: boolean;
  data: {
    total_cost_usd: number;
    total_events: number;
    total_tokens: {
      input: number;
      output: number;
      cache_creation: number;
      cache_read: number;
    };
    events: AiCostEvent[];
  };
}

/** Fetch the Anthropic cost rollup for a project (100 most-recent events). */
export const fetchProjectCosts = async (
  projectId: string,
): Promise<ProjectCostsResponse> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/costs`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch project costs");
  }
  return response.json();
};

// =====================================================================
// IDENTITY LISTS + LOCATIONS — T7 / F3
// Appended for plan
// `plans/04182026-no-ticket-identity-enrichments-and-post-imports/spec.md`.
// =====================================================================

/** Light-weight list entry for doctors/services tracked in identity. */
export interface ProjectIdentityListEntry {
  name: string;
  source_url: string | null;
  short_blurb: string | null;
  last_synced_at: string;
  stale?: boolean;
}

/** Structured location entry stored in `identity.locations[]`. */
export interface ProjectIdentityLocation {
  id?: string;
  source?: "gbp" | "manual";
  place_id?: string | null;
  name: string;
  address: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  website_url: string | null;
  hours: unknown;
  last_synced_at: string;
  is_primary: boolean;
  warmup_status: "ready" | "failed" | "pending";
  warmup_error?: string;
  stale?: boolean;
}

export type IdentityListName = "doctors" | "services";

/**
 * Re-run extraction of the doctor/service list against the cached scraped
 * pages on identity. Returns the merged list (fresh entries first, then
 * carry-over entries marked `stale: true`).
 */
export const resyncProjectIdentityList = async (
  projectId: string,
  list: IdentityListName,
): Promise<{
  success: boolean;
  data: {
    list: IdentityListName;
    entries: ProjectIdentityListEntry[];
    refreshed_count: number;
    stale_count: number;
  };
}> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/identity/resync-list`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list }),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to resync identity list");
  }
  return response.json();
};

/**
 * Append a new GBP location to the project. Backend kicks off a targeted
 * Apify scrape for the place_id and returns the updated locations array.
 */
export const addProjectLocation = async (
  projectId: string,
  placeId: string,
): Promise<{
  success: boolean;
  data: {
    locations: ProjectIdentityLocation[];
    added: ProjectIdentityLocation;
  };
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/locations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ place_id: placeId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to add location");
  }
  return response.json();
};

/**
 * Switch the project's primary location. Backend rewrites identity.business
 * from the new primary's data so existing consumers stay correct.
 */
export const setPrimaryLocation = async (
  projectId: string,
  placeId: string,
): Promise<{
  success: boolean;
  data: { identity: ProjectIdentity; primary_place_id: string };
}> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/locations/primary`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ place_id: placeId }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to set primary location");
  }
  return response.json();
};

/**
 * Remove a non-primary location. Returns 409 from the API if the location
 * is the project's primary.
 */
export const removeProjectLocation = async (
  projectId: string,
  placeId: string,
): Promise<{
  success: boolean;
  data: { locations: ProjectIdentityLocation[] };
}> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/locations/${encodeURIComponent(placeId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to remove location");
  }
  return response.json();
};

/** Re-scrape a single location's GBP data. */
export const resyncProjectLocation = async (
  projectId: string,
  placeId: string,
): Promise<{
  success: boolean;
  data: {
    location: ProjectIdentityLocation;
    locations: ProjectIdentityLocation[];
  };
}> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/locations/${encodeURIComponent(placeId)}/resync`,
    { method: "POST" },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to re-sync location");
  }
  return response.json();
};

// =====================================================================
// POST IMPORT FROM IDENTITY — T8 + F4
// =====================================================================
//
// Appended for plan
// `plans/04182026-no-ticket-identity-enrichments-and-post-imports/spec.md`
// tasks T8 + F4. Frontend posts a list of entries (URLs for doctor/service,
// place_ids for location) and polls the returned jobId for live status.

/** Post type that can be imported from the identity blob. */
export type ImportPostType = "doctor" | "service" | "location";

export type PostImportEntryStatus =
  | "created"
  | "updated"
  | "skipped"
  | "failed";

export interface PostImportEntryResult {
  /** Echoed entry key — URL for doctor/service, place_id for location. */
  key: string;
  status: PostImportEntryStatus;
  post_id?: string;
  title?: string;
  error?: string;
  /** True when the URL scrape needed the browser/screenshot fallback. */
  used_fallback?: boolean;
}

export interface PostImportResultSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: PostImportEntryResult[];
}

export interface PostImportProgress {
  total: number;
  completed: number;
  results: PostImportEntryResult[];
}

export type PostImportJobState =
  | "waiting"
  | "active"
  | "completed"
  | "failed"
  | "delayed"
  | "paused"
  | "stuck"
  | "unknown";

export interface PostImportStatusResponse {
  success: boolean;
  data: {
    jobId: string;
    state: PostImportJobState;
    progress: PostImportProgress;
    summary: PostImportResultSummary | null;
    failedReason: string | null;
  };
}

/** Enqueue an import-from-identity job. Returns the BullMQ jobId. */
export const startPostImport = async (
  projectId: string,
  args: {
    postType: ImportPostType;
    entries: Array<string | { source_url: string; name: string }>;
    overwrite?: boolean;
  },
): Promise<{ success: boolean; data: { jobId: string; total: number } }> => {
  const response = await adminFetch(`${API_BASE}/${projectId}/posts/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to start post import");
  }
  return response.json();
};

/** Poll job state + per-entry results for a running/finished post import. */
export const fetchPostImportStatus = async (
  projectId: string,
  jobId: string,
): Promise<PostImportStatusResponse> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/posts/import/${jobId}`,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch post import status");
  }
  return response.json();
};

// =====================================================================
// IDENTITY SLICE PATCH
// =====================================================================
//
// Appended for plan
// `plans/04202026-no-ticket-identity-modal-cleanup-and-crud/spec.md` T3.
// Backend allow-list: `content_essentials.doctors`, `.services`,
// `.featured_testimonials`, `.core_values`, `.certifications`,
// `.service_areas`, `.social_links`, `.unique_value_proposition`,
// `.founding_story`, `.review_themes`, `locations`, `brand`,
// `voice_and_tone`. Everything else returns 400 `INVALID_PATH`.

/** Replace a single allow-listed slice of `project_identity`. */
export const patchIdentitySlice = async (
  projectId: string,
  path: string,
  value: unknown,
): Promise<{ success: boolean; data: ProjectIdentity }> => {
  const response = await adminFetch(
    `${API_BASE}/${projectId}/identity/slice`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, value }),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || `Failed to patch identity slice: ${response.statusText}`,
    );
  }
  return response.json();
};
