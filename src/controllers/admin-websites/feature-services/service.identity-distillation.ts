/**
 * Identity Warmup — archetype classification + content distillation.
 *
 * Two Claude calls that turn scraped/manual signals into structured identity
 * content: (1) a voice/tone archetype, and (2) the distilled UVP, values,
 * certifications, testimonials, doctors, and services. Output shapes are
 * defended at the boundary (list clamps + source_url discipline).
 *
 * Extracted from service.identity-warmup.ts during a behavior-preserving
 * decomposition — logic, signatures, and return shapes are identical to the
 * originals.
 */

import { runAgent, type CostContext } from "../../../agents/service.llm-runner";
import { loadPrompt } from "../../../agents/service.prompt-loader";
import { cleanForClaude } from "../feature-utils/util.identity-warmup-text";
import type { IdentityLocation } from "./service.identity-locations";
import logger from "../../../lib/logger";

const LOG_PREFIX = "[IdentityWarmup]";

function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `${LOG_PREFIX} ${msg}`);
}

// ---------------------------------------------------------------------------
// ARCHETYPE CLASSIFICATION
// ---------------------------------------------------------------------------

export async function classifyArchetype(
  gbpData: any,
  scrapedPagesRaw: Record<string, string>,
  costContext?: CostContext,
): Promise<{
  archetype: string;
  tone_descriptor: string;
  voice_samples: string[];
}> {
  const prompt = loadPrompt("websiteAgents/builder/ArchetypeClassifier");

  // Build a compact input — GBP category + top reviews + a bit of website content
  const parts: string[] = [];

  if (gbpData?.categoryName) {
    parts.push(`## GBP Category\n${gbpData.categoryName}`);
  }

  const reviews = Array.isArray(gbpData?.reviews)
    ? gbpData.reviews.slice(0, 5)
    : Array.isArray(gbpData?.recentReviews)
      ? gbpData.recentReviews.slice(0, 5)
      : [];
  if (reviews.length > 0) {
    parts.push(
      `## Top Reviews\n${reviews
        .map(
          (r: any) =>
            `- (${r.stars || r.rating}⭐) ${(r.text || "").slice(0, 300)}`,
        )
        .join("\n")}`,
    );
  }

  if (gbpData?.description) {
    parts.push(`## Business Description\n${String(gbpData.description).slice(0, 500)}`);
  }

  // A small amount of website content (first 2000 chars of first scraped page)
  const firstPage = Object.values(scrapedPagesRaw)[0];
  if (firstPage) {
    parts.push(
      `## Website Excerpt\n${cleanForClaude(firstPage).slice(0, 2000)}`,
    );
  }

  if (parts.length === 0) {
    return {
      archetype: "family-friendly",
      tone_descriptor: "warm, professional, approachable",
      voice_samples: [],
    };
  }

  try {
    const result = await runAgent({
      systemPrompt: prompt,
      userMessage: parts.join("\n\n"),
      maxTokens: 1024,
      costContext,
    });

    if (result.parsed) {
      return {
        archetype: result.parsed.archetype || "family-friendly",
        tone_descriptor: result.parsed.tone_descriptor || "warm, professional",
        voice_samples: Array.isArray(result.parsed.voice_samples)
          ? result.parsed.voice_samples
          : [],
      };
    }
  } catch (err: any) {
    log("Archetype classification failed — using default", { error: err.message });
  }

  return {
    archetype: "family-friendly",
    tone_descriptor: "warm, professional, approachable",
    voice_samples: [],
  };
}

// ---------------------------------------------------------------------------
// CONTENT DISTILLATION
// ---------------------------------------------------------------------------

interface DoctorOrServiceEntry {
  name: string;
  source_url: string | null;
  short_blurb: string | null;
  credentials?: string[];
  location_place_ids?: string[];
  last_synced_at: string;
  stale?: boolean;
}

interface DistilledContent {
  unique_value_proposition?: string | null;
  founding_story?: string | null;
  core_values?: string[];
  certifications?: string[];
  service_areas?: string[];
  social_links?: Record<string, string | null>;
  review_themes?: string[];
  featured_testimonials?: Array<{ author: string | null; rating: number | null; text: string | null }>;
  doctors?: DoctorOrServiceEntry[];
  services?: DoctorOrServiceEntry[];
}

async function distillContent(
  scrapedPagesRaw: Record<string, string>,
  userTexts: Array<{ label?: string; text: string }>,
  gbpData: any,
  locations: IdentityLocation[],
  discoveredPageUrls: string[],
  costContext?: CostContext,
): Promise<DistilledContent> {
  const prompt = loadPrompt("websiteAgents/builder/IdentityDistiller");

  const parts: string[] = [];

  if (discoveredPageUrls.length > 0) {
    parts.push(
      `## DISCOVERED PAGES (use ONLY these exact URLs for doctors[].source_url and services[].source_url)\n\n${discoveredPageUrls.map((u) => `- ${u}`).join("\n")}`,
    );
  }

  if (locations.length > 0) {
    const locLines = locations
      .map((l) => {
        const name = l.name || "(unnamed)";
        const addr = l.address || "(no address)";
        const id = l.place_id || l.id || "manual-location";
        return `- ${id} — ${name} — ${addr}`;
      })
      .join("\n");
    parts.push(
      `## LOCATIONS (use these location ids for doctors[].location_place_ids when the doctor is explicitly tied to an office)\n\n${locLines}`,
    );
  }

  if (Object.keys(scrapedPagesRaw).length > 0) {
    const pagesText = Object.entries(scrapedPagesRaw)
      .map(([key, content]) => {
        // Content is already cleaned + capped in warmup step 2. cleanForClaude
        // is a defensive no-op (idempotent on already-clean text) in case a
        // future caller forgets to clean upstream.
        const text = cleanForClaude(content).slice(0, 15000);
        return `### ${key}\n${text}`;
      })
      .join("\n\n");
    parts.push(`## Website Content\n\n${pagesText}`);
  }

  if (userTexts.length > 0) {
    parts.push(
      `## Admin-Provided Notes\n\n${userTexts
        .map((t) => `### ${t.label}\n${t.text}`)
        .join("\n\n")}`,
    );
  }

  if (gbpData) {
    const reviews = Array.isArray(gbpData.reviews)
      ? gbpData.reviews.slice(0, 10)
      : Array.isArray(gbpData.recentReviews)
        ? gbpData.recentReviews.slice(0, 10)
        : [];
    if (reviews.length > 0) {
      parts.push(
        `## GBP Reviews (for themes + testimonials)\n\n${reviews
          .map(
            (r: any) =>
              `- ${r.name || "Anonymous"} (${r.stars || r.rating}⭐): ${(r.text || "").slice(0, 500)}`,
          )
          .join("\n")}`,
      );
    }
  }

  if (parts.length === 0) {
    return {};
  }

  try {
    const result = await runAgent({
      systemPrompt: prompt,
      userMessage: parts.join("\n\n"),
      maxTokens: 4096,
      costContext,
    });

    if (result.parsed) {
      return normalizeDistilled(result.parsed, discoveredPageUrls);
    }
  } catch (err: any) {
    log("Content distillation failed — using empty", { error: err.message });
  }

  return {};
}

const MAX_DOCTORS_SERVICES = 100;
const MAX_BLURB_CHARS = 400;

/**
 * Clamp list shapes + enforce source_url discipline. The LLM is instructed to
 * only emit discovered-pages URLs, but we defend at the boundary.
 */
function normalizeDistilled(
  raw: any,
  discoveredPageUrls: string[],
): DistilledContent {
  const allowedUrls = new Set(discoveredPageUrls);
  const now = new Date().toISOString();

  const doctors = Array.isArray(raw?.doctors)
    ? raw.doctors
        .slice(0, MAX_DOCTORS_SERVICES)
        .map((d: any) => normalizeDoctorEntry(d, allowedUrls, now))
        .filter((d: DoctorOrServiceEntry | null): d is DoctorOrServiceEntry => d !== null)
    : [];

  const services = Array.isArray(raw?.services)
    ? raw.services
        .slice(0, MAX_DOCTORS_SERVICES)
        .map((s: any) => normalizeListEntry(s, allowedUrls, now))
        .filter((s: DoctorOrServiceEntry | null): s is DoctorOrServiceEntry => s !== null)
    : [];

  return {
    unique_value_proposition: raw?.unique_value_proposition ?? null,
    founding_story: raw?.founding_story ?? null,
    core_values: Array.isArray(raw?.core_values) ? raw.core_values : [],
    certifications: Array.isArray(raw?.certifications) ? raw.certifications : [],
    service_areas: Array.isArray(raw?.service_areas) ? raw.service_areas : [],
    social_links: raw?.social_links && typeof raw.social_links === "object" ? raw.social_links : {},
    review_themes: Array.isArray(raw?.review_themes) ? raw.review_themes : [],
    featured_testimonials: Array.isArray(raw?.featured_testimonials)
      ? raw.featured_testimonials
      : [],
    doctors,
    services,
  };
}

function normalizeListEntry(
  entry: any,
  allowedUrls: Set<string>,
  isoNow: string,
): DoctorOrServiceEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const name = typeof entry.name === "string" ? entry.name.trim() : "";
  if (!name) return null;

  const rawUrl = typeof entry.source_url === "string" ? entry.source_url.trim() : null;
  // Null if LLM hallucinated a URL not in the discovered set.
  const source_url = rawUrl && allowedUrls.has(rawUrl) ? rawUrl : null;

  const rawBlurb = typeof entry.short_blurb === "string" ? entry.short_blurb.trim() : null;
  const short_blurb = rawBlurb ? rawBlurb.slice(0, MAX_BLURB_CHARS) : null;

  return {
    name,
    source_url,
    short_blurb,
    last_synced_at: isoNow,
  };
}

/**
 * Doctor-specific normalizer. Preserves optional `credentials[]` and
 * `location_place_ids[]` emitted by the distiller (services entries don't
 * carry these fields).
 */
function normalizeDoctorEntry(
  entry: any,
  allowedUrls: Set<string>,
  isoNow: string,
): DoctorOrServiceEntry | null {
  const base = normalizeListEntry(entry, allowedUrls, isoNow);
  if (!base) return null;

  const credentials = Array.isArray(entry?.credentials)
    ? entry.credentials
        .filter((c: unknown): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c: string) => c.trim())
    : [];

  const location_place_ids = Array.isArray(entry?.location_place_ids)
    ? entry.location_place_ids
        .filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0)
        .map((p: string) => p.trim())
    : [];

  return {
    ...base,
    credentials,
    location_place_ids,
  };
}

/**
 * T5/T6 shared entry point: runs the distillation against already-scraped
 * pages (from `identity.extracted_assets.discovered_pages` + a resurrected
 * scraped_pages_raw map). Used by the re-sync endpoint to re-extract
 * doctors/services WITHOUT re-scraping the site.
 */
export async function extractDoctorsAndServices(
  scrapedPagesRaw: Record<string, string>,
  userTexts: Array<{ label?: string; text: string }>,
  gbpData: any,
  locations: IdentityLocation[],
  discoveredPageUrls: string[],
  costContext?: CostContext,
): Promise<{ doctors: DoctorOrServiceEntry[]; services: DoctorOrServiceEntry[] }> {
  const distilled = await distillContent(
    scrapedPagesRaw,
    userTexts,
    gbpData,
    locations,
    discoveredPageUrls,
    costContext,
  );
  return {
    doctors: distilled.doctors || [],
    services: distilled.services || [],
  };
}

export { distillContent };
export type { DistilledContent, DoctorOrServiceEntry };
