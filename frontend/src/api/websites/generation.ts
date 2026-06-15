/**
 * Websites API - URL block detection, create-all-from-template, website scrape
 *
 * Re-exported via the `src/api/websites.ts` barrel.
 */

import { adminFetch } from "../index";
import { API_BASE } from "./_shared";
import type { GradientInput } from "./_shared";

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
