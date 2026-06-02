/**
 * PracticeRankingController
 *
 * HTTP handler layer for practice ranking endpoints.
 * Named function exports (not class-based) per project convention.
 *
 * Thin controller that handles:
 * - Request parsing and validation
 * - Delegating business logic to feature services
 * - Response formatting via feature-utils
 * - Error handling
 *
 * 12 endpoints:
 * - POST /trigger - Start batch ranking analysis
 * - GET /batch/:batchId/status - Batch status (in-memory + DB fallback)
 * - GET /status/:id - Single ranking status
 * - GET /results/:id - Full ranking results
 * - GET /list - List rankings with filters
 * - GET /accounts - List onboarded accounts with GBP locations
 * - DELETE /batch/:batchId - Delete batch + in-memory cleanup
 * - DELETE /:id - Delete single ranking
 * - POST /refresh-competitors - Invalidate competitor cache
 * - GET /latest - Latest rankings for client dashboard
 * - GET /tasks - Approved ranking tasks
 * (webhook endpoint removed — LLM analysis now runs inline via Claude)
 */

import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../database/connection";
import { resolveLocationId } from "../../utils/locationResolver";
import { parseJsonField } from "./feature-utils/util.json-parser";
import { log, logError } from "./feature-utils/util.ranking-logger";
import {
  validateTriggerRequest,
  validateLocations,
  validateRefreshCompetitors,
  validateRankingId,
  validateTasksRequest,
} from "./feature-utils/util.ranking-validator";
import {
  formatTriggerResponse,
  formatLegacyTriggerResponse,
  formatInMemoryBatchStatus,
  formatDbBatchStatus,
  formatRankingStatus,
  formatFullResults,
  formatRankingsList,
  formatAccountsList,
  formatLatestRanking,
  formatLegacyLatestRanking,
  formatTasksList,
} from "./feature-utils/util.ranking-formatter";
import * as batchTracker from "./feature-services/service.batch-status-tracker";
import * as competitorService from "./feature-services/service.competitor-analysis";
import { processBatch } from "./feature-services/service.ranking-computation";
import {
  processLocationRanking,
  MAX_RETRIES,
  RETRY_DELAY_MS,
} from "./feature-services/service.ranking-pipeline";
import {
  runDiscoveryForLocation,
  previewDiscoveryCandidatesForLocation,
  previewManualCompetitorForLocation,
  getDefaultComparisonSpecialtyForLocation,
  COMPARISON_SPECIALTY_PAYLOAD_OPTIONS,
  addCustomCompetitor,
  removeCompetitorFromList,
  finalizeAndTriggerRun,
  reselectCompetitorsAndTriggerRun,
} from "./feature-services/service.location-competitor-onboarding";
import {
  type ILocationCompetitor,
  LocationCompetitorModel,
} from "../../models/LocationCompetitorModel";
import { LocationModel } from "../../models/LocationModel";
import { getPlacePhotoMedia } from "../places/feature-services/GooglePlacesApiService";
import {
  validateLocationIdParam,
  validatePlaceIdInput,
  validateDiscoveryRadiusMeters,
  DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS,
  MAX_COMPETITORS_PER_LOCATION,
} from "./feature-utils/util.competitor-validator";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";
import type { RBACRequest } from "../../middleware/rbac";

// =====================================================================
// POST /trigger
// =====================================================================

export async function triggerBatchAnalysis(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { googleAccountId, locations } = req.body;

    const validation = validateTriggerRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json(validation.error);
    }

    // Validate account exists and get org domain
    const account = await db("google_connections as gc")
      .leftJoin("organizations as o", "gc.organization_id", "o.id")
      .where("gc.id", googleAccountId)
      .select(
        "gc.id",
        "gc.organization_id",
        "gc.google_property_ids",
        "o.domain as org_domain",
        "o.name as org_name",
        "o.archived_at as org_archived_at",
      )
      .first();

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "ACCOUNT_NOT_FOUND",
        message: `Account ${googleAccountId} not found`,
      });
    }

    if (account.org_archived_at) {
      return res.status(423).json({
        success: false,
        error: "ORGANIZATION_ARCHIVED",
        message: "Archived organizations cannot start ranking analysis.",
      });
    }

    const propertyIds = parseJsonField(account.google_property_ids);

    // Handle new multi-location format
    if (locations && Array.isArray(locations) && locations.length > 0) {
      const locValidation = validateLocations(
        locations,
        propertyIds?.gbp,
      );
      if (!locValidation.valid) {
        return res.status(400).json(locValidation.error);
      }

      // Generate batch ID
      const batchId = uuidv4();

      log(
        `Starting batch ${batchId} for ${locations.length} locations in account ${googleAccountId}`,
      );

      // Create ALL ranking records upfront with "pending" status
      // This ensures the frontend can see all locations immediately when the trigger returns
      // Note: specialty/location will be auto-determined during processing via Identifier Agent
      const organizationId = account.organization_id || null;
      const rankingIds: number[] = [];
      for (let i = 0; i < locations.length; i++) {
        const locationInput = locations[i];
        const locationId = await resolveLocationId(organizationId, locationInput.gbpLocationId);
        const [result] = await db("practice_rankings")
          .insert({
            organization_id: organizationId,
            location_id: locationId,
            specialty: locationInput.specialty || null,
            location: locationInput.marketLocation || null,
            gbp_account_id: locationInput.gbpAccountId,
            gbp_location_id: locationInput.gbpLocationId,
            gbp_location_name: locationInput.gbpLocationName,
            batch_id: batchId,
            observed_at: new Date(),
            status: "pending",
            run_reason: "manual",
            include_in_summary_recommendations: true,
            status_detail: JSON.stringify({
              currentStep: "queued",
              message: "Waiting in queue...",
              progress: 0,
              stepsCompleted: [],
              timestamps: { created_at: new Date().toISOString() },
            }),
            created_at: new Date(),
            updated_at: new Date(),
          })
          .returning("id");
        rankingIds.push(result.id);
      }

      log(
        `[Batch ${batchId}] Created ${rankingIds.length} ranking records upfront`,
      );

      // Start background batch processing (records already created)
      setImmediate(() => {
        processBatch(
          batchId,
          googleAccountId,
          locations,
          account.org_domain || "",
          rankingIds,
          true, // recordsPreCreated
          account.organization_id, // actual org ID, not connection row ID
        ).catch((err) => {
          logError(`Background batch process ${batchId}`, err);
        });
      });

      return res.json(formatTriggerResponse(batchId, locations, rankingIds));
    }

    // Handle legacy single-location format (backward compatibility)
    const { specialty, location } = req.body;
    if (!specialty || !location) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message:
          "Either 'locations' array or 'specialty' and 'location' are required",
      });
    }

    // Use first GBP location for legacy format
    const firstGbp = propertyIds?.gbp?.[0];
    if (!firstGbp) {
      return res.status(400).json({
        success: false,
        error: "NO_GBP",
        message: "Account has no GBP locations configured",
      });
    }

    const legacyLocations = [
      {
        gbpAccountId: firstGbp.accountId,
        gbpLocationId: firstGbp.locationId,
        gbpLocationName: firstGbp.displayName,
        specialty: specialty,
        marketLocation: location,
      },
    ];

    const batchId = uuidv4();

    // Start background batch processing (legacy: creates records inside)
    setImmediate(() => {
      processBatch(
        batchId,
        googleAccountId,
        legacyLocations,
        account.org_domain || "",
        [], // no pre-created IDs
        false, // recordsPreCreated = false for legacy
        account.organization_id, // actual org ID, not connection row ID
      ).catch((err) => {
        logError(`Background batch process ${batchId}`, err);
      });
    });

    return res.json(formatLegacyTriggerResponse(batchId));
  } catch (error: any) {
    logError("POST /trigger", error);
    return res.status(500).json({
      success: false,
      error: "TRIGGER_ERROR",
      message: error.message || "Failed to start analysis",
    });
  }
}

// =====================================================================
// GET /batch/:batchId/status
// =====================================================================

export async function getBatchStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { batchId } = req.params;

    // Check in-memory status first (for active batches)
    const inMemoryStatus = batchTracker.getStatus(batchId);

    if (inMemoryStatus) {
      return res.json(formatInMemoryBatchStatus(inMemoryStatus));
    }

    // Fall back to database query
    const rankings = await db("practice_rankings")
      .where({ batch_id: batchId })
      .select(
        "id",
        "gbp_location_id",
        "gbp_location_name",
        "status",
        "status_detail",
        "rank_score",
        "rank_position",
        "error_message",
        "created_at",
        "updated_at",
      )
      .orderBy("created_at", "asc");

    if (rankings.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Batch ${batchId} not found`,
      });
    }

    return res.json(formatDbBatchStatus(batchId, rankings));
  } catch (error: any) {
    logError("GET /batch/:batchId/status", error);
    return res.status(500).json({
      success: false,
      error: "BATCH_STATUS_ERROR",
      message: error.message || "Failed to get batch status",
    });
  }
}

// =====================================================================
// GET /status/:id
// =====================================================================

export async function getRankingStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;

    const ranking = await db("practice_rankings")
      .where({ id: parseInt(id) })
      .first();

    if (!ranking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Ranking ${id} not found`,
      });
    }

    return res.json(formatRankingStatus(ranking));
  } catch (error: any) {
    logError("GET /status/:id", error);
    return res.status(500).json({
      success: false,
      error: "STATUS_ERROR",
      message: error.message || "Failed to get status",
    });
  }
}

// =====================================================================
// GET /results/:id
// =====================================================================

export async function getRankingResults(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;

    const ranking = await db("practice_rankings")
      .where({ id: parseInt(id) })
      .first();

    if (!ranking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Ranking ${id} not found`,
      });
    }

    return res.json(formatFullResults(ranking));
  } catch (error: any) {
    logError("GET /results/:id", error);
    return res.status(500).json({
      success: false,
      error: "RESULTS_ERROR",
      message: error.message || "Failed to get results",
    });
  }
}

// =====================================================================
// GET /list
// =====================================================================

export async function listRankings(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { organization_id, location_id, limit = 20, offset = 0 } = req.query;

    let query = db("practice_rankings as pr")
      .leftJoin("organizations as o", "pr.organization_id", "o.id")
      .leftJoin("locations as l", "pr.location_id", "l.id")
      .select(
        "pr.id",
        "pr.organization_id",
        "pr.location_id",
        "o.name as organization_name",
        "l.name as location_name",
        "pr.specialty",
        "pr.location",
        "pr.rank_keywords",
        "pr.gbp_location_id",
        "pr.gbp_location_name",
        "pr.batch_id",
        "pr.status",
        "pr.rank_score",
        "pr.rank_position",
        "pr.total_competitors",
        "pr.search_city",
        "pr.search_state",
        "pr.search_county",
        "pr.search_postal_code",
        "pr.created_at",
        "pr.updated_at",
      )
      .orderBy("pr.created_at", "desc")
      .limit(Number(limit))
      .offset(Number(offset));

    if (organization_id) {
      query = query.where({ "pr.organization_id": Number(organization_id) });
    }

    if (location_id) {
      query = query.where({ "pr.location_id": Number(location_id) });
    }

    const rankings = await query;

    return res.json(formatRankingsList(rankings));
  } catch (error: any) {
    logError("GET /list", error);
    return res.status(500).json({
      success: false,
      error: "LIST_ERROR",
      message: error.message || "Failed to list rankings",
    });
  }
}

// =====================================================================
// GET /accounts
// =====================================================================

export async function listAccounts(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const accounts = await db("google_connections as gc")
      .join("organizations as o", "gc.organization_id", "o.id")
      .where("o.onboarding_completed", true)
      .whereNull("o.archived_at")
      .select(
        "gc.id",
        "gc.google_property_ids",
        "o.name as org_name",
        "o.domain as org_domain",
      )
      .orderBy("o.name", "asc");

    const formattedAccounts = accounts.map((a) => {
      const propertyIds = parseJsonField(a.google_property_ids);

      const rawGbp = propertyIds?.gbp || [];
      if (rawGbp.length > 0) {
        log(
          `Account ${a.id} (${
            a.org_name
          }) GBP locations raw structure: ${JSON.stringify(rawGbp[0])}`,
        );
      }

      const gbpLocations: Array<{
        accountId: string;
        locationId: string;
        displayName: string;
        address?: string;
      }> = (propertyIds?.gbp || []).map((gbp: any) => ({
        accountId: gbp.accountId,
        locationId: gbp.locationId,
        displayName:
          gbp.displayName || gbp.name || gbp.title || "Unknown Location",
        address: gbp.address || gbp.storefrontAddress?.addressLines?.[0],
      }));

      return {
        id: a.id,
        domain: a.org_domain,
        practiceName: a.org_name,
        hasGbp: gbpLocations.length > 0,
        gbpLocations: gbpLocations,
        gbpCount: gbpLocations.length,
      };
    });

    return res.json(formatAccountsList(formattedAccounts));
  } catch (error: any) {
    logError("GET /accounts", error);
    return res.status(500).json({
      success: false,
      error: "ACCOUNTS_ERROR",
      message: error.message || "Failed to list accounts",
    });
  }
}

// =====================================================================
// DELETE /batch/:batchId
// =====================================================================

export async function deleteBatch(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { batchId } = req.params;

    if (!batchId) {
      return res.status(400).json({
        success: false,
        error: "INVALID_BATCH_ID",
        message: "Batch ID is required",
      });
    }

    // Check if batch exists
    const rankings = await db("practice_rankings")
      .where({ batch_id: batchId })
      .select("id", "status");

    if (rankings.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Batch ${batchId} not found`,
      });
    }

    // Delete all rankings in the batch
    const deletedCount = await db("practice_rankings")
      .where({ batch_id: batchId })
      .del();

    // Clean up in-memory batch status if present
    batchTracker.clearStatus(batchId);

    log(`Deleted batch ${batchId} (${deletedCount} rankings)`);

    return res.json({
      success: true,
      message: `Batch deleted successfully`,
      deletedCount: deletedCount,
      batchId: batchId,
    });
  } catch (error: any) {
    logError("DELETE /batch/:batchId", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_BATCH_ERROR",
      message: error.message || "Failed to delete batch",
    });
  }
}

// =====================================================================
// DELETE /:id
// =====================================================================

export async function deleteRanking(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const rankingId = parseInt(id);

    const idValidation = validateRankingId(id);
    if (!idValidation.valid) {
      return res.status(400).json(idValidation.error);
    }

    // Check if ranking exists
    const ranking = await db("practice_rankings")
      .where({ id: rankingId })
      .first();

    if (!ranking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Ranking ${id} not found`,
      });
    }

    // Delete the ranking
    await db("practice_rankings").where({ id: rankingId }).del();

    log(`Deleted ranking analysis ${rankingId}`);

    return res.json({
      success: true,
      message: `Ranking ${id} deleted successfully`,
    });
  } catch (error: any) {
    logError("DELETE /:id", error);
    return res.status(500).json({
      success: false,
      error: "DELETE_ERROR",
      message: error.message || "Failed to delete ranking",
    });
  }
}

// =====================================================================
// POST /refresh-competitors
// =====================================================================

export async function refreshCompetitors(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { specialty, location } = req.body;

    const validation = validateRefreshCompetitors({ specialty, location });
    if (!validation.valid) {
      return res.status(400).json(validation.error);
    }

    const wasInvalidated = await competitorService.invalidateCache(
      specialty,
      location,
    );

    return res.json({
      success: true,
      message: wasInvalidated
        ? "Competitor cache invalidated. Next analysis will discover fresh competitors."
        : "No cache found for this specialty+location. Next analysis will discover competitors.",
      invalidated: wasInvalidated,
    });
  } catch (error: any) {
    logError("POST /refresh-competitors", error);
    return res.status(500).json({
      success: false,
      error: "REFRESH_ERROR",
      message: error.message || "Failed to refresh competitors",
    });
  }
}

// =====================================================================
// POST /retry/:id
// =====================================================================

export async function retryRanking(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const rankingId = parseInt(id);

    if (isNaN(rankingId)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_ID",
        message: "Invalid ranking ID",
      });
    }

    const ranking = await db("practice_rankings")
      .where({ id: rankingId })
      .first();

    if (!ranking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Ranking ${id} not found`,
      });
    }

    if (ranking.status === "pending" || ranking.status === "processing") {
      return res.status(409).json({
        success: false,
        error: "ALREADY_RUNNING",
        message: `Ranking ${id} is currently ${ranking.status}`,
      });
    }

    // Look up google_property to get connection_id for OAuth
    const gbpProperty = await GooglePropertyModel.findByExternalId(
      ranking.gbp_location_id,
    );
    if (!gbpProperty) {
      return res.status(400).json({
        success: false,
        error: "NO_GBP_PROPERTY",
        message: `GBP property ${ranking.gbp_location_id} not found`,
      });
    }

    // Get org domain
    const org = await db("organizations")
      .where({ id: ranking.organization_id })
      .select("domain")
      .first();
    const domain = org?.domain || "";

    // Reset record
    await db("practice_rankings").where({ id: rankingId }).update({
      status: "pending",
      run_reason: "retry",
      error_message: null,
      status_detail: JSON.stringify({
        currentStep: "queued",
        message: "Queued for retry...",
        progress: 0,
        stepsCompleted: [],
        timestamps: { retry_queued_at: new Date().toISOString() },
      }),
      updated_at: new Date(),
    });

    log(`Retry queued for ranking ${rankingId}`);

    // Background processing
    setImmediate(() => {
      (async () => {
        const specialty = ranking.specialty || "orthodontist";
        const marketLocation = ranking.location || "Unknown, US";

        await db("practice_rankings").where({ id: rankingId }).update({
          status: "processing",
          status_detail: JSON.stringify({
            currentStep: "starting",
            message: "Starting retry analysis...",
            progress: 5,
            stepsCompleted: ["queued"],
            timestamps: { started_at: new Date().toISOString() },
          }),
        });

        try {
          await processLocationRanking(
            rankingId,
            gbpProperty.google_connection_id,
            ranking.gbp_account_id,
            ranking.gbp_location_id,
            ranking.gbp_location_name,
            specialty,
            marketLocation,
            domain,
            ranking.batch_id,
            log,
          );
          log(`Retry completed for ranking ${rankingId}`);
        } catch (err: any) {
          log(`Retry failed for ranking ${rankingId}: ${err.message}`);
          await db("practice_rankings").where({ id: rankingId }).update({
            status: "failed",
            error_message: `Retry failed: ${err.message}`,
            updated_at: new Date(),
          });
        }
      })().catch((err) => {
        logError(`retryRanking background ${rankingId}`, err);
      });
    });

    return res.json({ success: true, rankingId, message: "Retry queued" });
  } catch (error: any) {
    logError("POST /retry/:id", error);
    return res.status(500).json({
      success: false,
      error: "RETRY_ERROR",
      message: error.message || "Failed to retry ranking",
    });
  }
}

// =====================================================================
// POST /retry-batch/:batchId
// =====================================================================

export async function retryBatch(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { batchId } = req.params;

    const rankings = await db("practice_rankings")
      .where({ batch_id: batchId });

    if (rankings.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: `Batch ${batchId} not found`,
      });
    }

    // Soft retry: only re-run failed/completed, skip pending/processing
    const retryable = rankings.filter(
      (r: any) => r.status === "failed" || r.status === "completed",
    );
    const skipped = rankings.filter(
      (r: any) => r.status === "pending" || r.status === "processing",
    );

    if (retryable.length === 0) {
      return res.status(400).json({
        success: false,
        error: "NOTHING_TO_RETRY",
        message:
          "No failed or completed rankings to retry in this batch",
      });
    }

    // Reset retryable records
    const retryableIds = retryable.map((r: any) => r.id);
    await db("practice_rankings").whereIn("id", retryableIds).update({
      status: "pending",
      run_reason: "retry",
      error_message: null,
      status_detail: JSON.stringify({
        currentStep: "queued",
        message: "Queued for batch retry...",
        progress: 0,
        stepsCompleted: [],
        timestamps: { retry_queued_at: new Date().toISOString() },
      }),
      updated_at: new Date(),
    });

    log(
      `Batch retry queued for ${batchId}: ${retryable.length} retryable, ${skipped.length} skipped`,
    );

    // Background processing
    setImmediate(() => {
      (async () => {
        for (const ranking of retryable) {
          const gbpProperty = await GooglePropertyModel.findByExternalId(
            ranking.gbp_location_id,
          );
          if (!gbpProperty) {
            log(
              `Skipping ranking ${ranking.id}: GBP property not found`,
            );
            await db("practice_rankings")
              .where({ id: ranking.id })
              .update({
                status: "failed",
                error_message: "GBP property not found for retry",
                updated_at: new Date(),
              });
            continue;
          }

          const org = await db("organizations")
            .where({ id: ranking.organization_id })
            .select("domain")
            .first();
          const domain = org?.domain || "";
          const specialty = ranking.specialty || "orthodontist";
          const marketLocation = ranking.location || "Unknown, US";

          await db("practice_rankings")
            .where({ id: ranking.id })
            .update({
              status: "processing",
              status_detail: JSON.stringify({
                currentStep: "starting",
                message: "Starting retry analysis...",
                progress: 5,
                stepsCompleted: ["queued"],
                timestamps: { started_at: new Date().toISOString() },
              }),
            });

          let success = false;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              if (attempt > 1) {
                log(
                  `Retry attempt ${attempt}/${MAX_RETRIES} for ranking ${ranking.id}`,
                );
                await new Promise((resolve) =>
                  setTimeout(resolve, RETRY_DELAY_MS),
                );
              }

              await processLocationRanking(
                ranking.id,
                gbpProperty.google_connection_id,
                ranking.gbp_account_id,
                ranking.gbp_location_id,
                ranking.gbp_location_name,
                specialty,
                marketLocation,
                domain,
                ranking.batch_id,
                log,
              );

              success = true;
              break;
            } catch (err: any) {
              log(
                `Batch retry attempt ${attempt} failed for ranking ${ranking.id}: ${err.message}`,
              );
              if (attempt === MAX_RETRIES) {
                await db("practice_rankings")
                  .where({ id: ranking.id })
                  .update({
                    status: "failed",
                    error_message: `Batch retry failed: ${err.message}`,
                    updated_at: new Date(),
                  });
              }
            }
          }

          if (success) {
            log(`Batch retry completed for ranking ${ranking.id}`);
          }
        }

        log(`Batch retry completed for ${batchId}`);
      })().catch((err) => {
        logError(`retryBatch background ${batchId}`, err);
      });
    });

    return res.json({
      success: true,
      batchId,
      retryCount: retryable.length,
      skippedCount: skipped.length,
      message: `Retry queued for ${retryable.length} location(s)${
        skipped.length > 0
          ? `, ${skipped.length} still in progress`
          : ""
      }`,
    });
  } catch (error: any) {
    logError("POST /retry-batch/:batchId", error);
    return res.status(500).json({
      success: false,
      error: "RETRY_BATCH_ERROR",
      message: error.message || "Failed to retry batch",
    });
  }
}

// =====================================================================
// GET /latest
// =====================================================================

type CompetitorAddressLookup = Map<string, string | null>;

function addCompetitorAddressesToSnapshot(
  ranking: any,
  addressesByPlaceId?: CompetitorAddressLookup,
) {
  if (!addressesByPlaceId || !ranking.competitor_snapshot) return ranking;

  const snapshot = parseJsonField(ranking.competitor_snapshot);
  if (!Array.isArray(snapshot?.competitors)) return ranking;

  return {
    ...ranking,
    competitor_snapshot: {
      ...snapshot,
      competitors: snapshot.competitors.map((competitor: any) => {
        const address =
          competitor.address ??
          (typeof competitor.placeId === "string"
            ? addressesByPlaceId.get(competitor.placeId)
            : null) ??
          null;

        return {
          ...competitor,
          address,
        };
      }),
    },
  };
}

export async function getLatestRankings(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { googleAccountId, locationId } = req.query;

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message: "googleAccountId is required",
      });
    }

    // Build base filters for location scoping
    const baseFilters: Record<string, unknown> = {
      organization_id: Number(googleAccountId),
      status: "completed",
    };
    if (locationId) {
      baseFilters.location_id = Number(locationId);
    }

    // Step 1: Find the most recent batch_id with completed rankings for this account
    const latestBatchRecord = await db("practice_rankings")
      .where(baseFilters)
      .whereNotNull("batch_id")
      .orderBy("created_at", "desc")
      .first()
      .select("batch_id");

    if (!latestBatchRecord || !latestBatchRecord.batch_id) {
      // Fall back to legacy: get latest ranking without batch_id (old format)
      const legacyRanking = await db("practice_rankings")
        .where(baseFilters)
        .whereNull("batch_id")
        .orderBy("created_at", "desc")
        .first();

      if (!legacyRanking) {
        return res.status(404).json({
          success: false,
          error: "NOT_FOUND",
          message: "No completed ranking found for this account",
        });
      }

      // Return legacy single ranking in array format for consistency
      return res.json({
        success: true,
        rankings: [formatLegacyLatestRanking(legacyRanking)],
      });
    }

    const latestBatchId = latestBatchRecord.batch_id;
    log(
      `[GET /latest] Found latest batch: ${latestBatchId} for account ${googleAccountId}${locationId ? ` location ${locationId}` : ""}`,
    );

    // Step 2: Get completed rankings from the latest batch (optionally filtered by location)
    const batchRankings = await db("practice_rankings")
      .where({
        ...baseFilters,
        batch_id: latestBatchId,
      })
      .orderBy("created_at", "asc");

    if (batchRankings.length === 0) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "No completed rankings found in the latest batch",
      });
    }

    log(
      `[GET /latest] Found ${batchRankings.length} rankings in batch ${latestBatchId}`,
    );

    // Step 3a: Batch-fetch v2 onboarding metadata for the distinct location_ids
    // in this batch. Used by the dashboard to render the "set up your competitor
    // list" banner for pending/curating locations.
    // Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
    const distinctLocationIds = Array.from(
      new Set(
        batchRankings
          .map((r) => r.location_id)
          .filter((id): id is number => typeof id === "number")
      )
    );
    const onboardingByLocationId = new Map<
      number,
      { status: "pending" | "curating" | "finalized"; finalizedAt: Date | null }
    >();
    if (distinctLocationIds.length > 0) {
      const locationRows = await db("locations")
        .whereIn("id", distinctLocationIds)
        .select(
          "id",
          "location_competitor_onboarding_status",
          "location_competitor_onboarding_finalized_at"
        );
      for (const row of locationRows) {
        onboardingByLocationId.set(row.id, {
          status: row.location_competitor_onboarding_status,
          finalizedAt: row.location_competitor_onboarding_finalized_at ?? null,
        });
      }
    }

    const competitorAddressesByLocationId = new Map<
      number,
      CompetitorAddressLookup
    >();
    await Promise.all(
      distinctLocationIds.map(async (id) => {
        const competitors =
          await LocationCompetitorModel.findActiveByLocationId(id);
        competitorAddressesByLocationId.set(
          id,
          new Map(
            competitors.map((competitor) => [
              competitor.place_id,
              competitor.address,
            ]),
          ),
        );
      }),
    );

    // Step 3b: For each ranking in the batch, get the previous analysis for trend comparison
    const rankingsWithPrevious = await Promise.all(
      batchRankings.map(async (ranking) => {
        // Get the previous completed ranking for this location (excluding current batch)
        const previous = await db("practice_rankings")
          .where({
            organization_id: Number(googleAccountId),
            gbp_location_id: ranking.gbp_location_id,
            status: "completed",
          })
          .whereNot({ batch_id: latestBatchId })
          .orderBy("created_at", "desc")
          .first();

        const onboarding = ranking.location_id
          ? onboardingByLocationId.get(ranking.location_id) || null
          : null;
        const rankingWithAddresses = addCompetitorAddressesToSnapshot(
          ranking,
          ranking.location_id
            ? competitorAddressesByLocationId.get(ranking.location_id)
            : undefined,
        );

        return formatLatestRanking(
          rankingWithAddresses,
          previous || null,
          onboarding,
        );
      }),
    );

    return res.json({
      success: true,
      batchId: latestBatchId,
      rankings: rankingsWithPrevious,
    });
  } catch (error: any) {
    logError("GET /latest", error);
    return res.status(500).json({
      success: false,
      error: "LATEST_ERROR",
      message: error.message || "Failed to get latest rankings",
    });
  }
}

// =====================================================================
// GET /history
// =====================================================================

export async function getRankingHistory(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { googleAccountId, locationId, range } = req.query;

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message: "googleAccountId is required",
      });
    }

    const orgId = Number(googleAccountId);
    if (!Number.isFinite(orgId) || orgId <= 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PARAMS",
        message: "googleAccountId must be a positive integer",
      });
    }

    let locId: number | null = null;
    if (locationId !== undefined && locationId !== null && locationId !== "") {
      locId = Number(locationId);
      if (!Number.isFinite(locId) || locId <= 0) {
        return res.status(400).json({
          success: false,
          error: "INVALID_PARAMS",
          message: "locationId must be a positive integer",
        });
      }
    }

    const rangeStr = typeof range === "string" ? range : "6m";
    const months = rangeStr === "3m" ? 3 : 6;
    const intervalLiteral = months === 3 ? "3 months" : "6 months";

    let query = db("practice_rankings")
      .where({
        organization_id: orgId,
        status: "completed",
      })
      .andWhereRaw(`observed_at >= NOW() - INTERVAL '${intervalLiteral}'`)
      .orderBy("observed_at", "asc")
      .select(
        "observed_at",
        "rank_score",
        "rank_position",
        "search_position",
        "ranking_factors",
      );

    if (locId !== null) {
      query = query.andWhere({ location_id: locId });
    }

    const rows = await query;

    const rankings = rows.map((row: any) => {
      const parsed = parseJsonField(row.ranking_factors) as
        | Record<string, { score?: number } | number | null>
        | null;
      const factorScores: Record<string, number> = {};
      if (parsed && typeof parsed === "object") {
        for (const [name, val] of Object.entries(parsed)) {
          if (val && typeof val === "object" && "score" in val) {
            const s = (val as { score?: unknown }).score;
            if (typeof s === "number" && Number.isFinite(s)) {
              factorScores[name] = s;
            }
          } else if (typeof val === "number" && Number.isFinite(val)) {
            factorScores[name] = val;
          }
        }
      }

      return {
        observedAt:
          row.observed_at instanceof Date
            ? row.observed_at.toISOString()
            : row.observed_at,
        rankScore: row.rank_score === null ? 0 : Number(row.rank_score),
        rankPosition:
          row.rank_position === null ? 0 : Number(row.rank_position),
        searchPosition:
          row.search_position === null || row.search_position === undefined
            ? null
            : Number(row.search_position),
        factorScores,
      };
    });

    return res.json({
      success: true,
      rankings,
    });
  } catch (error: any) {
    logError("GET /history", error);
    return res.status(500).json({
      success: false,
      error: "HISTORY_ERROR",
      message: error.message || "Failed to get ranking history",
    });
  }
}

// =====================================================================
// GET /tasks
// =====================================================================

export async function getRankingTasks(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { practiceRankingId, googleAccountId, gbpLocationId } = req.query;

    log(
      `[Tasks] Fetching approved ranking tasks with params: ${JSON.stringify(
        req.query,
      )}`,
    );

    const validation = validateTasksRequest(req.query);
    if (!validation.valid) {
      return res.status(400).json(validation.error);
    }

    let tasks: any[] = [];

    if (practiceRankingId) {
      // Fetch tasks for specific practice ranking
      tasks = await db("tasks")
        .where({
          agent_type: "RANKING",
          is_approved: true,
        })
        .whereRaw("metadata::jsonb->>'practice_ranking_id' = ?", [
          String(practiceRankingId),
        ])
        .whereNot({ status: "archived" })
        .orderBy("created_at", "asc")
        .select("*");
    } else if (googleAccountId && gbpLocationId) {
      // Find the latest completed ranking for this location
      const latestRanking = await db("practice_rankings")
        .where({
          organization_id: Number(googleAccountId),
          gbp_location_id: String(gbpLocationId),
          status: "completed",
        })
        .orderBy("created_at", "desc")
        .first();

      if (latestRanking) {
        // Fetch tasks for this ranking
        tasks = await db("tasks")
          .where({
            agent_type: "RANKING",
            is_approved: true,
          })
          .whereRaw("metadata::jsonb->>'practice_ranking_id' = ?", [
            String(latestRanking.id),
          ])
          .whereNot({ status: "archived" })
          .orderBy("created_at", "asc")
          .select("*");
      }
    } else if (googleAccountId) {
      // Fetch all approved ranking tasks for this account (across all locations)
      tasks = await db("tasks")
        .where({
          organization_id: Number(googleAccountId),
          agent_type: "RANKING",
          is_approved: true,
        })
        .whereNot({ status: "archived" })
        .orderBy("created_at", "asc")
        .select("*");
    }

    log(`[Tasks] Found ${tasks.length} approved ranking tasks`);

    return res.json(formatTasksList(tasks));
  } catch (error: any) {
    logError("GET /tasks", error);
    return res.status(500).json({
      success: false,
      error: "TASKS_ERROR",
      message: error.message || "Failed to fetch ranking tasks",
    });
  }
}

// =====================================================================
// v2 Curated Competitor Lists — location-scoped client endpoints
// Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
// =====================================================================

function formatLocationCompetitor(c: ILocationCompetitor) {
  return {
    id: c.id,
    placeId: c.place_id,
    name: c.name,
    address: c.address,
    primaryType: c.primary_type,
    rating: c.rating === null ? null : Number(c.rating),
    reviewCount: c.review_count,
    lat: c.lat === null ? null : Number(c.lat),
    lng: c.lng === null ? null : Number(c.lng),
    phone: c.phone,
    website: c.website,
    photoName: c.photo_name,
    discoveryPosition: c.discovery_position,
    discoveryQuery: c.discovery_query,
    discoverySource: c.discovery_source,
    discoveryCheckedAt: c.discovery_checked_at,
    discoveryRadiusMeters: c.discovery_radius_meters,
    profileStrengthScore:
      c.profile_strength_score === null
        ? null
        : Number(c.profile_strength_score),
    profileStrengthTier: c.profile_strength_tier,
    profileStrengthFactors: c.profile_strength_factors,
    source: c.source,
    addedAt: c.added_at,
    addedByUserId: c.added_by_user_id,
  };
}

function readComparisonSpecialtyInput(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim().length > 0
    ? raw.trim()
    : undefined;
}

// GET /locations/:locationId/competitors
export async function getLocationCompetitors(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const v = validateLocationIdParam(req.params.locationId);
    if (!v.valid) return res.status(v.status).json(v.body);
    const locationId = Number(req.params.locationId);

    const [onboarding, competitors, location] = await Promise.all([
      LocationCompetitorModel.getOnboardingStatus(locationId),
      LocationCompetitorModel.findActiveByLocationId(locationId),
      LocationModel.findById(locationId),
    ]);
    const comparisonSpecialty =
      await getDefaultComparisonSpecialtyForLocation(locationId);

    const practiceLocation =
      location?.client_place_id &&
      location.client_lat !== null &&
      location.client_lng !== null
        ? {
            placeId: location.client_place_id,
            lat: Number(location.client_lat),
            lng: Number(location.client_lng),
          }
        : null;

    return res.json({
      success: true,
      onboarding: {
        status: onboarding.status,
        finalizedAt: onboarding.finalizedAt,
      },
      practiceLocation,
      selfFilterStatus: location?.client_place_id ? "resolved" : "unresolved",
      competitorDiscoveryRadiusMeters:
        location?.competitor_discovery_radius_meters ??
        DEFAULT_COMPETITOR_DISCOVERY_RADIUS_METERS,
      comparisonSpecialty,
      comparisonSpecialtyOptions: COMPARISON_SPECIALTY_PAYLOAD_OPTIONS,
      competitors: competitors.map(formatLocationCompetitor),
      count: competitors.length,
      cap: MAX_COMPETITORS_PER_LOCATION,
    });
  } catch (error: any) {
    logError("GET /locations/:locationId/competitors", error);
    return res.status(500).json({
      success: false,
      error: "GET_COMPETITORS_ERROR",
      message: error.message || "Failed to load competitors",
    });
  }
}

// POST /locations/:locationId/competitors/discover
export async function discoverLocationCompetitors(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const v = validateLocationIdParam(req.params.locationId);
    if (!v.valid) return res.status(v.status).json(v.body);
    const locationId = Number(req.params.locationId);
    const radiusV = validateDiscoveryRadiusMeters(req.body?.radiusMeters);
    if (!radiusV.valid) return res.status(radiusV.status).json(radiusV.body);

    const result = await runDiscoveryForLocation(
      locationId,
      req.body?.radiusMeters === undefined ? undefined : radiusV.radiusMeters,
      readComparisonSpecialtyInput(req.body?.comparisonSpecialty)
    );
    return res.json({ success: true, ...result });
  } catch (error: any) {
    logError("POST /locations/:locationId/competitors/discover", error);
    if (
      typeof error?.message === "string" &&
      error.message.includes("already finalized")
    ) {
      return res.status(409).json({
        success: false,
        error: "LOCATION_FINALIZED",
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "DISCOVERY_ERROR",
      message: error.message || "Discovery failed",
    });
  }
}

// POST /locations/:locationId/competitors/discover-candidates
export async function previewLocationCompetitorDiscovery(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const v = validateLocationIdParam(req.params.locationId);
    if (!v.valid) return res.status(v.status).json(v.body);
    const radiusV = validateDiscoveryRadiusMeters(req.body?.radiusMeters);
    if (!radiusV.valid) return res.status(radiusV.status).json(radiusV.body);

    const locationId = Number(req.params.locationId);
    const result = await previewDiscoveryCandidatesForLocation(
      locationId,
      req.body?.radiusMeters === undefined ? undefined : radiusV.radiusMeters,
      readComparisonSpecialtyInput(req.body?.comparisonSpecialty)
    );
    return res.json({ success: true, ...result });
  } catch (error: any) {
    logError(
      "POST /locations/:locationId/competitors/discover-candidates",
      error
    );
    if (error?.code === "INVALID_DISCOVERY_RADIUS") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "DISCOVERY_PREVIEW_ERROR",
      message: error.message || "Failed to refresh competitor suggestions",
    });
  }
}

// POST /locations/:locationId/competitors/preview-place
export async function previewLocationCompetitorPlace(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const locV = validateLocationIdParam(req.params.locationId);
    if (!locV.valid) return res.status(locV.status).json(locV.body);
    const placeV = validatePlaceIdInput(req.body?.placeId);
    if (!placeV.valid) return res.status(placeV.status).json(placeV.body);
    const radiusV = validateDiscoveryRadiusMeters(req.body?.radiusMeters);
    if (!radiusV.valid) return res.status(radiusV.status).json(radiusV.body);

    const locationId = Number(req.params.locationId);
    const result = await previewManualCompetitorForLocation(
      locationId,
      String(req.body.placeId).trim(),
      req.body?.radiusMeters === undefined ? undefined : radiusV.radiusMeters,
      readComparisonSpecialtyInput(req.body?.comparisonSpecialty)
    );

    return res.json({ success: true, ...result });
  } catch (error: any) {
    logError(
      "POST /locations/:locationId/competitors/preview-place",
      error
    );
    if (error?.code === "PLACES_LOOKUP_FAILED") {
      return res.status(502).json({
        success: false,
        error: "PLACES_LOOKUP_FAILED",
        message: error.message,
      });
    }
    if (error?.code === "INVALID_DISCOVERY_RADIUS") {
      return res.status(400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "COMPETITOR_PREVIEW_ERROR",
      message: error.message || "Failed to measure competitor profile",
    });
  }
}

// POST /locations/:locationId/competitors  (body: { placeId })
export async function addLocationCompetitor(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const locV = validateLocationIdParam(req.params.locationId);
    if (!locV.valid) return res.status(locV.status).json(locV.body);
    const placeV = validatePlaceIdInput(req.body?.placeId);
    if (!placeV.valid) return res.status(placeV.status).json(placeV.body);

    const locationId = Number(req.params.locationId);
    const placeId = String(req.body.placeId).trim();
    const userId = (req as RBACRequest).userId ?? null;

    const result = await addCustomCompetitor(locationId, placeId, userId);
    return res.json({
      success: true,
      added: formatLocationCompetitor(result.added),
      activeCount: result.activeCount,
      cap: MAX_COMPETITORS_PER_LOCATION,
    });
  } catch (error: any) {
    logError("POST /locations/:locationId/competitors", error);
    if (error?.code === "COMPETITOR_CAP_REACHED") {
      return res.status(409).json({
        success: false,
        error: "COMPETITOR_CAP_REACHED",
        message: error.message,
      });
    }
    if (error?.code === "PLACES_LOOKUP_FAILED") {
      return res.status(502).json({
        success: false,
        error: "PLACES_LOOKUP_FAILED",
        message: error.message,
      });
    }
    if (
      typeof error?.message === "string" &&
      error.message.includes("already finalized")
    ) {
      return res.status(409).json({
        success: false,
        error: "LOCATION_FINALIZED",
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "ADD_COMPETITOR_ERROR",
      message: error.message || "Failed to add competitor",
    });
  }
}

// DELETE /locations/:locationId/competitors/:placeId
export async function deleteLocationCompetitor(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const locV = validateLocationIdParam(req.params.locationId);
    if (!locV.valid) return res.status(locV.status).json(locV.body);
    const placeV = validatePlaceIdInput(req.params.placeId);
    if (!placeV.valid) return res.status(placeV.status).json(placeV.body);

    const locationId = Number(req.params.locationId);
    const placeId = String(req.params.placeId).trim();

    const result = await removeCompetitorFromList(locationId, placeId);
    return res.json({
      success: true,
      removed: result.removed,
      activeCount: result.activeCount,
      cap: MAX_COMPETITORS_PER_LOCATION,
    });
  } catch (error: any) {
    logError("DELETE /locations/:locationId/competitors/:placeId", error);
    if (
      typeof error?.message === "string" &&
      error.message.includes("already finalized")
    ) {
      return res.status(409).json({
        success: false,
        error: "LOCATION_FINALIZED",
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "REMOVE_COMPETITOR_ERROR",
      message: error.message || "Failed to remove competitor",
    });
  }
}

// POST /locations/:locationId/competitors/finalize-and-run
export async function finalizeLocationAndRun(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const v = validateLocationIdParam(req.params.locationId);
    if (!v.valid) return res.status(v.status).json(v.body);
    const locationId = Number(req.params.locationId);

    const result = await finalizeAndTriggerRun(locationId);
    return res.json({
      success: true,
      batchId: result.batchId,
      rankingId: result.rankingId,
      reused: result.reused,
      competitorSetRevision: result.competitorSetRevision,
      selectedCount: result.selectedCount,
    });
  } catch (error: any) {
    logError("POST /locations/:locationId/competitors/finalize-and-run", error);
    return res.status(500).json({
      success: false,
      error: "FINALIZE_ERROR",
      message: error.message || "Failed to finalize and trigger run",
    });
  }
}

// POST /locations/:locationId/competitors/reselect-and-run
export async function reselectLocationCompetitorsAndRun(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const v = validateLocationIdParam(req.params.locationId);
    if (!v.valid) return res.status(v.status).json(v.body);

    const placeIds: unknown[] = Array.isArray(req.body?.placeIds)
      ? req.body.placeIds
      : [];
    const invalidPlaceId = placeIds.find(
      (placeId) => !validatePlaceIdInput(placeId).valid
    );
    if (invalidPlaceId !== undefined) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PLACE_ID",
        message: "Each placeId must be a non-empty string",
      });
    }
    const radiusV = validateDiscoveryRadiusMeters(req.body?.radiusMeters);
    if (!radiusV.valid) return res.status(radiusV.status).json(radiusV.body);

    const locationId = Number(req.params.locationId);
    const userId = (req as RBACRequest).userId ?? null;
    const result = await reselectCompetitorsAndTriggerRun(
      locationId,
      placeIds.map((placeId) => String(placeId)),
      userId,
      req.body?.radiusMeters === undefined ? undefined : radiusV.radiusMeters
    );

    return res.json({
      success: true,
      batchId: result.batchId,
      rankingId: result.rankingId,
      reused: result.reused,
      competitorSetRevision: result.competitorSetRevision,
      selectedCount: result.selectedCount,
    });
  } catch (error: any) {
    logError(
      "POST /locations/:locationId/competitors/reselect-and-run",
      error
    );
    if (
      [
        "EMPTY_COMPETITOR_SET",
        "COMPETITOR_CAP_REACHED",
        "LOCATION_NOT_FINALIZED",
      ].includes(error?.code)
    ) {
      return res.status(error.code === "LOCATION_NOT_FINALIZED" ? 409 : 400).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }
    if (error?.code === "PLACES_LOOKUP_FAILED") {
      return res.status(502).json({
        success: false,
        error: "PLACES_LOOKUP_FAILED",
        message: error.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "RESELECT_COMPETITORS_ERROR",
      message: error.message || "Failed to rerun ranking",
    });
  }
}

// GET /photo?name=places/.../photos/...
// Authed proxy for Google Places Photo media. Each call hits the paid Place
// Photo SKU; do not expose unauthenticated.
export async function getCompetitorPhoto(
  req: Request,
  res: Response
): Promise<Response | void> {
  try {
    const photoName = String(req.query.name || "");
    // Validate shape: Google's photo resource names are "places/<id>/photos/<id>".
    // Reject anything else to prevent abuse against arbitrary upstream paths.
    if (!/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PHOTO_NAME",
        message: "name must look like places/<id>/photos/<id>",
      });
    }
    const maxHeightPx = Math.min(
      Math.max(parseInt(String(req.query.h || "200"), 10) || 200, 64),
      800
    );
    const { buffer, contentType } = await getPlacePhotoMedia(
      photoName,
      maxHeightPx
    );
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(buffer.length));
    return res.end(buffer);
  } catch (error: any) {
    logError("GET /practice-ranking/photo", error);
    return res.status(502).json({
      success: false,
      error: "PHOTO_FETCH_FAILED",
      message: error.message || "Failed to fetch photo",
    });
  }
}

// =====================================================================
// GET /in-flight
// Returns the most-recent pending/processing ranking for an org (and
// optionally a specific location). The client dashboard polls/uses this
// to auto-render the in-flight progress banner without needing a batchId
// in the URL.
// Spec: plans/04282026-no-ticket-rankings-auto-detect-in-flight-sticky/spec.md
// =====================================================================

export async function getInFlightRanking(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { googleAccountId, locationId } = req.query;
    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message: "googleAccountId is required",
      });
    }

    const filters: Record<string, unknown> = {
      organization_id: Number(googleAccountId),
    };
    if (locationId) filters.location_id = Number(locationId);

    const row = await db("practice_rankings")
      .where(filters)
      .whereIn("status", ["pending", "processing"])
      .orderBy("created_at", "desc")
      .select(
        "id",
        "batch_id",
        "status",
        "status_detail",
        "gbp_location_name",
        "created_at",
        "updated_at"
      )
      .first();

    if (!row) {
      return res.json({ success: true, ranking: null });
    }

    return res.json({
      success: true,
      ranking: {
        rankingId: row.id,
        batchId: row.batch_id,
        status: row.status,
        statusDetail: parseJsonField(row.status_detail),
        gbpLocationName: row.gbp_location_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    logError("GET /practice-ranking/in-flight", error);
    return res.status(500).json({
      success: false,
      error: "IN_FLIGHT_FETCH_FAILED",
      message: error.message || "Failed to fetch in-flight ranking",
    });
  }
}
