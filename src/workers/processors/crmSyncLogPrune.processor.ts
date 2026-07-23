/**
 * CRM Sync-Log Prune Processor — daily scheduled housekeeping.
 *
 * Consumes the `crm-sync-log-prune` queue. Deletes rows in
 * `website_builder.crm_sync_logs` whose `attempted_at` is older than the
 * retention window (see config/crmSyncLog.ts). The logs are diagnostic
 * breadcrumbs, not business data, so old rows are safe to drop and only cost
 * table/index growth if kept forever.
 *
 * Idempotent (§21.1): pruning by a time cutoff is naturally repeat-safe — a
 * second run in the same window simply deletes fewer (or zero) rows.
 */

import { Job } from "bullmq";
import { CrmSyncLogModel } from "../../models/website-builder/CrmSyncLogModel";
import {
  CRM_SYNC_LOG_RETENTION_DAYS,
  crmSyncLogRetentionCutoff,
} from "../../config/crmSyncLog";
import logger from "../../lib/logger";

const LOG_PREFIX = "[CRM-SYNC-LOG-PRUNE]";

export async function processCrmSyncLogPrune(_job: Job): Promise<void> {
  const start = Date.now();
  const cutoff = crmSyncLogRetentionCutoff();

  const deleted = await CrmSyncLogModel.pruneOlderThan(cutoff);

  const elapsed = Date.now() - start;
  logger.info(
    `${LOG_PREFIX} Done in ${elapsed}ms — deleted=${deleted} rows older than ${cutoff.toISOString()} (retention=${CRM_SYNC_LOG_RETENTION_DAYS}d)`,
  );
}
