/**
 * Admin Websites — Project Detail Controller (identity)
 *
 * Project identity warmup (enqueue), get/status/update, and resync — plus the
 * local No-GBP warmup-completeness helpers.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import * as identityWarmup from "./feature-services/service.identity-warmup";
import { getWbQueue } from "../../workers/wb-queues";
import type { IdentityWarmupJobData } from "../../workers/processors/identityWarmup.processor";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { ProjectIdentityModel } from "../../models/website-builder/ProjectIdentityModel";
import { getProjectIdentityWarmupStatus, hasUsableIdentityForPageGeneration, parseProjectIdentity, prepareProjectIdentityForSave } from "./feature-utils/util.project-identity";
import logger from "../../lib/logger";

/** POST /:id/identity/warmup — Enqueue identity warmup job */
export async function startIdentityWarmup(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const {
      placeId,
      placeIds,
      practiceSearchString,
      urls,
      texts,
      logoUrl,
      primaryColor,
      accentColor,
      gradient,
      manualBusiness,
      manualLocations,
    } = req.body;

    // Normalize multi-GBP selection. The frontend may send `placeIds` (full
    // list) and optionally `placeId` (explicit primary). Fall back to the
    // single-place legacy path when `placeIds` is absent.
    const normalizedPlaceIds: string[] = Array.isArray(placeIds)
      ? placeIds.filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    const resolvedPrimary: string | null =
      (typeof placeId === "string" && placeId.trim()) ||
      normalizedPlaceIds[0] ||
      null;
    const fullIdList: string[] =
      normalizedPlaceIds.length > 0
        ? normalizedPlaceIds
        : resolvedPrimary
          ? [resolvedPrimary]
          : [];

    if (
      fullIdList.length === 0 &&
      !hasCompleteNoGbpWarmupData(manualBusiness, manualLocations)
    ) {
      return res.status(400).json({
        success: false,
        error: "IDENTITY_SOURCE_REQUIRED",
        message:
          "Select at least one Google Business Profile, or provide No GBP data with business name, category, phone, and one complete location including hours.",
      });
    }

    // Reset cancel flag + persist selected_place_ids / primary_place_id BEFORE
    // enqueueing the worker so F2's multi-location loop picks them up.
    const projectUpdates: Record<string, unknown> = {
      generation_cancel_requested: false,
    };
    if (fullIdList.length > 0) {
      projectUpdates.selected_place_ids = fullIdList;
      projectUpdates.primary_place_id = resolvedPrimary;
      // Back-compat mirror for legacy consumers of the singular column.
      projectUpdates.selected_place_id = resolvedPrimary;
    } else {
      projectUpdates.selected_place_ids = [];
      projectUpdates.primary_place_id = null;
      projectUpdates.selected_place_id = null;
    }
    await ProjectModel.updateFieldsById(id, projectUpdates);

    const jobData: IdentityWarmupJobData = {
      projectId: id,
      inputs: {
        placeId: resolvedPrimary || undefined,
        placeIds: fullIdList.length > 0 ? fullIdList : undefined,
        practiceSearchString,
        urls,
        texts,
        logoUrl,
        primaryColor,
        accentColor,
        gradient,
        manualBusiness,
        manualLocations,
      },
    };

    const queue = getWbQueue("identity-warmup");
    await queue.add("warmup", jobData, {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 25 },
    });

    // Set immediate status so polling reflects queued state.
    await ProjectIdentityModel.setWarmupStatus(id, "queued");

    logger.info(`[Admin Websites] Enqueued wb-identity-warmup for project ${id}`);

    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error starting identity warmup:");
    return res.status(500).json({
      success: false,
      error: "WARMUP_ERROR",
      message: error?.message || "Failed to start warmup",
    });
  }
}

function hasCompleteNoGbpWarmupData(
  manualBusiness: unknown,
  manualLocations: unknown,
): boolean {
  const business =
    manualBusiness && typeof manualBusiness === "object"
      ? (manualBusiness as Record<string, unknown>)
      : null;
  if (
    !business ||
    !hasText(business.name) ||
    !hasText(business.category) ||
    !hasText(business.phone)
  ) {
    return false;
  }

  return (
    Array.isArray(manualLocations) &&
    manualLocations.some((location) => {
      if (!location || typeof location !== "object") return false;
      const l = location as Record<string, unknown>;
      return (
        hasText(l.name) &&
        hasText(l.address) &&
        hasText(l.city) &&
        hasText(l.state) &&
        hasText(l.zip) &&
        hasText(l.phone) &&
        hasHours(l.hours)
      );
    })
  );
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasHours(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(hasText);
}

/** GET /:id/identity — Get full project identity JSON */

/** GET /:id/identity — Get full project identity JSON */
export async function getIdentity(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { exists, identity } =
      await ProjectIdentityModel.findEnvelopeByProjectId(id);

    if (!exists) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    return res.json({
      success: true,
      data: identity,
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching identity:");
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message,
    });
  }
}

/** GET /:id/identity/status — Lightweight polling for warmup progress */

/** GET /:id/identity/status — Lightweight polling for warmup progress */
export async function getIdentityStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { exists, identity } =
      await ProjectIdentityModel.findEnvelopeByProjectId(id);

    if (!exists) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    return res.json({
      success: true,
      data: {
        warmup_status: getProjectIdentityWarmupStatus(identity),
        warmed_up_at: identity?.warmed_up_at || null,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching identity status:");
    return res.status(500).json({ success: false, error: "FETCH_ERROR" });
  }
}

/** PUT /:id/identity — Replace identity with admin-edited JSON */

/** PUT /:id/identity — Replace identity with admin-edited JSON */
export async function updateIdentity(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { identity } = req.body;

    if (!identity || typeof identity !== "object") {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "identity object required",
      });
    }

    prepareProjectIdentityForSave(identity);
    await ProjectIdentityModel.updateByProjectId(
      id,
      identity,
      { mirrorBrand: true },
    );

    return res.json({ success: true, data: identity });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error updating identity:");
    return res.status(500).json({
      success: false,
      error: "UPDATE_ERROR",
      message: error?.message,
    });
  }
}

/**
 * POST /:id/identity/resync-list — Manual re-sync of identity.content_essentials.{doctors|services}.
 *
 * Body: `{ list: "doctors" | "services" }`.
 * Query: `?rescrape=true` (optional) — currently logs a notice and continues with
 * cached `raw_inputs.scraped_pages_raw`. Full re-scrape is a follow-up.
 *
 * Behavior:
 *  - Re-runs the same distillation pipeline against the already-scraped content.
 *  - Replaces the targeted list with freshly-stamped entries.
 *  - Existing entries whose `name` (case-insensitive) is missing from the new set
 *    are preserved with `stale: true` so admins retain history.
 */

/**
 * POST /:id/identity/resync-list — Manual re-sync of identity.content_essentials.{doctors|services}.
 *
 * Body: `{ list: "doctors" | "services" }`.
 * Query: `?rescrape=true` (optional) — currently logs a notice and continues with
 * cached `raw_inputs.scraped_pages_raw`. Full re-scrape is a follow-up.
 *
 * Behavior:
 *  - Re-runs the same distillation pipeline against the already-scraped content.
 *  - Replaces the targeted list with freshly-stamped entries.
 *  - Existing entries whose `name` (case-insensitive) is missing from the new set
 *    are preserved with `stale: true` so admins retain history.
 */
export async function resyncIdentityList(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { list } = req.body || {};
    const rescrape = String(req.query.rescrape || "") === "true";

    if (list !== "doctors" && list !== "services") {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: 'list must be "doctors" or "services"',
      });
    }

    const { exists, identity } =
      await ProjectIdentityModel.findEnvelopeByProjectId(id);
    if (!exists) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    if (!identity) {
      return res.status(409).json({
        success: false,
        error: "NO_IDENTITY",
        message: "Project has no identity — run warmup first.",
      });
    }

    const rawInputs = identity.raw_inputs || {};
    const scrapedPagesRaw: Record<string, string> =
      rawInputs.scraped_pages_raw && typeof rawInputs.scraped_pages_raw === "object"
        ? (rawInputs.scraped_pages_raw as Record<string, string>)
        : {};
    const userTextInputs: Array<{ label?: string; text: string }> = Array.isArray(
      rawInputs.user_text_inputs,
    )
      ? rawInputs.user_text_inputs
      : [];
    const gbpRaw = rawInputs.gbp_raw || null;

    const discoveredPages: Array<{ url?: string | null }> = Array.isArray(
      identity.extracted_assets?.discovered_pages,
    )
      ? identity.extracted_assets.discovered_pages
      : [];
    const discoveredPageUrls = discoveredPages
      .map((p) => p?.url)
      .filter((u): u is string => typeof u === "string" && u.length > 0);

    if (rescrape) {
      logger.warn(
        `[Admin Websites] resync-list ?rescrape=true requested for project ${id} — re-scrape path not yet implemented; using cached pages.`,
      );
    }

    if (Object.keys(scrapedPagesRaw).length === 0 && discoveredPageUrls.length === 0) {
      return res.status(409).json({
        success: false,
        error: "NO_SOURCE_CONTENT",
        message:
          "No cached scraped pages or discovered pages on identity — re-run a full warmup before re-syncing this list.",
      });
    }

    const identityLocations = Array.isArray(identity.locations)
      ? identity.locations.filter(
          (l: any) =>
            l && typeof l.place_id === "string" && l.place_id.length > 0,
        )
      : [];

    const { doctors, services } = await identityWarmup.extractDoctorsAndServices(
      scrapedPagesRaw,
      userTextInputs,
      gbpRaw,
      identityLocations,
      discoveredPageUrls,
      {
        projectId: id,
        eventType: "identity-resync",
        metadata: { stage: "content-distill", list },
      },
    );

    identity.content_essentials = identity.content_essentials || {};
    const existingList: Array<{
      name: string;
      source_url: string | null;
      short_blurb: string | null;
      last_synced_at: string;
      stale?: boolean;
    }> = Array.isArray(identity.content_essentials[list])
      ? identity.content_essentials[list]
      : [];

    const freshList = list === "doctors" ? doctors : services;
    const freshNames = new Set(freshList.map((e) => e.name.trim().toLowerCase()));

    // Carry over entries that dropped out of the fresh extraction, marked stale.
    const stragglers = existingList
      .filter((e) => e && typeof e.name === "string" && !freshNames.has(e.name.trim().toLowerCase()))
      .map((e) => ({ ...e, stale: true }));

    const merged = [...freshList, ...stragglers];

    identity.content_essentials[list] = merged;
    identity.last_updated_at = new Date().toISOString();

    await ProjectIdentityModel.updateByProjectId(id, identity);

    return res.json({
      success: true,
      data: {
        list,
        entries: merged,
        refreshed_count: freshList.length,
        stale_count: stragglers.length,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error re-syncing identity list:");
    return res.status(500).json({
      success: false,
      error: "RESYNC_ERROR",
      message: error?.message || "Failed to re-sync identity list",
    });
  }
}

// =====================================================================
// PER-COMPONENT REGENERATE
// =====================================================================

/** POST /:id/pages/:pageId/regenerate-component — Regenerate a single section */
