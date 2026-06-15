/**
 * Identity Warmup — multi-location assembly.
 *
 * Builds `identity.locations[]` for a project: the primary entry reuses the
 * already-scraped primary GBP data, and non-primary entries are scraped in
 * parallel (concurrency 3) via Apify. Also normalizes admin-entered manual
 * locations. DB reads stay in ProjectModel; Apify calls go through scrapeGbp.
 *
 * Extracted from service.identity-warmup.ts during a behavior-preserving
 * decomposition — logic, signatures, and return shapes are identical to the
 * originals.
 */

import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { scrapeGbp } from "../feature-utils/util.gbp-scraper";
import { runWithConcurrency } from "../feature-utils/util.identity-warmup-concurrency";
import logger from "../../../lib/logger";

const LOG_PREFIX = "[IdentityWarmup]";

function log(msg: string, data?: Record<string, unknown>): void {
  logger.info({ detail: data ? JSON.stringify(data) : "" }, `${LOG_PREFIX} ${msg}`);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManualLocationInput {
  id?: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  websiteUrl?: string;
  hours?: Record<string, string>;
  isPrimary?: boolean;
}

export interface IdentityLocation {
  id?: string;
  source?: "gbp" | "manual";
  place_id: string | null;
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

// ---------------------------------------------------------------------------
// Manual-location input normalization
// ---------------------------------------------------------------------------

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isCompleteManualLocationInput(
  location: ManualLocationInput,
): boolean {
  if (!location || typeof location !== "object") return false;
  return (
    !!normalizeText(location.name) &&
    !!normalizeText(location.address) &&
    !!normalizeText(location.city) &&
    !!normalizeText(location.state) &&
    !!normalizeText(location.zip) &&
    !!normalizeText(location.phone) &&
    hasManualHours(location.hours)
  );
}

function hasManualHours(hours: ManualLocationInput["hours"]): boolean {
  return (
    !!hours &&
    typeof hours === "object" &&
    Object.values(hours).some((value) => normalizeText(value) !== null)
  );
}

function normalizeManualHours(
  hours: ManualLocationInput["hours"],
): Record<string, string> | null {
  if (!hours || typeof hours !== "object") return null;
  const normalized: Record<string, string> = {};
  for (const [day, value] of Object.entries(hours)) {
    const text = normalizeText(value);
    if (text) normalized[day] = text;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function getManualLocationId(
  location: ManualLocationInput,
  index: number,
): string {
  const existing = normalizeText(location.id);
  if (existing) return existing;
  const basis = [
    location.name,
    location.address,
    location.city,
    location.state,
    location.zip,
  ]
    .map((value) => normalizeText(value))
    .filter((value): value is string => !!value)
    .join(" ");
  const slug = basis
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `manual-${slug || `location-${index + 1}`}`;
}

// ---------------------------------------------------------------------------
// MULTI-LOCATION
// ---------------------------------------------------------------------------

function buildLocationEntryFromGbp(
  placeId: string,
  gbpData: any,
  isPrimary: boolean,
): IdentityLocation {
  const g = gbpData || {};
  return {
    id: placeId,
    source: "gbp",
    place_id: placeId,
    name: g.title || g.name || "",
    address: g.address || null,
    city: g.city || null,
    state: g.state || null,
    zip: g.postalCode || null,
    phone: g.phone || null,
    rating: (g.totalScore ?? g.rating ?? null) as number | null,
    review_count: (g.reviewsCount ?? g.reviewCount ?? null) as number | null,
    category: g.categoryName || g.category || null,
    website_url: g.website || null,
    hours: g.openingHours || null,
    last_synced_at: new Date().toISOString(),
    is_primary: isPrimary,
    warmup_status: "ready",
  };
}

export function buildManualLocations(
  manualLocations: ManualLocationInput[] | undefined,
  shouldMarkFirstPrimary: boolean,
): IdentityLocation[] {
  if (!Array.isArray(manualLocations)) return [];

  const validLocations = manualLocations.filter(isCompleteManualLocationInput);
  const explicitPrimaryIndex = validLocations.findIndex((location) => location.isPrimary);

  return validLocations.map((location, index) => {
    const isPrimary = explicitPrimaryIndex >= 0
      ? index === explicitPrimaryIndex
      : shouldMarkFirstPrimary && index === 0;
    const id = getManualLocationId(location, index);

    return {
      id,
      source: "manual",
      place_id: null,
      name: normalizeText(location.name) || "",
      address: normalizeText(location.address),
      city: normalizeText(location.city),
      state: normalizeText(location.state),
      zip: normalizeText(location.zip),
      phone: normalizeText(location.phone),
      rating: null,
      review_count: null,
      category: null,
      website_url: normalizeText(location.websiteUrl),
      hours: normalizeManualHours(location.hours),
      last_synced_at: new Date().toISOString(),
      is_primary: isPrimary,
      warmup_status: "ready",
    };
  });
}

/**
 * Assemble `identity.locations[]` for the project.
 *
 * The primary entry reuses the already-scraped `gbpData` (no extra Apify
 * call). Non-primary entries are scraped in parallel with a concurrency
 * limit of 3. On per-location Apify errors the entry is still written with
 * warmup_status = "failed" + stale=true so the UI can surface a retry path.
 */
export async function buildLocationsArray(
  projectId: string,
  primaryPlaceIdFromInputs: string | undefined,
  primaryGbpData: any,
  practiceSearchString: string | undefined,
  signal: AbortSignal | undefined,
): Promise<{ locations: IdentityLocation[]; secondaryImageUrls: string[] }> {
  const project = await ProjectModel.findLocationSelectionById(projectId, [
    "selected_place_ids",
    "primary_place_id",
    "selected_place_id",
  ]);

  const rawIds = Array.isArray(project?.selected_place_ids)
    ? (project.selected_place_ids as string[])
    : [];
  const fallbackPrimary =
    project?.primary_place_id ||
    primaryPlaceIdFromInputs ||
    project?.selected_place_id ||
    null;

  // Normalize: if selected_place_ids is empty, fall back to [primary].
  let allIds: string[] = rawIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (allIds.length === 0 && fallbackPrimary) {
    allIds = [fallbackPrimary];
  }
  if (allIds.length === 0) {
    // No place_ids anywhere — return empty locations array.
    return { locations: [], secondaryImageUrls: [] };
  }

  // De-dupe while preserving order.
  const seen = new Set<string>();
  allIds = allIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const primaryId = fallbackPrimary && allIds.includes(fallbackPrimary)
    ? fallbackPrimary
    : allIds[0];

  const results: Array<IdentityLocation | null> = new Array(allIds.length).fill(null);

  // Primary slot: reuse the already-scraped GBP data we got during step 1 if
  // it's for the primary place. If no GBP scrape happened (no placeId passed
  // to warmup inputs, or it failed), we still emit a pending-ish entry so the
  // array isn't empty.
  for (let i = 0; i < allIds.length; i++) {
    const id = allIds[i];
    if (id !== primaryId) continue;
    if (primaryGbpData) {
      results[i] = buildLocationEntryFromGbp(id, primaryGbpData, true);
    } else {
      // We couldn't scrape the primary (warmup ran without a placeId, or the
      // scrape failed). Mark the entry pending so the UI shows it needs a
      // retry; do not throw — warmup overall still succeeded on other signals.
      results[i] = {
        id,
        source: "gbp",
        place_id: id,
        name: "",
        address: null,
        city: null,
        state: null,
        zip: null,
        phone: null,
        rating: null,
        review_count: null,
        category: null,
        website_url: null,
        hours: null,
        last_synced_at: new Date().toISOString(),
        is_primary: true,
        warmup_status: "failed",
        warmup_error: "Primary GBP scrape did not return data",
        stale: true,
      };
    }
  }

  // Non-primary slots: scrape in parallel, concurrency 3.
  const secondaryIndices = allIds
    .map((id, i) => ({ id, i }))
    .filter(({ id }) => id !== primaryId);

  // Accumulate GBP image URLs from every secondary scrape so the caller
  // can feed them into the unified image pipeline.
  const secondaryImageUrls: string[] = [];

  await runWithConcurrency(secondaryIndices, 3, async ({ id, i }) => {
    try {
      const scraped = await scrapeGbp(id, practiceSearchString, signal);
      if (!scraped) {
        results[i] = {
          id,
          source: "gbp",
          place_id: id,
          name: "",
          address: null,
          city: null,
          state: null,
          zip: null,
          phone: null,
          rating: null,
          review_count: null,
          category: null,
          website_url: null,
          hours: null,
          last_synced_at: new Date().toISOString(),
          is_primary: false,
          warmup_status: "failed",
          warmup_error: "No GBP data returned for place_id",
          stale: true,
        };
        return;
      }
      results[i] = buildLocationEntryFromGbp(id, scraped, false);
      if (Array.isArray(scraped?.imageUrls)) {
        for (const u of scraped.imageUrls) {
          if (typeof u === "string" && u.length > 0) secondaryImageUrls.push(u);
        }
      }
    } catch (err: any) {
      log("Location scrape failed", { placeId: id, error: err?.message });
      results[i] = {
        id,
        source: "gbp",
        place_id: id,
        name: "",
        address: null,
        city: null,
        state: null,
        zip: null,
        phone: null,
        rating: null,
        review_count: null,
        category: null,
        website_url: null,
        hours: null,
        last_synced_at: new Date().toISOString(),
        is_primary: false,
        warmup_status: "failed",
        warmup_error: err?.message || "Unknown Apify error",
        stale: true,
      };
    }
  });

  return {
    locations: results.filter((r): r is IdentityLocation => r !== null),
    secondaryImageUrls,
  };
}
