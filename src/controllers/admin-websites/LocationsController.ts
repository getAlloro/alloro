/**
 * Admin Websites — Locations Controller
 *
 * Multi-location management for the IdentityModal Locations tab: append,
 * set-primary, remove, and resync — each scrapes GBP and writes into identity.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { ProjectIdentityModel } from "../../models/website-builder/ProjectIdentityModel";
import { getProjectIdentityWarmupStatus, hasUsableIdentityForPageGeneration, parseProjectIdentity, prepareProjectIdentityForSave } from "./feature-utils/util.project-identity";
import { scrapeGbp as locationsScrapeGbp } from "./feature-utils/util.gbp-scraper";
import logger from "../../lib/logger";

/**
 * Local alias for `parseProjectIdentity` (preserved from the original
 * controller, where `parseIdentityJson` was a thin wrapper).
 */
function parseIdentityJson(value: unknown): any {
  return parseProjectIdentity(value);
}

interface LocationsIdentityLocation {
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

function buildLocationEntryFromGbpLocal(
  placeId: string,
  gbpData: any,
  isPrimary: boolean,
): LocationsIdentityLocation {
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

function buildBusinessFromGbpLocal(gbpData: any, fallbackPlaceId: string): any {
  const g = gbpData || {};
  return {
    name: g.title || g.name || null,
    category: g.categoryName || g.category || null,
    phone: g.phone || null,
    address: g.address || null,
    city: g.city || null,
    state: g.state || null,
    zip: g.postalCode || null,
    hours: g.openingHours || null,
    rating: g.totalScore ?? g.rating ?? null,
    review_count: g.reviewsCount ?? g.reviewCount ?? null,
    website_url: g.website || null,
    place_id: fallbackPlaceId || g.placeId || null,
  };
}

/** POST /:id/locations — Append a new location, scrape it, write into identity. */

/** POST /:id/locations — Append a new location, scrape it, write into identity. */
export async function addProjectLocation(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const placeId = (req.body?.place_id || req.body?.placeId || "").toString().trim();

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "place_id is required",
      });
    }

    const project = await ProjectModel.findLocationSelectionById(id, [
      "id",
      "project_identity",
      "selected_place_ids",
      "selected_place_id",
      "primary_place_id",
    ]);

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    const existingIds: string[] = Array.isArray(project.selected_place_ids)
      ? (project.selected_place_ids as string[])
      : [];

    if (existingIds.includes(placeId)) {
      // Already attached — surface a 409 with the current locations array so
      // the UI can refresh without a confusing silent-success.
      const identity = parseIdentityJson(project.project_identity) || {};
      return res.status(409).json({
        success: false,
        error: "DUPLICATE_LOCATION",
        message: "This location is already attached to the project.",
        data: { locations: Array.isArray(identity.locations) ? identity.locations : [] },
      });
    }

    // Hard cap per spec — 20 locations per project.
    if (existingIds.length >= 20) {
      return res.status(409).json({
        success: false,
        error: "LIMIT_EXCEEDED",
        message: "Maximum of 20 locations per project.",
      });
    }

    // Scrape the new location now (synchronously) so the UI can render the
    // entry immediately. Failures still write a stale entry instead of 5xx-ing,
    // matching the multi-location warmup behavior in F2.
    let scraped: any = null;
    let scrapeError: string | null = null;
    try {
      scraped = await locationsScrapeGbp(placeId);
    } catch (err: any) {
      scrapeError = err?.message || "Apify scrape failed";
      logger.warn(
        `[Admin Websites] addProjectLocation: scrape failed for ${placeId}: ${scrapeError}`,
      );
    }

    const identity = parseIdentityJson(project.project_identity) || { version: 1 };
    const locations: LocationsIdentityLocation[] = Array.isArray(identity.locations)
      ? identity.locations
      : [];

    // Brand-new location is never primary by default — admins flip it
    // explicitly via PATCH /locations/primary.
    const newEntry: LocationsIdentityLocation = scraped
      ? buildLocationEntryFromGbpLocal(placeId, scraped, false)
      : {
          id: placeId,
          source: "gbp",
          place_id: placeId,
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
          warmup_error: scrapeError || "Unknown Apify error",
          stale: true,
        };

    const updatedLocations = [...locations, newEntry];
    identity.locations = updatedLocations;
    identity.last_updated_at = new Date().toISOString();

    const updatedSelectedIds = [...existingIds, placeId];

    await ProjectModel.transaction(async (trx) => {
      await ProjectIdentityModel.updateByProjectId(id, identity, {}, trx);
      await ProjectModel.updatePlaceSelectionById(
        id,
        { selected_place_ids: updatedSelectedIds },
        trx,
      );
    });

    return res.json({
      success: true,
      data: {
        locations: updatedLocations,
        added: newEntry,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error adding location:");
    return res.status(500).json({
      success: false,
      error: "ADD_LOCATION_ERROR",
      message: error?.message || "Failed to add location",
    });
  }
}

/** PATCH /:id/locations/primary — Switch the project's primary location. */

/** PATCH /:id/locations/primary — Switch the project's primary location. */
export async function setPrimaryLocation(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const placeId = (req.body?.place_id || req.body?.placeId || "").toString().trim();

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "place_id is required",
      });
    }

    const project = await ProjectModel.findLocationSelectionById(id, [
      "id",
      "project_identity",
      "selected_place_ids",
      "primary_place_id",
    ]);

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    const existingIds: string[] = Array.isArray(project.selected_place_ids)
      ? (project.selected_place_ids as string[])
      : [];

    if (!existingIds.includes(placeId)) {
      return res.status(404).json({
        success: false,
        error: "LOCATION_NOT_FOUND",
        message: "place_id is not attached to this project.",
      });
    }

    const identity = parseIdentityJson(project.project_identity) || { version: 1 };
    const locations: LocationsIdentityLocation[] = Array.isArray(identity.locations)
      ? identity.locations
      : [];

    const newPrimary = locations.find((l) => l.place_id === placeId);
    if (!newPrimary) {
      // place_id is in selected_place_ids but missing from identity.locations[].
      // This is an inconsistent state; we refuse rather than silently rebuilding.
      return res.status(409).json({
        success: false,
        error: "INCONSISTENT_STATE",
        message:
          "Location is attached but missing from identity.locations[]. Re-sync the location first.",
      });
    }

    const updatedLocations = locations.map((l) => ({
      ...l,
      is_primary: l.place_id === placeId,
    }));

    // Rewrite identity.business from the new primary's structured fields so
    // all existing consumers of `identity.business` (prompts, slot prefill,
    // generators) immediately reflect the switch without any refactor.
    const rewrittenBusiness = {
      name: newPrimary.name || null,
      category: newPrimary.category || null,
      phone: newPrimary.phone || null,
      address: newPrimary.address || null,
      city: (identity.business && (identity.business as any).city) || null,
      state: (identity.business && (identity.business as any).state) || null,
      zip: (identity.business && (identity.business as any).zip) || null,
      hours: newPrimary.hours ?? null,
      rating: newPrimary.rating ?? null,
      review_count: newPrimary.review_count ?? null,
      website_url: newPrimary.website_url ?? null,
      place_id: newPrimary.place_id,
    };

    identity.locations = updatedLocations;
    identity.business = rewrittenBusiness;
    identity.last_updated_at = new Date().toISOString();

    await ProjectModel.transaction(async (trx) => {
      await ProjectIdentityModel.updateByProjectId(id, identity, {}, trx);
      await ProjectModel.updatePlaceSelectionById(
        id,
        {
          primary_place_id: placeId,
          // Keep the legacy convenience pointer in sync (back-compat with consumers
          // that still read `selected_place_id`).
          selected_place_id: placeId,
        },
        trx,
      );
    });

    return res.json({
      success: true,
      data: {
        identity,
        primary_place_id: placeId,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error setting primary location:");
    return res.status(500).json({
      success: false,
      error: "SET_PRIMARY_ERROR",
      message: error?.message || "Failed to set primary location",
    });
  }
}

/** DELETE /:id/locations/:place_id — Remove a non-primary location. */

/** DELETE /:id/locations/:place_id — Remove a non-primary location. */
export async function removeProjectLocation(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id, place_id: rawPlaceId } = req.params;
    const placeId = (rawPlaceId || "").toString().trim();

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "place_id path param is required",
      });
    }

    const project = await ProjectModel.findLocationSelectionById(id, [
      "id",
      "project_identity",
      "selected_place_ids",
      "selected_place_id",
      "primary_place_id",
    ]);

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    if (project.primary_place_id === placeId) {
      return res.status(409).json({
        success: false,
        error: "CANNOT_REMOVE_PRIMARY",
        message:
          "Cannot remove the primary location. Set another location as primary first.",
      });
    }

    const existingIds: string[] = Array.isArray(project.selected_place_ids)
      ? (project.selected_place_ids as string[])
      : [];

    const identity = parseIdentityJson(project.project_identity) || { version: 1 };
    const locations: LocationsIdentityLocation[] = Array.isArray(identity.locations)
      ? identity.locations
      : [];

    const updatedLocations = locations.filter((l) => l.place_id !== placeId);
    const updatedSelectedIds = existingIds.filter((p) => p !== placeId);

    identity.locations = updatedLocations;
    identity.last_updated_at = new Date().toISOString();

    await ProjectModel.transaction(async (trx) => {
      await ProjectIdentityModel.updateByProjectId(id, identity, {}, trx);
      await ProjectModel.updatePlaceSelectionById(
        id,
        { selected_place_ids: updatedSelectedIds },
        trx,
      );
    });

    return res.json({
      success: true,
      data: {
        locations: updatedLocations,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error removing location:");
    return res.status(500).json({
      success: false,
      error: "REMOVE_LOCATION_ERROR",
      message: error?.message || "Failed to remove location",
    });
  }
}

/** POST /:id/locations/:place_id/resync — Re-scrape a single location. */

/** POST /:id/locations/:place_id/resync — Re-scrape a single location. */
export async function resyncProjectLocation(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id, place_id: rawPlaceId } = req.params;
    const placeId = (rawPlaceId || "").toString().trim();

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "place_id path param is required",
      });
    }

    const project = await ProjectModel.findLocationSelectionById(id, [
      "id",
      "project_identity",
      "selected_place_ids",
      "primary_place_id",
    ]);

    if (!project) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    const existingIds: string[] = Array.isArray(project.selected_place_ids)
      ? (project.selected_place_ids as string[])
      : [];

    if (!existingIds.includes(placeId)) {
      return res.status(404).json({
        success: false,
        error: "LOCATION_NOT_FOUND",
        message: "place_id is not attached to this project.",
      });
    }

    const identity = parseIdentityJson(project.project_identity) || { version: 1 };
    const locations: LocationsIdentityLocation[] = Array.isArray(identity.locations)
      ? identity.locations
      : [];

    const wasPrimary = project.primary_place_id === placeId;

    let scraped: any = null;
    let scrapeError: string | null = null;
    try {
      scraped = await locationsScrapeGbp(placeId);
    } catch (err: any) {
      scrapeError = err?.message || "Apify scrape failed";
      logger.warn(
        `[Admin Websites] resyncProjectLocation: scrape failed for ${placeId}: ${scrapeError}`,
      );
    }

    const updatedEntry: LocationsIdentityLocation = scraped
      ? buildLocationEntryFromGbpLocal(placeId, scraped, wasPrimary)
      : {
          id: placeId,
          source: "gbp",
          place_id: placeId,
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
          is_primary: wasPrimary,
          warmup_status: "failed",
          warmup_error: scrapeError || "Unknown Apify error",
          stale: true,
        };

    // Replace just this entry, preserve order.
    const idx = locations.findIndex((l) => l.place_id === placeId);
    const updatedLocations =
      idx === -1 ? [...locations, updatedEntry] : locations.map((l, i) => (i === idx ? updatedEntry : l));

    identity.locations = updatedLocations;

    // If we re-synced the primary AND the scrape succeeded, refresh
    // identity.business too so admins don't see stale primary data.
    if (wasPrimary && scraped) {
      identity.business = buildBusinessFromGbpLocal(scraped, placeId);
    }

    identity.last_updated_at = new Date().toISOString();

    await ProjectIdentityModel.updateByProjectId(id, identity);

    return res.json({
      success: true,
      data: {
        location: updatedEntry,
        locations: updatedLocations,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error re-syncing location:");
    return res.status(500).json({
      success: false,
      error: "RESYNC_LOCATION_ERROR",
      message: error?.message || "Failed to re-sync location",
    });
  }
}

// =====================================================================
// IDENTITY — slice PATCH
// =====================================================================
//
// `PATCH /:id/identity/slice` — surgical edit for a single allow-listed
// section of `project_identity`. Replaces the slice wholesale (no deep merge)
// after per-slice Zod validation.
//
// See `plans/04202026-no-ticket-identity-modal-cleanup-and-crud/spec.md` T3.
