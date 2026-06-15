/**
 * Identity Warmup Pipeline Service
 *
 * Runs the end-to-end enrichment that builds a project's `project_identity`:
 *   1. GBP scrape (optional, via Apify)
 *   2. Multi-URL website scrape (token-conservative cleaning)
 *   3. User-provided text inputs
 *   4. Image collection (GBP + scraped images) → S3 upload → Claude vision analysis
 *   5. Logo download (if provided) → S3 upload → brand.logo_s3_url
 *   6. Archetype classification (1 Claude call)
 *   7. Content distillation (1 Claude call — extracts UVP, values, certifications, etc.)
 *   8. Assembles project_identity JSONB and writes to project row
 *
 * Admin-triggered, not automatic. Brand colors (primary/accent/gradient) are
 * mirrored to legacy project columns for backward compatibility with ~14
 * downstream consumers.
 *
 * Cohesive sub-logic lives in sibling modules (behavior-preserving split):
 *   - feature-utils/util.identity-warmup-text       text cleaning + cap
 *   - feature-utils/util.identity-warmup-concurrency bounded async limiter
 *   - feature-utils/util.identity-warmup-discovery   dental sub-page discovery
 *   - feature-services/service.identity-locations    multi-location assembly
 *   - feature-services/service.identity-distillation archetype + distillation
 */

import axios from "axios";
import { ProjectIdentityModel } from "../../../models/website-builder/ProjectIdentityModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { uploadToS3 } from "../../../utils/core/s3";
import {
  buildMediaS3Key,
  buildS3Url,
} from "../../admin-media/feature-utils/util.s3-helpers";
import {
  scrapeUrlWithEscalation,
  type ScrapeStrategy,
} from "./service.url-scrape-strategies";
import { scrapeGbp } from "../feature-utils/util.gbp-scraper";
import {
  processImages,
  collectImageUrls,
  type ImageAnalysisResult,
} from "../feature-utils/util.image-processor";
import {
  capString,
  cleanForClaude,
} from "../feature-utils/util.identity-warmup-text";
import { runWithConcurrency } from "../feature-utils/util.identity-warmup-concurrency";
import { collectDiscoveredSubPages } from "../feature-utils/util.identity-warmup-discovery";
import {
  buildLocationsArray,
  buildManualLocations,
  type IdentityLocation,
  type ManualLocationInput,
} from "./service.identity-locations";
import {
  classifyArchetype,
  extractDoctorsAndServices,
  distillContent,
} from "./service.identity-distillation";
import logger from "../../../lib/logger";

const LOG_PREFIX = "[IdentityWarmup]";

function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `${LOG_PREFIX} ${msg}`);
}

function checkCancel(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error("Warmup cancelled");
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WarmupUrlInput {
  url: string;
  strategy?: ScrapeStrategy;
}

export interface WarmupInputs {
  /** Primary GBP place_id. When `placeIds` is provided, primary should match its first entry. */
  placeId?: string;
  /**
   * Full set of GBP place_ids to attach to this project (one per physical
   * location). First entry is treated as primary unless overridden by an
   * explicit primary in the controller. Written to `projects.selected_place_ids`.
   */
  placeIds?: string[];
  practiceSearchString?: string;
  /**
   * Accepts either a plain URL string (defaults to "fetch" strategy) or an
   * object specifying the per-URL scrape strategy. Backward-compatible.
   */
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
    text_color?: "white" | "dark";
    preset?: GradientPreset;
  };
}

export interface ManualBusinessInput {
  name?: string;
  category?: string;
  phone?: string;
  websiteUrl?: string;
}

export type GradientPreset =
  | "smooth"
  | "lean-primary"
  | "lean-accent"
  | "soft-lean-primary"
  | "soft-lean-accent"
  | "warm-middle"
  | "quick-transition"
  | "long-transition";

interface IdentityBusiness {
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

interface IdentityBrand {
  primary_color: string | null;
  accent_color: string | null;
  gradient_enabled: boolean;
  gradient_from: string | null;
  gradient_to: string | null;
  gradient_direction: string;
  gradient_text_color: "white" | "dark" | null;
  gradient_preset: GradientPreset | null;
  logo_s3_url: string | null;
  logo_alt_text: string | null;
  fonts: { heading: string; body: string };
}

interface BusinessFallback {
  name: string | null;
  websiteUrl: string | null;
}

// Re-export extracted public surface so existing importers keep working from
// this path (controller calls `extractDoctorsAndServices`; `IdentityLocation`
// and `ManualLocationInput` remain importable here as they were before).
export { extractDoctorsAndServices };
export type { IdentityLocation, ManualLocationInput };

// ---------------------------------------------------------------------------
// PUBLIC: runIdentityWarmup
// ---------------------------------------------------------------------------

export async function runIdentityWarmup(
  projectId: string,
  inputs: WarmupInputs,
  signal?: AbortSignal,
): Promise<void> {
  log("Starting warmup", { projectId });

  // Set status running (column added by Plan A T1? Actually no — warmup_status
  // would be on project_identity itself. For polling, we track status inline
  // in project_identity.meta. Read current first.)
  await ProjectIdentityModel.setWarmupStatus(projectId, "running");

  try {
    checkCancel(signal);

    const project = await ProjectModel.findLocationSelectionById(projectId, [
      "display_name",
      "selected_website_url",
    ]);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // --- 1. GBP scrape ---
    let gbpData: any = null;
    if (inputs.placeId) {
      try {
        gbpData = await scrapeGbp(inputs.placeId, inputs.practiceSearchString, signal);
        log("GBP scrape complete", { placeId: inputs.placeId });
      } catch (err: any) {
        log("GBP scrape failed — continuing", { error: err.message });
      }
    }

    checkCancel(signal);

    // --- 2. Multi-URL website scrape ---
    const scrapedPagesRaw: Record<string, string> = {};
    const scrapedImages: string[] = [];
    const discoveredPages: Array<{
      url: string;
      title: string | null;
      content_excerpt: string | null;
    }> = [];

    // Track the FINAL strategy actually used for each URL (post-escalation),
    // keyed by the original URL so we can persist it in sources_used.urls[].
    const finalStrategyByUrl = new Map<string, ScrapeStrategy>();

    // Raw HTML keyed by original input URL, populated for the primary page
    // (key === "home"). Needed below for the auto-discovery pass that parses
    // <a href> out of the site's homepage markup. Kept OUT of scrapedPagesRaw
    // because that dict stores cleaned/capped text for distillation.
    const rawHtmlByUrl = new Map<string, string>();

    const adminEnteredCount = inputs.urls ? inputs.urls.length : 0;

    if (inputs.urls && inputs.urls.length > 0) {
      const normalizedUrls: WarmupUrlInput[] = inputs.urls.map((u) =>
        typeof u === "string" ? { url: u, strategy: "fetch" } : u,
      );
      for (let i = 0; i < normalizedUrls.length; i++) {
        checkCancel(signal);
        const { url, strategy } = normalizedUrls[i];
        const strat: ScrapeStrategy = strategy || "fetch";
        log(`Scraping url ${i + 1}/${normalizedUrls.length}`, { url, strategy: strat });
        try {
          const result = await scrapeUrlWithEscalation(url, strat, signal);
          finalStrategyByUrl.set(url, result.strategy_used_final);
          if (result.escalations.length > 0) {
            log("URL escalated", {
              url,
              initial: strat,
              final: result.strategy_used_final,
              hops: result.escalations,
            });
          }
          if (result.pages && Object.keys(result.pages).length > 0) {
            for (const [key, content] of Object.entries(result.pages)) {
              // Stash raw HTML for the homepage only — the auto-discovery
              // pass below parses <a href> from this. Non-home keys are rare
              // on current scrape strategies but we guard explicitly.
              if (key === "home") {
                rawHtmlByUrl.set(url, String(content));
              }
              // Clean HTML first, then cap — otherwise we store 50k of
              // framework scaffolding (scripts/styles/hydration markup) and
              // distillation only gets nav/footer text after re-cleaning.
              const cleaned = cleanForClaude(String(content));
              const capped = capString(cleaned);
              scrapedPagesRaw[`${url}#${key}`] = capped;
              discoveredPages.push({
                url: key === "home" ? url : `${url}#${key}`,
                title: key,
                content_excerpt: cleaned.slice(0, 500),
              });
            }
          }
          if (Array.isArray(result.images)) {
            scrapedImages.push(...result.images);
          }
          if (result.was_blocked) {
            log("URL was blocked despite strategy fallback", {
              url,
              strategy: result.strategy_used_final,
            });
          }
        } catch (err: any) {
          log("Website scrape failed", { url, error: err.message });
        }
      }
    }

    checkCancel(signal);

    // --- 2b. Auto-discover dental sub-pages ---
    // Skip if admin explicitly enumerated ≥ 5 URLs (assume intent) or we've
    // already hit the 10-page cap. Same-origin + whitelist + concurrency 3.
    if (
      adminEnteredCount < 5 &&
      Object.keys(scrapedPagesRaw).length < 10 &&
      rawHtmlByUrl.size > 0
    ) {
      const discoveredCandidates = collectDiscoveredSubPages(
        rawHtmlByUrl,
        scrapedPagesRaw,
      );
      const remaining = 10 - Object.keys(scrapedPagesRaw).length;
      const toScrape = discoveredCandidates.slice(0, Math.max(0, remaining));

      if (toScrape.length > 0) {
        log("Auto-discovery candidates", {
          found: discoveredCandidates.length,
          to_scrape: toScrape.length,
          remaining_slots: remaining,
        });

        await runWithConcurrency(toScrape, 3, async (discoveredUrl) => {
          checkCancel(signal);
          try {
            const result = await scrapeUrlWithEscalation(
              discoveredUrl,
              "browser",
              signal,
            );
            finalStrategyByUrl.set(discoveredUrl, result.strategy_used_final);
            if (result.pages && Object.keys(result.pages).length > 0) {
              for (const [key, content] of Object.entries(result.pages)) {
                const cleaned = cleanForClaude(String(content));
                const capped = capString(cleaned);
                scrapedPagesRaw[`${discoveredUrl}#${key}`] = capped;
                discoveredPages.push({
                  url: key === "home" ? discoveredUrl : `${discoveredUrl}#${key}`,
                  title: key,
                  content_excerpt: cleaned.slice(0, 500),
                });
              }
            }
            if (Array.isArray(result.images)) {
              scrapedImages.push(...result.images);
            }
          } catch (err: any) {
            log("Auto-discovered page scrape failed", {
              url: discoveredUrl,
              error: err?.message,
            });
          }
        });

        log("Auto-discovered sub-pages", {
          total_after_discovery: Object.keys(scrapedPagesRaw).length,
          admin_entered: adminEnteredCount,
          discovered_added: toScrape.length,
        });
      }
    }

    checkCancel(signal);

    // --- 3. Text inputs (normalize + cap) ---
    const userTextInputs = (inputs.texts || []).map((t) => ({
      label: t.label || "user_note",
      text: capString(t.text),
    }));

    // --- 3b. Multi-location sweep (runs BEFORE image processing so every
    // GBP's photos feed into the unified vision-analyzed manifest) ---
    const { locations: gbpLocations, secondaryImageUrls } = await buildLocationsArray(
      projectId,
      inputs.placeId,
      gbpData,
      inputs.practiceSearchString,
      signal,
    );
    const manualLocations = buildManualLocations(
      inputs.manualLocations,
      gbpLocations.length === 0,
    );
    const locations = [...gbpLocations, ...manualLocations];
    log("Locations assembled", {
      total: locations.length,
      ready: locations.filter((l) => l.warmup_status === "ready").length,
      failed: locations.filter((l) => l.warmup_status === "failed").length,
      manual: locations.filter((l) => l.source === "manual").length,
      secondary_images: secondaryImageUrls.length,
    });

    checkCancel(signal);

    // --- 4. Image collection + S3 upload + Claude vision analysis ---
    // Unified across: primary GBP, scraped website pages, and every secondary GBP.
    const imageUrls = collectImageUrls(
      gbpData,
      { images: scrapedImages },
      secondaryImageUrls,
    );
    let analyzedImages: ImageAnalysisResult[] = [];
    if (imageUrls.length > 0) {
      analyzedImages = await processImages(projectId, imageUrls, signal);
      log("Image analysis complete", { count: analyzedImages.length });
    }

    checkCancel(signal);

    // --- 5. Logo download (if provided) ---
    let logoS3Url: string | null = null;
    if (inputs.logoUrl) {
      try {
        logoS3Url = await downloadAndHostLogo(projectId, inputs.logoUrl, signal);
        log("Logo hosted", { logoS3Url });
      } catch (err: any) {
        log("Logo download failed — continuing without", { error: err.message });
      }
    } else {
      // Fallback: pick the highest-ranked is_logo image from analysis
      const logoCandidate = analyzedImages.find((img) => img.is_logo);
      if (logoCandidate?.s3_url) {
        logoS3Url = logoCandidate.s3_url;
        log("Logo auto-detected from image analysis", { logoS3Url });
      }
    }

    checkCancel(signal);

    // --- 6. Archetype classification ---
    const archetypeResult = await classifyArchetype(gbpData, scrapedPagesRaw, {
      projectId,
      eventType: "warmup",
      metadata: { stage: "archetype-classify" },
    });
    log("Archetype classified", {
      archetype: archetypeResult.archetype,
    });

    checkCancel(signal);

    // --- 7. Content distillation ---
    const discoveredPageUrls = discoveredPages
      .map((p) => p.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0);
    const distilled = await distillContent(
      scrapedPagesRaw,
      userTextInputs,
      gbpData,
      locations,
      discoveredPageUrls,
      {
        projectId,
        eventType: "warmup",
        metadata: { stage: "content-distill" },
      },
    );
    log("Content distilled", {
      certifications: distilled.certifications?.length || 0,
      testimonials: distilled.featured_testimonials?.length || 0,
      doctors: distilled.doctors?.length || 0,
      services: distilled.services?.length || 0,
    });

    // --- 8. Build identity + persist ---
    const business = buildBusinessFromGbp(
      gbpData,
      inputs.placeId,
      getBusinessFallback(project, inputs),
      inputs.manualBusiness,
      locations,
    );
    const brand = buildBrand(inputs, business.name, logoS3Url);

    // (Locations already assembled in step 3b — reused here in the identity
    // object. `locations` is in scope from that earlier destructure.)

    const identity = {
      version: 1,
      warmed_up_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      sources_used: {
        gbp: inputs.placeId
          ? { place_id: inputs.placeId, scraped_at: new Date().toISOString() }
          : null,
        urls: (inputs.urls || []).map((raw) => {
          const entry: WarmupUrlInput =
            typeof raw === "string" ? { url: raw, strategy: "fetch" } : raw;
          const u = entry.url;
          const initialStrat: ScrapeStrategy = entry.strategy || "fetch";
          const finalStrat = finalStrategyByUrl.get(u) || initialStrat;
          return {
            url: u,
            scraped_at: new Date().toISOString(),
            char_length: Object.entries(scrapedPagesRaw)
              .filter(([k]) => k.startsWith(`${u}#`))
              .reduce((sum, [, content]) => sum + content.length, 0),
            strategy_used_final: finalStrat,
          };
        }),
        text_inputs: userTextInputs.map((t) => ({
          label: t.label,
          char_length: (t.text || "").length,
        })),
        manual:
          inputs.manualBusiness || manualLocations.length > 0
            ? {
                business: inputs.manualBusiness || null,
                locations: manualLocations.map((location) => ({
                  id: location.id,
                  name: location.name,
                  is_primary: location.is_primary,
                })),
              }
            : null,
      },
      business,
      brand,
      voice_and_tone: {
        archetype: archetypeResult.archetype,
        tone_descriptor: archetypeResult.tone_descriptor,
        voice_samples: archetypeResult.voice_samples || [],
      },
      content_essentials: {
        unique_value_proposition: distilled.unique_value_proposition || null,
        founding_story: distilled.founding_story || null,
        core_values: distilled.core_values || [],
        certifications: distilled.certifications || [],
        service_areas: distilled.service_areas || [],
        social_links: distilled.social_links || {},
        review_themes: distilled.review_themes || [],
        featured_testimonials: distilled.featured_testimonials || [],
        doctors: distilled.doctors || [],
        services: distilled.services || [],
      },
      locations,
      extracted_assets: {
        images: analyzedImages,
        discovered_pages: discoveredPages,
      },
      raw_inputs: {
        gbp_raw: gbpData ? JSON.parse(capString(JSON.stringify(gbpData))) : null,
        scraped_pages_raw: scrapedPagesRaw,
        user_text_inputs: userTextInputs,
      },
      meta: {
        warmup_status: "ready",
      },
    };

    // Write to project + mirror colors/logo to legacy columns
    await ProjectIdentityModel.updateByProjectId(
      projectId,
      identity,
      { mirrorBrand: true },
    );

    log("Warmup complete", { projectId });
  } catch (err: any) {
    log("Warmup failed", { projectId, error: err.message });
    await ProjectIdentityModel.setWarmupStatus(projectId, "failed");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function buildBusinessFromGbp(
  gbpData: any,
  fallbackPlaceId: string | undefined,
  fallback: BusinessFallback = { name: null, websiteUrl: null },
  manualBusiness?: ManualBusinessInput,
  locations: IdentityLocation[] = [],
): IdentityBusiness {
  const g = gbpData || {};
  const primaryManualLocation =
    locations.find((location) => location.source === "manual" && location.is_primary) ||
    locations.find((location) => location.source === "manual") ||
    null;
  return {
    name: firstNonEmptyString(g.title, g.name, manualBusiness?.name, primaryManualLocation?.name, fallback.name),
    category: firstNonEmptyString(g.categoryName, g.category, manualBusiness?.category, primaryManualLocation?.category),
    phone: firstNonEmptyString(g.phone, manualBusiness?.phone, primaryManualLocation?.phone),
    address: firstNonEmptyString(g.address, primaryManualLocation?.address),
    city: firstNonEmptyString(g.city, primaryManualLocation?.city),
    state: firstNonEmptyString(g.state, primaryManualLocation?.state),
    zip: firstNonEmptyString(g.postalCode, primaryManualLocation?.zip),
    hours: g.openingHours || primaryManualLocation?.hours || null,
    rating: g.totalScore ?? g.rating ?? null,
    review_count: g.reviewsCount ?? g.reviewCount ?? null,
    website_url: firstNonEmptyString(
      g.website,
      manualBusiness?.websiteUrl,
      primaryManualLocation?.website_url,
      fallback.websiteUrl,
    ),
    place_id: fallbackPlaceId || g.placeId || null,
  };
}

function getBusinessFallback(
  project: { display_name?: string | null; selected_website_url?: string | null },
  inputs: WarmupInputs,
): BusinessFallback {
  return {
    name: firstNonEmptyString(project.display_name, inputs.practiceSearchString),
    websiteUrl: firstNonEmptyString(
      project.selected_website_url,
      getFirstInputUrl(inputs.urls),
    ),
  };
}

function getFirstInputUrl(
  urls: Array<string | WarmupUrlInput> | undefined,
): string | null {
  if (!Array.isArray(urls)) return null;
  for (const entry of urls) {
    const url = typeof entry === "string" ? entry : entry?.url;
    const trimmed = firstNonEmptyString(url);
    if (trimmed) return trimmed;
  }
  return null;
}

function firstNonEmptyString(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function buildBrand(
  inputs: WarmupInputs,
  businessName: string | null,
  logoS3Url: string | null,
): IdentityBrand {
  return {
    primary_color: inputs.primaryColor || null,
    accent_color: inputs.accentColor || null,
    gradient_enabled: inputs.gradient?.enabled ?? false,
    gradient_from: inputs.gradient?.from || null,
    gradient_to: inputs.gradient?.to || null,
    gradient_direction: inputs.gradient?.direction || "to-br",
    gradient_text_color: inputs.gradient?.enabled
      ? inputs.gradient?.text_color || "white"
      : null,
    gradient_preset: inputs.gradient?.enabled
      ? inputs.gradient?.preset || "smooth"
      : null,
    logo_s3_url: logoS3Url,
    logo_alt_text: businessName ? `${businessName} Logo` : null,
    fonts: { heading: "serif", body: "sans" },
  };
}

async function downloadAndHostLogo(
  projectId: string,
  logoUrl: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await axios.get(logoUrl, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "image/*",
    },
    signal,
  });

  const buffer = Buffer.from(response.data);
  const contentType = response.headers["content-type"] || "image/png";
  const ext = contentType.includes("svg")
    ? "svg"
    : contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
  const filename = `logo-${Date.now()}.${ext}`;
  const s3Key = buildMediaS3Key(projectId, filename);

  await uploadToS3(s3Key, buffer, contentType);
  return buildS3Url(s3Key);
}
