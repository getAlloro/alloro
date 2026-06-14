import { Job } from "bullmq";
import { MindSyncRunModel } from "../../models/MindSyncRunModel";
import { MindSyncStepModel, IMindSyncStep } from "../../models/MindSyncStepModel";
import { MindModel } from "../../models/MindModel";
import { MindVersionModel } from "../../models/MindVersionModel";
import { MindSyncProposalModel } from "../../models/MindSyncProposalModel";
import { MindDiscoveryBatchModel } from "../../models/MindDiscoveryBatchModel";
import { MindDiscoveredPostModel } from "../../models/MindDiscoveredPostModel";
import { applyProposals } from "../../controllers/minds/feature-services/service.minds-compiler";
import { regenerateEmbeddings } from "../../controllers/minds/feature-services/service.minds-embedding";
import { shouldUseRag } from "../../controllers/minds/feature-services/service.minds-retrieval";
import { db } from "../../database/connection";
import logger from "../../lib/logger";

interface CompilePublishJobData {
  mindId: string;
  runId: string;
}

async function getStep(
  runId: string,
  stepName: string
): Promise<IMindSyncStep> {
  const steps = await MindSyncStepModel.listByRun(runId);
  const step = steps.find((s) => s.step_name === stepName);
  if (!step) throw new Error(`Step ${stepName} not found`);
  return step;
}

async function runStep(
  runId: string,
  stepName: string,
  fn: (step: IMindSyncStep) => Promise<void>
): Promise<void> {
  const step = await getStep(runId, stepName);
  await MindSyncStepModel.markRunning(step.id);
  await MindSyncStepModel.appendLog(step.id, `Starting ${stepName}`);

  try {
    await fn(step);
    await MindSyncStepModel.markCompleted(step.id);
    await MindSyncStepModel.appendLog(step.id, `Completed ${stepName}`);
  } catch (err: any) {
    await MindSyncStepModel.markFailed(step.id, err.message);
    await MindSyncStepModel.appendLog(step.id, `Failed: ${err.message}`);
    throw err;
  }
}

export async function processCompilePublish(job: Job<CompilePublishJobData>): Promise<void> {
  const { mindId, runId } = job.data;
  logger.info(`[MINDS-WORKER] Starting compile_publish run ${runId} for mind ${mindId}`);

  await MindSyncRunModel.markRunning(runId);

  try {
    // Step 1: INIT
    await runStep(runId, "INIT", async (step) => {
      await MindSyncStepModel.appendLog(step.id, `Mind ID: ${mindId}, Run ID: ${runId}`);
    });

    // Step 2: LOAD_CURRENT_VERSION
    let currentBrain = "";
    let currentVersionNumber = 0;
    await runStep(runId, "LOAD_CURRENT_VERSION", async (step) => {
      const mind = await MindModel.findById(mindId);
      if (!mind) throw new Error("Mind not found");

      if (mind.published_version_id) {
        const version = await MindVersionModel.findById(mind.published_version_id);
        if (version) {
          currentBrain = version.brain_markdown;
          currentVersionNumber = version.version_number;
          await MindSyncStepModel.appendLog(
            step.id,
            `Loaded version ${version.version_number}: ${currentBrain.length} chars`
          );
        }
      }

      if (!currentBrain) {
        currentBrain = "# Knowledge Base\n\n## Core Concepts\n\n## Recently Added Insights\n";
        await MindSyncStepModel.appendLog(step.id, "No published version — using empty scaffold");
      }
    });

    // Step 3: APPLY_APPROVED_PROPOSALS
    let compileResult: ReturnType<typeof applyProposals> extends infer R ? R : never;
    await runStep(runId, "APPLY_APPROVED_PROPOSALS", async (step) => {
      const proposals = await MindSyncProposalModel.listApprovedByMind(mindId);
      if (proposals.length === 0) throw new Error("No approved proposals to compile");

      compileResult = applyProposals(currentBrain, proposals);

      await MindSyncStepModel.appendLog(
        step.id,
        `Applied ${compileResult.appliedCount} proposals, skipped ${compileResult.skippedCount}`
      );

      for (const warning of compileResult.warnings) {
        await MindSyncStepModel.appendLog(step.id, `Warning: ${warning}`);
      }
    });

    // Step 4: VALIDATE_BRAIN_SIZE
    await runStep(runId, "VALIDATE_BRAIN_SIZE", async (step) => {
      const newSize = compileResult!.newBrain.length;
      await MindSyncStepModel.appendLog(step.id, `New brain size: ${newSize} chars`);
    });

    // Step 5: CREATE_NEW_VERSION
    let newVersion: any;
    await runStep(runId, "CREATE_NEW_VERSION", async (step) => {
      newVersion = await MindVersionModel.createVersion(mindId, compileResult!.newBrain);
      await MindSyncStepModel.appendLog(
        step.id,
        `Created version ${newVersion.version_number} (prev: ${currentVersionNumber})`
      );
    });

    // Step 6: PUBLISH_VERSION
    await runStep(runId, "PUBLISH_VERSION", async (step) => {
      await MindModel.setPublishedVersion(mindId, newVersion.id);
      await MindSyncStepModel.appendLog(step.id, `Published version ${newVersion.version_number}`);
    });

    // Step 7: GENERATE_EMBEDDINGS
    await runStep(runId, "GENERATE_EMBEDDINGS", async (step) => {
      const brainSize = compileResult!.newBrain.length;

      if (shouldUseRag(brainSize)) {
        const mind = await MindModel.findById(mindId);
        await MindSyncStepModel.appendLog(
          step.id,
          `Brain size ${brainSize} chars — generating RAG embeddings`
        );

        const result = await regenerateEmbeddings(
          mindId,
          newVersion.id,
          compileResult!.newBrain,
          mind?.name || "Unknown"
        );

        await MindSyncStepModel.appendLog(
          step.id,
          `Generated ${result.chunksCreated} chunks (including summary)`
        );
      } else {
        await MindSyncStepModel.appendLog(
          step.id,
          `Brain size ${brainSize} chars — below RAG threshold, skipping embeddings`
        );
      }
    });

    // Step 8: FINALIZE_PROPOSALS (was step 7)
    await runStep(runId, "FINALIZE_PROPOSALS", async (step) => {
      const finalized = await MindSyncProposalModel.finalizeApproved(mindId);
      await MindSyncStepModel.appendLog(step.id, `Finalized ${finalized} proposals`);

      // Check if batch can be closed
      const batch = await MindDiscoveryBatchModel.findOpenByMind(mindId);
      if (batch) {
        const pendingCount = await MindDiscoveredPostModel.countByBatchAndStatus(batch.id, "pending");
        const approvedCount = await MindDiscoveredPostModel.countByBatchAndStatus(batch.id, "approved");
        if (pendingCount === 0 && approvedCount === 0) {
          await MindDiscoveryBatchModel.closeBatch(batch.id);
          await MindSyncStepModel.appendLog(step.id, `Closed batch ${batch.id}`);
        }
      }
    });

    // Step 9: COMPLETE (was step 8)
    await runStep(runId, "COMPLETE", async (step) => {
      await MindSyncStepModel.appendLog(step.id, "Compile & Publish run completed successfully");
    });

    await MindSyncRunModel.markCompleted(runId);
    logger.info(`[MINDS-WORKER] Compile_publish run ${runId} completed`);
  } catch (err: any) {
    logger.error({ err: err }, `[MINDS-WORKER] Compile_publish run ${runId} failed:`);
    await MindSyncRunModel.markFailed(runId, err.message);
    // Re-throw so BullMQ records the job as failed (and retries / dead-letters)
    // instead of treating a half-published run as a success.
    throw err;
  }
}
