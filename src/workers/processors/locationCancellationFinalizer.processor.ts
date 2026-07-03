/**
 * Location Cancellation Finalizer (tick)
 *
 * Runs hourly via BullMQ repeatable job. Flips locations whose
 * pending_cancellation window has passed to `cancelled`
 * (plans/07032026-multi-location-billing, Phase B).
 *
 * Idempotent by predicate (§21.1): the sweep query only returns rows still
 * pending with a passed effective date, so re-runs, overlapping ticks, and
 * manual triggers are all safe. No Stripe calls happen here — quantity /
 * subscription changes were made at cancel time; this tick is bookkeeping
 * plus the visibility flip (cancelled rows leave the client's default
 * location list). All logic lives in the lifecycle service (§21.3).
 */

import { Job } from "bullmq";
import { finalizeDueCancellations } from "../../controllers/locations/feature-services/LocationLifecycleService";
import logger from "../../lib/logger";

export async function processLocationCancellationFinalizerTick(
  _job: Job
): Promise<void> {
  try {
    const flipped = await finalizeDueCancellations(new Date());
    if (flipped > 0) {
      logger.info(
        `[LOCATION-FINALIZER] Finalized ${flipped} due location cancellation(s)`
      );
    }
  } catch (err) {
    // §21.4 — full context, then rethrow so BullMQ retry/backoff applies
    logger.error(
      { err: (err as Error)?.message },
      "[LOCATION-FINALIZER] Tick failed:"
    );
    throw err;
  }
}
