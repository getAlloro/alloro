/**
 * AgentsV2 Routes
 *
 * Thin route layer that maps HTTP endpoints to controller functions.
 * All business logic lives in src/controllers/agents/.
 *
 * Endpoints:
 * - POST /proofline-run                    - Daily proofline agent for all clients
 * - POST /monthly-agents-run               - Monthly agents for a specific account
 * - POST /monthly-agents-run-test          - Test endpoint (no DB writes)
 * - POST /gbp-optimizer-run                - [DISABLED 2026-04-12] Monthly GBP Copy Optimizer
 * - POST /ranking-run                      - Automated practice ranking agent
 * - POST /process-all                      - DEPRECATED: use /proofline-run
 * - GET  /latest/:googleAccountId          - Latest agent outputs for dashboard
 * - GET  /getLatestReferralEngineOutput/:googleAccountId - Latest Referral Engine output
 * - GET  /health                           - Health check
 */

import express from "express";
import * as controller from "../controllers/agents/AgentsController";

const router = express.Router();

// Production endpoints
router.post("/proofline-run", controller.runProoflineAgent);
router.post("/monthly-agents-run", controller.runMonthlyAgents);
// DISABLED 2026-04-12 — see plans/04122026-no-ticket-disable-n8n-agents-migrate-identifier/spec.md
// router.post("/gbp-optimizer-run", controller.runGbpOptimizer);
router.post("/ranking-run", controller.runRankingAgent);

// Data retrieval
router.get("/latest/:googleAccountId", controller.getLatestOutputs);
router.get(
  "/getLatestReferralEngineOutput/:googleAccountId",
  controller.getLatestReferralEngineOutput,
);
router.get("/health", controller.healthCheck);

// Test & deprecated
router.post("/monthly-agents-run-test", controller.runMonthlyAgentsTest);
router.post("/process-all", controller.processAllDeprecated);

export default router;
