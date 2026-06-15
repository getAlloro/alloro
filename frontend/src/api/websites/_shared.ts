/**
 * Websites API - shared base URL and core types
 *
 * Re-exported via the `src/api/websites.ts` barrel.
 */

import type { Section } from "../templates";

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

export const API_BASE = "/api/admin/websites";

// ---------------------------------------------------------------------------
// Page generation status — referenced by WebsitePage above and re-used by the
// pipeline submodule (PageGenerationStatusItem / PageProgressiveState).
// ---------------------------------------------------------------------------

export type PageGenerationStatus = 'queued' | 'generating' | 'ready' | 'failed' | 'cancelled';

export interface GenerationProgress {
  total: number;
  completed: number;
  current_component: string;
}

// ---------------------------------------------------------------------------
// Gradient input — referenced by StartPipelineRequest (pipeline submodule) and
// CreateAllFromTemplateRequest (generation submodule).
// ---------------------------------------------------------------------------

export interface GradientInput {
  enabled: boolean;
  from?: string;
  to?: string;
  direction?: "to-r" | "to-br" | "to-b" | "to-tr" | string;
}

// ---------------------------------------------------------------------------
// Identity list + location entries — referenced by ProjectIdentity above and
// re-used by the identity submodule.
// ---------------------------------------------------------------------------

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
