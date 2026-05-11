/**
 * Ranking Executor
 *
 * Standalone ranking agent execution — decoupled from HTTP context.
 * Used by both the HTTP handler (AgentsController) and the scheduler worker.
 *
 * Split into setup + process so the HTTP handler can return immediately
 * while the scheduler awaits the full run.
 */

import { v4 as uuidv4 } from "uuid";
import { db } from "../../../database/connection";
import { getValidOAuth2Client } from "../../../auth/oauth2Helper";
import { fetchGBPDataForRange } from "../../../utils/dataAggregation/dataAggregator";
import { LocationModel } from "../../../models/LocationModel";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import {
  processLocationRanking,
  MAX_RETRIES,
  RETRY_DELAY_MS,
} from "../../practice-ranking/feature-services/service.ranking-pipeline";
import { identifyLocationMeta } from "./service.webhook-orchestrator";
import { log, logError, delay } from "../feature-utils/agentLogger";

// ── Types ───────────────────────────────────────────────────────────

interface BatchMeta {
  orgName: string;
  domain: string;
  batchId: string;
  locationCount: number;
  rankingIds: number[];
}

interface WorkItem {
  batchId: string;
  organizationId: number;
  domain: string;
  orgName: string;
  locations: Array<{
    locationId: number;
    rankingId: number;
    connectionId: number;
    gbpAccountId: string;
    gbpLocationId: string;
    gbpLocationName: string;
  }>;
}

export interface RankingSetupResult {
  batches: BatchMeta[];
  workItems: WorkItem[];
  totalLocations: number;
}

export interface RankingExecutionResult {
  success: boolean;
  summary: {
    totalOrgs: number;
    totalLocations: number;
    durationMs: number;
  };
  batches: BatchMeta[];
}

// ── Setup ───────────────────────────────────────────────────────────

export async function setupRankingBatches(connectionIdFilter?: number): Promise<RankingSetupResult> {
  let query = db("organizations as o")
    .join("google_connections as gc", "gc.organization_id", "o.id")
    .where("o.onboarding_completed", true)
    .select(
      "o.id as organization_id",
      "o.name as org_name",
      "o.domain",
      "gc.id as connection_id",
    );

  if (connectionIdFilter) {
    query = query.where("gc.id", connectionIdFilter);
  }

  const accounts = await query;

  const batches: BatchMeta[] = [];
  const workItems: WorkItem[] = [];

  if (!accounts || accounts.length === 0) {
    log("[SETUP] No onboarded accounts found");
    return { batches, workItems, totalLocations: 0 };
  }

  log(`[SETUP] Found ${accounts.length} account(s) to process`);

  for (const account of accounts) {
    const { organization_id, org_name, domain } = account;

    const locations = await LocationModel.findByOrganizationId(organization_id);
    if (locations.length === 0) {
      log(`[SETUP] WARNING: No locations for org "${org_name}" (ID: ${organization_id}), skipping`);
      continue;
    }

    const locationWork: Array<{
      locationId: number;
      connectionId: number;
      gbpAccountId: string;
      gbpLocationId: string;
      gbpLocationName: string;
    }> = [];

    for (const location of locations) {
      // v2: only run scheduled rankings against locations that have finalized
      // their curated competitor list. Pending/curating locations stay in
      // self-service mode until the user finishes onboarding.
      // Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
      if (location.location_competitor_onboarding_status !== "finalized") {
        log(
          `[SETUP] Skipping location "${location.name}" (ID: ${location.id}) — competitor onboarding status: ${location.location_competitor_onboarding_status}`
        );
        continue;
      }

      const gbpProperties = await GooglePropertyModel.findByLocationId(location.id);
      const selectedGbp = gbpProperties.find((p: any) => p.selected) || gbpProperties[0];
      if (!selectedGbp) {
        log(`[SETUP] No GBP properties for location "${location.name}" (ID: ${location.id}), skipping`);
        continue;
      }
      locationWork.push({
        locationId: location.id,
        connectionId: selectedGbp.google_connection_id,
        gbpAccountId: selectedGbp.account_id || "",
        gbpLocationId: selectedGbp.external_id,
        gbpLocationName: selectedGbp.display_name || location.name,
      });
    }

    if (locationWork.length === 0) {
      log(`[SETUP] No GBP-linked locations for org "${org_name}", skipping`);
      continue;
    }

    const batchId = uuidv4();
    const rankingIds: number[] = [];

    for (let i = 0; i < locationWork.length; i++) {
      const loc = locationWork[i];
      const [record] = await db("practice_rankings")
        .insert({
          organization_id,
          location_id: loc.locationId,
          gbp_account_id: loc.gbpAccountId,
          gbp_location_id: loc.gbpLocationId,
          gbp_location_name: loc.gbpLocationName,
          batch_id: batchId,
          observed_at: new Date(),
          status: "pending",
          run_reason: "scheduled",
          include_in_summary_recommendations: true,
          status_detail: JSON.stringify({
            currentStep: "queued",
            message: `Waiting in queue (${i + 1}/${locationWork.length})...`,
            progress: 0,
            stepsCompleted: [],
            timestamps: { created_at: new Date().toISOString() },
          }),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning("id");
      rankingIds.push(record.id);
    }

    log(`[SETUP] Batch ${batchId}: ${org_name} — ${locationWork.length} location(s), records created`);

    batches.push({ orgName: org_name, domain, batchId, locationCount: locationWork.length, rankingIds });

    workItems.push({
      batchId,
      organizationId: organization_id,
      domain,
      orgName: org_name,
      locations: locationWork.map((loc, i) => ({ ...loc, rankingId: rankingIds[i] })),
    });
  }

  const totalLocations = batches.reduce((s, b) => s + b.locationCount, 0);
  log(`[SETUP] Queued ${batches.length} org(s), ${totalLocations} total locations`);

  return { batches, workItems, totalLocations };
}

// ── Process ─────────────────────────────────────────────────────────

export async function processRankingWork(workItems: WorkItem[]): Promise<void> {
  log(`\n[PROCESSING] Starting sequential ranking for ${workItems.length} org(s)`);

  for (const work of workItems) {
    log(`\n[${"=".repeat(60)}]`);
    log(`[ORG] Processing: ${work.orgName} (${work.domain})`);
    log(`[ORG] Batch: ${work.batchId}, Locations: ${work.locations.length}`);
    log(`[${"=".repeat(60)}]`);

    for (let i = 0; i < work.locations.length; i++) {
      const loc = work.locations[i];
      log(`\n  [LOCATION] Processing ${i + 1}/${work.locations.length}: ${loc.gbpLocationName}`);

      let specialty = "";
      let marketLocation = "";
      try {
        const oauth2Client = await getValidOAuth2Client(loc.connectionId);
        const gbpProfile = await fetchGBPDataForRange(
          oauth2Client,
          [{
            accountId: loc.gbpAccountId,
            locationId: loc.gbpLocationId,
            displayName: loc.gbpLocationName,
          }],
          new Date().toISOString().split("T")[0],
          new Date().toISOString().split("T")[0],
        );
        const locationData = gbpProfile?.locations?.[0]?.data || {};
        const meta = await identifyLocationMeta(locationData, work.domain);
        specialty = meta.specialty;
        marketLocation = meta.marketLocation;

        await db("practice_rankings")
          .where({ id: loc.rankingId })
          .update({ specialty, location: marketLocation, updated_at: new Date() });

        log(`  [LOCATION] Identified: ${specialty} in ${marketLocation}`);
      } catch (identErr: any) {
        log(`  [LOCATION] Identification failed for ${loc.gbpLocationName}: ${identErr.message}, using fallback`);
        specialty = "orthodontist";
        marketLocation = "Unknown, US";
        await db("practice_rankings")
          .where({ id: loc.rankingId })
          .update({ specialty, location: marketLocation, updated_at: new Date() });
      }

      await db("practice_rankings")
        .where({ id: loc.rankingId })
        .update({
          status: "processing",
          status_detail: JSON.stringify({
            currentStep: "starting",
            message: `Starting analysis ${i + 1}/${work.locations.length}...`,
            progress: 5,
            stepsCompleted: ["queued"],
            timestamps: { started_at: new Date().toISOString() },
          }),
        });

      let success = false;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 1) {
            log(`    Retry ${attempt}/${MAX_RETRIES} for ID ${loc.rankingId}`);
            await delay(RETRY_DELAY_MS);
          }

          await processLocationRanking(
            loc.rankingId,
            loc.connectionId,
            loc.gbpAccountId,
            loc.gbpLocationId,
            loc.gbpLocationName,
            specialty,
            marketLocation,
            work.domain,
            work.batchId,
            log,
          );

          success = true;
          break;
        } catch (err: any) {
          log(`    Attempt ${attempt} failed: ${err.message}`);
          if (attempt === MAX_RETRIES) {
            await db("practice_rankings")
              .where({ id: loc.rankingId })
              .update({ status: "failed", error_message: err.message });
          }
        }
      }

      if (!success) {
        log(`    FAILED: Exhausted retries for ${loc.gbpLocationId}`);
      }
    }

    log(`[ORG] Completed: ${work.orgName}`);
  }
}

// ── Full Execution (for scheduler) ──────────────────────────────────

export async function executeRankingAgent(connectionIdFilter?: number): Promise<RankingExecutionResult> {
  const startTime = Date.now();

  log("\n" + "=".repeat(70));
  log("RANKING AGENT EXECUTION - STARTING");
  log("=".repeat(70));
  log(`Timestamp: ${new Date().toISOString()}`);

  const { batches, workItems, totalLocations } = await setupRankingBatches(connectionIdFilter);

  if (workItems.length === 0) {
    return {
      success: true,
      summary: { totalOrgs: 0, totalLocations: 0, durationMs: Date.now() - startTime },
      batches: [],
    };
  }

  await processRankingWork(workItems);

  const duration = Date.now() - startTime;
  log("\n" + "=".repeat(70));
  log(`[COMPLETE] Ranking run completed in ${(duration / 1000).toFixed(1)}s`);
  log("=".repeat(70) + "\n");

  return {
    success: true,
    summary: { totalOrgs: batches.length, totalLocations, durationMs: duration },
    batches,
  };
}
