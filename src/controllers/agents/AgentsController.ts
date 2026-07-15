/**
 * AgentsController
 *
 * HTTP handler layer for agent processing endpoints.
 * Named function exports (not class-based) per project convention.
 *
 * Thin controller that handles:
 * - Request parsing and validation
 * - Delegating business logic to feature services
 * - Response formatting
 * - Error handling
 *
 * 8 endpoints:
 * - POST /proofline-run          - Daily proofline agent for all clients
 * - POST /monthly-agents-run     - Monthly agents for a specific account
 * - POST /monthly-agents-run-test - Test endpoint (no DB writes)
 * - POST /gbp-optimizer-run      - Monthly GBP Copy Optimizer for all clients
 * - POST /ranking-run            - Automated practice ranking agent
 * - GET  /latest/:googleAccountId - Latest agent outputs for dashboard
 * - GET  /getLatestReferralEngineOutput/:googleAccountId - Latest Referral Engine output
 * - GET  /health                 - Health check
 */

import { Request, Response } from "express";

import { log, logError } from "./feature-utils/agentLogger";
import {
  PROOFLINE_WEBHOOK,
  SUMMARY_WEBHOOK,
  REFERRAL_ENGINE_WEBHOOK,
  OPPORTUNITY_WEBHOOK,
  CRO_OPTIMIZER_WEBHOOK,
  COPY_COMPANION_WEBHOOK,
} from "./feature-services/service.webhook-orchestrator";
import { executeProoflineAgent } from "./feature-services/service.proofline-executor";
import { setupRankingBatches, processRankingWork } from "./feature-services/service.ranking-executor";
import { runMonthlyAgentsForAccount } from "./feature-services/service.monthly-agents-runner";
import { runMonthlyAgentsTest as runMonthlyAgentsTestService } from "./feature-services/service.monthly-agents-test-runner";
import { runGbpOptimizerForAllAccounts } from "./feature-services/service.gbp-optimizer-runner";
import { AgentResultModel } from "../../models/AgentResultModel";
import { PmsJobModel } from "../../models/PmsJobModel";

// =====================================================================
// POST /proofline-run
// =====================================================================

export async function runProoflineAgent(
  req: Request,
  res: Response,
): Promise<any> {
  const { referenceDate } = req.body || {};

  try {
    const result = await executeProoflineAgent(referenceDate);
    return res.json({
      success: true,
      message: `Processed ${result.summary.totalAccounts} account(s), ${result.summary.totalLocations} location(s)`,
      processed: result.summary.totalAccounts,
      locationsProcessed: result.summary.totalLocations,
      successful: result.summary.successful,
      duration: `${result.summary.durationMs}ms`,
      results: result.results,
    });
  } catch (error: any) {
    logError("proofline-run", error);
    return res.status(500).json({
      success: false,
      error: "PROOFLINE_RUN_ERROR",
      message: error?.message || "Failed to run proofline agent",
    });
  }
}

// =====================================================================
// POST /monthly-agents-run
// =====================================================================

export async function runMonthlyAgents(
  req: Request,
  res: Response,
): Promise<any> {
  const { status, body } = await runMonthlyAgentsForAccount(req.body || {});
  return res.status(status).json(body);
}

// =====================================================================
// POST /monthly-agents-run-test
// =====================================================================

export async function runMonthlyAgentsTest(
  req: Request,
  res: Response,
): Promise<any> {
  const { status, body } = await runMonthlyAgentsTestService(req.body || {});
  return res.status(status).json(body);
}

// =====================================================================
// POST /gbp-optimizer-run
// =====================================================================

export async function runGbpOptimizer(
  req: Request,
  res: Response,
): Promise<any> {
  const { referenceDate } = req.body || {};
  const { status, body } = await runGbpOptimizerForAllAccounts(referenceDate);
  return res.status(status).json(body);
}

// =====================================================================
// POST /ranking-run
// =====================================================================

export async function runRankingAgent(
  req: Request,
  res: Response,
): Promise<any> {
  const startTime = Date.now();
  const { googleAccountId } = req.body || {};

  log("\n" + "=".repeat(70));
  log("POST /api/agents/ranking-run - STARTING");
  log("=".repeat(70));
  if (googleAccountId) log(`Connection ID filter: ${googleAccountId}`);
  log(`Timestamp: ${new Date().toISOString()}`);

  try {
    const { batches, workItems, totalLocations } = await setupRankingBatches(googleAccountId);

    if (batches.length === 0) {
      return res.json({ success: true, message: "No orgs with GBP locations found", batches: [] });
    }

    // Kick off background processing and return immediately
    setImmediate(() => {
      processRankingWork(workItems)
        .then(() => {
          const duration = Date.now() - startTime;
          log("\n" + "=".repeat(70));
          log(`[COMPLETE] Ranking run completed in ${(duration / 1000).toFixed(1)}s`);
          log("=".repeat(70) + "\n");
        })
        .catch((err) => {
          logError("ranking-run background processing", err);
        });
    });

    return res.json({
      success: true,
      message: `Queued ${batches.length} org(s) for ranking analysis`,
      totalLocations,
      batches,
    });
  } catch (error: any) {
    logError("ranking-run", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// =====================================================================
// GET /latest/:googleAccountId
// =====================================================================

export async function getLatestOutputs(
  req: Request,
  res: Response,
): Promise<any> {
  const { googleAccountId } = req.params;
  const scopedReq = req as any;

  try {
    // Prefer organizationId from RBAC middleware
    const organizationId = scopedReq.organizationId || parseInt(googleAccountId, 10);
    const locationId = scopedReq.locationId || (req.query.locationId ? parseInt(req.query.locationId as string, 10) : null);

    log(`\n[GET /latest] Fetching latest agent outputs for org: ${organizationId}, location: ${locationId || "all"}`);

    if (isNaN(organizationId)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_ACCOUNT_ID",
        message: "Invalid account ID provided",
      });
    }

    // Fetch latest successful result for each agent type
    const agentTypes = ["proofline", "summary", "opportunity"];
    const agents: any = {};

    for (const agentType of agentTypes) {
      const result = await AgentResultModel.findLatestByOrganizationAndAgent(
        organizationId,
        agentType,
        locationId,
      );

      if (result) {
        let parsedOutput = result.agent_output;

        agents[agentType] = {
          results: parsedOutput,
          lastUpdated: result.created_at,
          dateStart: result.date_start,
          dateEnd: result.date_end,
          resultId: result.id,
        };
      } else {
        agents[agentType] = null;
      }
    }

    log(
      `  [SUCCESS] Retrieved latest outputs for org ${organizationId}`,
    );

    return res.json({
      success: true,
      googleAccountId: organizationId,
      organizationId,
      agents,
    });
  } catch (error: any) {
    logError(`GET /latest/${googleAccountId}`, error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch latest agent outputs",
    });
  }
}

// =====================================================================
// GET /getLatestReferralEngineOutput/:googleAccountId
// =====================================================================

export async function getLatestReferralEngineOutput(
  req: Request,
  res: Response,
): Promise<any> {
  const { googleAccountId } = req.params;
  const scopedReq = req as any;

  try {
    // Prefer organizationId from RBAC middleware
    const organizationId = scopedReq.organizationId || parseInt(googleAccountId, 10);
    const locationId = scopedReq.locationId || (req.query.locationId ? parseInt(req.query.locationId as string, 10) : null);

    log(
      `\n[GET /getLatestReferralEngineOutput] Fetching for org: ${organizationId}, location: ${locationId || "all"}`,
    );

    if (isNaN(organizationId)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_ACCOUNT_ID",
        message: "Invalid account ID provided",
      });
    }

    // Check for active automation (monthly agents processing)
    const activeAutomation = await PmsJobModel.findActiveMonthlyAgentsAutomation(
      organizationId,
      locationId,
    );

    if (activeAutomation) {
      log(
        `  [PENDING] Active automation found for org ${organizationId} - PMS Job ID: ${activeAutomation.id}`,
      );
      return res.json({
        success: true,
        pending: true,
        message: "Monthly insights are being generated...",
        googleAccountId: organizationId,
        organizationId,
        data: null,
        metadata: {
          pmsJobId: activeAutomation.id,
          automationStatus: "processing",
        },
      });
    }

    // Fetch latest successful referral_engine result
    const result = await AgentResultModel.findLatestByOrganizationAndAgent(
      organizationId,
      "referral_engine",
      locationId,
    );

    if (!result) {
      log(
        `  [NO DATA] No referral engine results found for org ${organizationId}`,
      );
      return res.status(404).json({
        success: false,
        error: "NO_DATA",
        message: "No referral engine data available yet",
      });
    }

    log(
      `  [SUCCESS] Retrieved referral engine output for org ${organizationId}`,
    );
    log(`  - Result ID: ${result.id}`);
    log(`  - Date range: ${result.date_start} to ${result.date_end}`);
    log(`  - Created: ${result.created_at}`);

    return res.json({
      success: true,
      pending: false,
      googleAccountId: organizationId,
      organizationId,
      data: result.agent_output,
      metadata: {
        resultId: result.id,
        dateStart: result.date_start,
        dateEnd: result.date_end,
        lastUpdated: result.created_at,
      },
    });
  } catch (error: any) {
    logError(`GET /getLatestReferralEngineOutput/${googleAccountId}`, error);
    return res.status(500).json({
      success: false,
      error: "FETCH_ERROR",
      message: error?.message || "Failed to fetch referral engine output",
    });
  }
}

// =====================================================================
// GET /health
// =====================================================================

export function healthCheck(_req: Request, res: Response): void {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    webhooks: {
      proofline: !!PROOFLINE_WEBHOOK,
      summary: !!SUMMARY_WEBHOOK,
      referral_engine: !!REFERRAL_ENGINE_WEBHOOK,
      opportunity: !!OPPORTUNITY_WEBHOOK,
      cro_optimizer: !!CRO_OPTIMIZER_WEBHOOK,
      copy_companion: !!COPY_COMPANION_WEBHOOK,
    },
  });
}
