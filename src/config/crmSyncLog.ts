/**
 * CRM sync-log retention policy.
 *
 * `website_builder.crm_sync_logs` records the outcome of every attempt to push a
 * form submission to a CRM (success / skipped / failed / no-mapping). The rows
 * are diagnostic breadcrumbs, not business data: after a few months they only
 * grow the table and its indexes. Ninety days keeps a full quarter of history
 * for debugging a broken mapping or a token revocation while bounding the table.
 *
 * The prune cron (src/workers — crm-sync-log-prune) reads these to compute its
 * cutoff, so the retention window lives here as a named constant (§4.2) rather
 * than a magic number buried in the job.
 */
export const CRM_SYNC_LOG_RETENTION_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The retention cutoff: sync-log rows with `attempted_at` strictly older than
 * the returned Date are eligible for pruning. Computed from "now" at call time
 * so each scheduled run advances the window.
 */
export function crmSyncLogRetentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - CRM_SYNC_LOG_RETENTION_DAYS * MS_PER_DAY);
}
