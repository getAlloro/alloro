import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export type GbpDeploymentAttemptStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed";

/**
 * How long a `running` attempt is presumed to be owned by a live worker. Past this,
 * the worker is presumed dead and the attempt can be taken over (see
 * claimRunningAttempt). A deployment's provider calls complete in seconds; five
 * minutes is far outside normal and well inside BullMQ's retry backoff.
 */
export const ATTEMPT_LEASE_MS = 5 * 60 * 1000;

/**
 * The explicit outcome of trying to claim a deployment attempt. Each state means
 * something different to a caller and they must NOT be collapsed into one signal
 * (a bare null cannot distinguish "someone else is working on this right now" from
 * "the provider already accepted this write"):
 *
 * - `claimed` — no prior attempt reached the provider. The caller owns
 *   `attempt` and may perform the provider write.
 * - `concurrent_attempt_running` — another worker holds a live lease on `attempt`
 *   and is working right now. The caller must NOT write; it should back off and
 *   leave finalization to the lease holder.
 * - `stale_attempt_running` — a previous attempt's lease expired (its worker is
 *   presumed dead). That attempt is failed and `attempt` is a fresh takeover the
 *   caller owns — but the dead worker may already have reached the provider, so
 *   the caller MUST reconcile against the provider before writing.
 * - `already_succeeded` — a previous attempt succeeded at the provider; `attempt`
 *   carries its recorded `response_payload`. The provider write is DONE. The caller
 *   must never re-send it; only local finalization remains.
 */
export type GbpAttemptClaimState =
  | "claimed"
  | "concurrent_attempt_running"
  | "stale_attempt_running"
  | "already_succeeded";

export interface GbpAttemptClaim {
  state: GbpAttemptClaimState;
  attempt: IGbpDeploymentAttempt;
}

export interface IGbpDeploymentAttempt {
  id: string;
  work_item_id: string;
  attempt_number: number;
  status: GbpDeploymentAttemptStatus;
  requested_by_user_id: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export class GbpDeploymentAttemptModel extends BaseModel {
  protected static tableName = "gbp_deployment_attempts";
  protected static jsonFields = ["request_payload", "response_payload"];

  static async create(
    data: Partial<IGbpDeploymentAttempt>,
    trx?: QueryContext
  ): Promise<IGbpDeploymentAttempt> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async createNext(
    data: Omit<Partial<IGbpDeploymentAttempt>, "attempt_number"> & {
      work_item_id: string;
    },
    trx?: QueryContext
  ): Promise<IGbpDeploymentAttempt> {
    const createAttempt = async (query: QueryContext) => {
      const workItem = await query("gbp_work_items")
        .where({ id: data.work_item_id })
        .forUpdate()
        .first("id");
      if (!workItem) {
        throw new Error("Cannot create GBP deployment attempt for missing work item.");
      }
      const attemptNumber = await this.nextAttemptNumber(data.work_item_id, query);
      return this.create({ ...data, attempt_number: attemptNumber }, query);
    };

    if (trx) return createAttempt(trx);
    return db.transaction(createAttempt);
  }

  /**
   * Claim the right to perform a provider write for a work item, returning an
   * EXPLICIT state (see GbpAttemptClaimState) rather than a signal that conflates
   * concurrent work with completed work.
   *
   * Runs under a `forUpdate()` lock on the work-item row inside a model-owned
   * transaction (§7.4), so two workers racing this method cannot both come away
   * believing they hold the claim.
   *
   * Taking over an expired lease is safe for absolute-value provider writes: the
   * takeover reconciles against the provider before writing, and the value it would
   * send is derived from the same persisted snapshot the dead worker used, so even a
   * worker that is slow rather than dead can only re-send an identical write.
   */
  static async claimRunningAttempt(
    data: Omit<Partial<IGbpDeploymentAttempt>, "attempt_number" | "status" | "started_at"> & {
      work_item_id: string;
    },
    options?: { leaseMs?: number },
    trx?: QueryContext
  ): Promise<GbpAttemptClaim> {
    const leaseMs = options?.leaseMs ?? ATTEMPT_LEASE_MS;

    const claim = async (query: QueryContext): Promise<GbpAttemptClaim> => {
      const workItem = await query("gbp_work_items")
        .where({ id: data.work_item_id })
        .forUpdate()
        .first("id");
      if (!workItem) {
        throw new Error("Cannot claim GBP deployment attempt for missing work item.");
      }

      // A succeeded attempt is terminal at the provider: the write landed. Report it
      // as its own state so the caller finalizes instead of re-sending.
      const succeeded = await this.table(query)
        .where({ work_item_id: data.work_item_id, status: "succeeded" })
        .orderBy("attempt_number", "desc")
        .first();
      if (succeeded) {
        return { state: "already_succeeded", attempt: this.deserializeJsonFields(succeeded) };
      }

      const running = await this.table(query)
        .where({ work_item_id: data.work_item_id, status: "running" })
        .orderBy("attempt_number", "desc")
        .first();

      if (running) {
        const startedAt = running.started_at ? new Date(running.started_at).getTime() : 0;
        if (Date.now() - startedAt <= leaseMs) {
          return {
            state: "concurrent_attempt_running",
            attempt: this.deserializeJsonFields(running),
          };
        }
        // The lease expired. Fail the abandoned attempt so it is never mistaken for
        // live work, then take over with a fresh one.
        await this.table(query).where({ id: running.id }).update({
          status: "failed",
          error_code: "ATTEMPT_LEASE_EXPIRED",
          error_message:
            "The worker holding this attempt stopped responding; the attempt was taken over.",
          completed_at: new Date(),
          updated_at: new Date(),
        });
        return {
          state: "stale_attempt_running",
          attempt: await this.insertRunning(data, query),
        };
      }

      return { state: "claimed", attempt: await this.insertRunning(data, query) };
    };

    if (trx) return claim(trx);
    return this.transaction(claim);
  }

  private static async insertRunning(
    data: Omit<Partial<IGbpDeploymentAttempt>, "attempt_number" | "status" | "started_at"> & {
      work_item_id: string;
    },
    query: QueryContext
  ): Promise<IGbpDeploymentAttempt> {
    return this.create(
      {
        ...data,
        attempt_number: await this.nextAttemptNumber(data.work_item_id, query),
        status: "running",
        started_at: new Date(),
      },
      query
    );
  }

  /**
   * @deprecated Conflates distinct claim states — a `null` return cannot tell a
   * caller whether another worker is running right now or whether the provider
   * already accepted the write, so callers cannot reconcile a partial completion.
   * Use {@link claimRunningAttempt} for new code. Retained unchanged only for the
   * review-reply and local-post deployment paths, which have not yet been migrated.
   */
  static async createRunningNext(
    data: Omit<Partial<IGbpDeploymentAttempt>, "attempt_number" | "status" | "started_at"> & {
      work_item_id: string;
    },
    trx?: QueryContext
  ): Promise<IGbpDeploymentAttempt | null> {
    const createAttempt = async (query: QueryContext) => {
      const workItem = await query("gbp_work_items")
        .where({ id: data.work_item_id })
        .forUpdate()
        .first("id");
      if (!workItem) {
        throw new Error("Cannot create GBP deployment attempt for missing work item.");
      }

      const activeAttempt = await this.table(query)
        .where({ work_item_id: data.work_item_id })
        .whereIn("status", ["running", "succeeded"])
        .first("id");
      if (activeAttempt) return null;

      const attemptNumber = await this.nextAttemptNumber(data.work_item_id, query);
      return this.create(
        {
          ...data,
          attempt_number: attemptNumber,
          status: "running",
          started_at: new Date(),
        },
        query
      );
    };

    if (trx) return createAttempt(trx);
    return db.transaction(createAttempt);
  }

  static async listByWorkItem(
    workItemId: string,
    trx?: QueryContext
  ): Promise<IGbpDeploymentAttempt[]> {
    const rows = await this.table(trx)
      .where({ work_item_id: workItemId })
      .orderBy("attempt_number", "asc");
    return rows.map((row: IGbpDeploymentAttempt) => this.deserializeJsonFields(row));
  }

  static async nextAttemptNumber(
    workItemId: string,
    trx?: QueryContext
  ): Promise<number> {
    const row = await this.table(trx)
      .where({ work_item_id: workItemId })
      .max("attempt_number as max")
      .first();
    return Number(row?.max || 0) + 1;
  }

  static async markRunning(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id }).update({
      status: "running",
      started_at: new Date(),
      updated_at: new Date(),
    });
  }

  static async markSucceeded(
    id: string,
    responsePayload: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({
      status: "succeeded",
      response_payload: this.toJson(responsePayload),
      completed_at: new Date(),
      updated_at: new Date(),
    });
  }

  static async markFailed(
    id: string,
    errorCode: string,
    errorMessage: string,
    responsePayload?: Record<string, unknown> | null,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({
      status: "failed",
      error_code: errorCode,
      error_message: errorMessage,
      response_payload: responsePayload ? this.toJson(responsePayload) : null,
      completed_at: new Date(),
      updated_at: new Date(),
    });
  }
}
