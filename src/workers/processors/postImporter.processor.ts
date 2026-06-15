/**
 * Post Importer Processor
 *
 * Handles `wb-post-import` BullMQ jobs. Wraps the post-importer service.
 *
 * Job progress + per-entry results are persisted onto the BullMQ Job itself
 * via `job.updateProgress()`. The HTTP layer reads them back through
 * `Queue.getJob(jobId)` (see `getPostImportStatus` in AdminWebsitesController).
 *
 * Why job.updateProgress vs. a DB row:
 *   - Imports are short-lived (seconds to a few minutes), no need for a
 *     persistent audit trail.
 *   - Reusing BullMQ's progress/result channels keeps redis as the single
 *     source of truth and avoids spinning up a new table just to mirror state
 *     that already exists in the queue.
 *   - The poller fetches `job.progress` for in-flight stats and `job.returnvalue`
 *     for the final summary.
 */

import { Job } from "bullmq";
import {
  importFromIdentity,
  type ImportPostType,
  type ImportEntryObject,
  type ImportEntryResult,
  type ImportResultSummary,
} from "../../controllers/admin-websites/feature-services/service.post-importer";
import logger from "../../lib/logger";

const LOG_PREFIX = "[WB-POST-IMPORT]";

export interface PostImportJobData {
  projectId: string;
  postType: ImportPostType;
  entries: Array<string | ImportEntryObject>;
  overwrite?: boolean;
}

/** Shape stored on `job.progress` so pollers can render live status. */
export interface PostImportProgress {
  total: number;
  completed: number;
  results: ImportEntryResult[];
}

export async function processPostImport(
  job: Job<PostImportJobData, ImportResultSummary>,
): Promise<ImportResultSummary> {
  const { projectId, postType, entries, overwrite } = job.data;
  const log = (msg: string) =>
    logger.info(`${LOG_PREFIX} [${job.id}] ${msg}`);

  log(
    `Starting import: project=${projectId} type=${postType} entries=${entries?.length ?? 0} overwrite=${!!overwrite}`,
  );

  // Seed the progress shape so the first poll is meaningful even before the
  // first entry settles.
  await job.updateProgress({
    total: Array.isArray(entries) ? entries.length : 0,
    completed: 0,
    results: [],
  } satisfies PostImportProgress);

  const liveResults: ImportEntryResult[] = [];

  const summary = await importFromIdentity(
    projectId,
    { postType, entries, overwrite: !!overwrite },
    {
      onEntry: async (result, progress) => {
        liveResults.push(result);
        try {
          await job.updateProgress({
            total: progress.total,
            completed: progress.completed,
            results: liveResults,
          } satisfies PostImportProgress);
        } catch (err: any) {
          // Progress write failures should never tank the job — just log.
          log(`updateProgress failed: ${err?.message}`);
        }
      },
    },
  );

  log(
    `Import complete: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed`,
  );

  return summary;
}
