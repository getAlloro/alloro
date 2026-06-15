/**
 * Identity Context — shared types.
 *
 * The project_identity document shape, the per-component context payload, and
 * the image manifest entry. No runtime logic.
 */

import type { GradientPresetId } from "./util.identity-context-gradient";

export interface ProjectIdentity {
  version?: number;
  business?: {
    name?: string | null;
    category?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    rating?: number | null;
    review_count?: number | null;
    website_url?: string | null;
    place_id?: string | null;
    hours?: unknown;
  };
  brand?: {
    primary_color?: string | null;
    accent_color?: string | null;
    gradient_enabled?: boolean;
    gradient_from?: string | null;
    gradient_to?: string | null;
    gradient_direction?: string | null;
    gradient_text_color?: "white" | "dark" | null;
    gradient_preset?: GradientPresetId | null;
    logo_s3_url?: string | null;
    logo_alt_text?: string | null;
  };
  voice_and_tone?: {
    archetype?: string | null;
    tone_descriptor?: string | null;
    voice_samples?: string[];
  };
  content_essentials?: {
    unique_value_proposition?: string | null;
    founding_story?: string | null;
    core_values?: string[];
    certifications?: string[];
    service_areas?: string[];
    social_links?: Record<string, string | null>;
    review_themes?: string[];
    featured_testimonials?: Array<{
      author?: string | null;
      rating?: number | null;
      text?: string | null;
    }>;
    doctors?: Array<{
      name: string;
      source_url: string | null;
      short_blurb: string | null;
      credentials?: string[];
      location_place_ids?: string[];
      last_synced_at: string;
      stale?: boolean;
    }>;
    services?: Array<{
      name: string;
      source_url: string | null;
      short_blurb: string | null;
      last_synced_at: string;
      stale?: boolean;
    }>;
  };
  locations?: Array<{
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
  }>;
  extracted_assets?: {
    images?: Array<ImageManifestEntry>;
    discovered_pages?: Array<{ url?: string | null; title?: string | null; content_excerpt?: string | null }>;
  };
  meta?: {
    warmup_status?: string | null;
  };
}

export interface ImageManifestEntry {
  source_url?: string | null;
  s3_url?: string | null;
  description?: string | null;
  use_case?: string | null;
  resolution?: string | null;
  is_logo?: boolean;
  usability_rank?: number | null;
}

export interface ComponentContext {
  componentName: string;
  templateMarkup: string;
  variableUserMessage: string;
  imageManifest: Array<{
    id: string;
    description: string | null;
    use_case: string | null;
    resolution: string | null;
  }>;
  /** Slot groups that were stripped from the template before the AI saw it. */
  strippedSlotGroups: string[];
  /** True when every slot in the template was skipped — pipeline should skip the whole component. */
  skipGeneration: boolean;
}
