/**
 * Audit Retry Service
 *
 * Shared core for both self-service retry (public `POST /api/audit/:auditId/retry`)
 * and admin rerun (`POST /api/admin/leadgen-submissions/:id/rerun`).
 *
 * Behavior:
 *   - Row must exist and currently be `status='failed'`.
 *   - Public path caps at 3 retries (`retry_count < 3`) and increments the counter.
 *   - Admin path bypasses the cap and does NOT touch the counter (out-of-band
 *     manual override, not part of the user's automatic budget).
 *   - Reset is atomic in a single UPDATE so two concurrent requests cannot both
 *     increment past the cap (the DB enforces the invariant, not the app).
 *   - On success, re-enqueues the same BullMQ job shape as the initial kickoff
 *     in `auditWorkflowService.ts` — same queue, same job name, same data.
 *   - Never throws to the caller. DB / queue errors are logged and surfaced as
 *     `{ ok: false, reason: "not_found" }` (safest default).
 */

import { AuditProcessModel } from "../../../models/AuditProcessModel";
import { getAuditQueue } from "../../../workers/queues";
import logger from "../../../lib/logger";

const MAX_RETRIES = 3;

export type RetryResult =
  | { ok: true; auditId: string; retryCount: number }
  | {
      ok: false;
      reason: "not_found" | "not_failed" | "limit_exceeded";
      currentStatus?: string;
      retryCount?: number;
    };

export interface RetryOptions {
  /** If true, skip the `retry_count < 3` guard. Admin callers set this. */
  skipLimit?: boolean;
  /** If true, increment `retry_count`. Public callers set this; admin does not. */
  countsTowardLimit?: boolean;
}

interface AuditRow {
  id: string;
  domain: string | null;
  practice_search_string: string | null;
  status: string;
  retry_count: number;
}

export async function retryAuditById(
  auditId: string,
  options: RetryOptions = {}
): Promise<RetryResult> {
  const skipLimit = options.skipLimit === true;
  const countsTowardLimit = options.countsTowardLimit !== false;

  try {
    const updated = await AuditProcessModel.resetFailedForRetry(auditId, {
      countsTowardLimit,
      skipLimit,
      maxRetries: MAX_RETRIES,
    });

    if (updated.length === 0) {
      return disambiguateFailure(auditId, skipLimit);
    }

    const row = updated[0];
    const queue = getAuditQueue("leadgen");
    await queue.add("process", {
      auditId: row.id,
      domain: row.domain,
      practiceSearchString: row.practice_search_string,
    });

    logger.info(
      `[AuditRetry] Re-enqueued audit ${row.id} (retry_count=${row.retry_count}, admin=${skipLimit})`
    );

    return { ok: true, auditId: row.id, retryCount: row.retry_count };
  } catch (error) {
    logger.error({ err: error }, `[AuditRetry] Error retrying audit ${auditId}:`);
    return { ok: false, reason: "not_found" };
  }
}

/**
 * The UPDATE matched zero rows. Read the current row to explain why, so the
 * HTTP layer can return the right status code (404 / 409 / 429).
 */
async function disambiguateFailure(
  auditId: string,
  skipLimit: boolean
): Promise<RetryResult> {
  const row: AuditRow | undefined =
    await AuditProcessModel.findRetryStateById(auditId);

  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  if (row.status !== "failed") {
    return {
      ok: false,
      reason: "not_failed",
      currentStatus: row.status,
      retryCount: row.retry_count,
    };
  }
  if (!skipLimit && row.retry_count >= MAX_RETRIES) {
    return { ok: false, reason: "limit_exceeded", retryCount: row.retry_count };
  }
  return { ok: false, reason: "not_failed", currentStatus: row.status };
}
