/**
 * AI/SEO Audit Processor
 *
 * Handles `wb-ai-seo-audit` BullMQ jobs. Wraps `executeAuditRun` so audit
 * launches return immediately with a queued run while the heavy URL collection,
 * external consistency scan, and scoring run on the worker. Progress is written
 * to `runs.summary.progress` for polling clients.
 *
 * Pattern reference: src/workers/processors/identityWarmup.processor.ts
 */

import { Job } from "bullmq";
import { executeAuditRun } from "../../services/ai-seo-audit/aiSeoAuditService";

interface AiSeoAuditJobData {
  runId: string;
}

export async function processAiSeoAudit(job: Job<AiSeoAuditJobData>): Promise<void> {
  const { runId } = job.data;
  if (!runId) {
    throw new Error("AI/SEO audit job is missing runId");
  }

  console.log(`[AI-SEO-AUDIT] Processing run ${runId} (job ${job.id})`);
  try {
    await executeAuditRun(runId);
    console.log(`[AI-SEO-AUDIT] Run ${runId} completed`);
  } catch (error) {
    console.error(
      `[AI-SEO-AUDIT] Run ${runId} failed:`,
      error instanceof Error ? error.message : error,
    );
    // Re-throw so BullMQ records the failure; the run row is already marked failed.
    throw error;
  }
}
