import { MindSyncRunModel, SyncRunType } from "../../../models/MindSyncRunModel";
import { MindSyncStepModel } from "../../../models/MindSyncStepModel";
import { MindSyncProposalModel } from "../../../models/MindSyncProposalModel";
import logger from "../../../lib/logger";

const SCRAPE_COMPARE_STEPS = [
  "INIT",
  "FETCH_APPROVED_POSTS",
  "EXTRACT_CONTENT",
  "COMPILE_MARKDOWN",
  "LOAD_CURRENT_VERSION",
  "RUN_LLM_COMPARISON",
  "VALIDATE_PROPOSALS",
  "STORE_PROPOSALS",
  "COMPLETE",
];

const COMPILE_PUBLISH_STEPS = [
  "INIT",
  "LOAD_CURRENT_VERSION",
  "APPLY_APPROVED_PROPOSALS",
  "VALIDATE_BRAIN_SIZE",
  "CREATE_NEW_VERSION",
  "PUBLISH_VERSION",
  "GENERATE_EMBEDDINGS",
  "FINALIZE_PROPOSALS",
  "COMPLETE",
];

export async function createSyncRun(
  mindId: string,
  type: SyncRunType,
  adminId?: string,
  batchId?: string
): Promise<{ runId: string }> {
  const run = await MindSyncRunModel.createRun(mindId, type, adminId, batchId);

  const stepNames =
    type === "scrape_compare" ? SCRAPE_COMPARE_STEPS : COMPILE_PUBLISH_STEPS;

  await MindSyncStepModel.createSteps(run.id, stepNames);

  logger.info(
    `[MINDS] Created ${type} sync run ${run.id} for mind ${mindId} with ${stepNames.length} steps`
  );

  return { runId: run.id };
}

export async function getRunDetails(runId: string): Promise<{
  run: any;
  steps: any[];
  proposalCounts: Record<string, number>;
}> {
  const run = await MindSyncRunModel.findById(runId);
  if (!run) throw new Error("Sync run not found");

  const steps = await MindSyncStepModel.listByRun(runId);

  let proposalCounts: Record<string, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
    finalized: 0,
  };

  if (run.type === "scrape_compare" && run.status === "completed") {
    proposalCounts = await MindSyncProposalModel.countByRunAndStatus(runId);
  }

  return { run, steps, proposalCounts };
}
