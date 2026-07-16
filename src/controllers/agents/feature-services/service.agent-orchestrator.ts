/**
 * Agent Processor Export Surface
 *
 * Keeps the existing processor import path stable for the supported Proofline,
 * monthly-insights, and GBP Optimizer runners. The deprecated process-all
 * orchestration path was retired with the legacy Action Items domain.
 */

export { processDailyAgent } from "./service.daily-agent-processor";
export { processMonthlyAgents } from "./service.monthly-agent-processor";
export { processGBPOptimizerAgent } from "./service.gbp-optimizer-processor";
