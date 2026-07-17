import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

// ── Interfaces ──────────────────────────────────────────────────────

export interface ISchedule {
  id: number;
  agent_key: string;
  display_name: string;
  description: string | null;
  schedule_type: "cron" | "interval_days";
  cron_expression: string | null;
  interval_days: number | null;
  timezone: string;
  enabled: boolean;
  last_run_at: Date | null;
  next_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface IScheduleRun {
  id: number;
  schedule_id: number;
  logical_run_key: string | null;
  status: "running" | "completed" | "failed";
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
  summary: Record<string, unknown> | null;
  error: string | null;
  created_at: Date;
}

export interface ScheduleExecutionLock {
  release(): Promise<void>;
}

interface AdvisoryLockResult {
  rows: Array<{ acquired: boolean }>;
}

const SCHEDULE_EXECUTION_LOCK_NAMESPACE = 1095519311;

// ── Schedules ───────────────────────────────────────────────────────

export class ScheduleModel extends BaseModel {
  protected static tableName = "schedules";
  protected static jsonFields: string[] = [];

  static async listAll(trx?: QueryContext): Promise<ISchedule[]> {
    return this.table(trx).orderBy("id", "asc");
  }

  static async findById(id: number, trx?: QueryContext): Promise<ISchedule | undefined> {
    return super.findById(id, trx);
  }

  static async findByIdForUpdate(
    id: number,
    trx: QueryContext,
  ): Promise<ISchedule | undefined> {
    return this.table(trx).where({ id }).forUpdate().first();
  }

  static async findByAgentKey(agentKey: string, trx?: QueryContext): Promise<ISchedule | undefined> {
    return this.table(trx).where({ agent_key: agentKey }).first();
  }

  static async create(data: Partial<ISchedule>, trx?: QueryContext): Promise<ISchedule> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateAndReturn(id: number, data: Partial<ISchedule>, trx?: QueryContext): Promise<ISchedule | undefined> {
    const [updated] = await this.table(trx)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning("*");
    return updated;
  }

  static async remove(id: number, trx?: QueryContext): Promise<boolean> {
    const count = await this.table(trx).where({ id }).del();
    return count > 0;
  }

  static async findDueSchedules(trx?: QueryContext): Promise<ISchedule[]> {
    return this.table(trx)
      .where("enabled", true)
      .where("next_run_at", "<=", new Date())
      .orderBy("next_run_at", "asc");
  }
}

// ── Schedule Runs ───────────────────────────────────────────────────

export class ScheduleRunModel {
  static table(trx?: QueryContext) {
    return (trx || db)("schedule_runs");
  }

  static async listByScheduleId(
    scheduleId: number,
    limit = 20,
    offset = 0,
    trx?: QueryContext,
  ): Promise<IScheduleRun[]> {
    return this.table(trx)
      .where({ schedule_id: scheduleId })
      .orderBy("started_at", "desc")
      .limit(limit)
      .offset(offset);
  }

  static async countByScheduleId(scheduleId: number, trx?: QueryContext): Promise<number> {
    const [{ count }] = await this.table(trx)
      .where({ schedule_id: scheduleId })
      .count("id as count");
    return Number(count);
  }

  static async createRun(scheduleId: number, trx?: QueryContext): Promise<IScheduleRun> {
    const [run] = await this.table(trx)
      .insert({
        schedule_id: scheduleId,
        status: "running",
        started_at: new Date(),
        created_at: new Date(),
      })
      .returning("*");
    return run;
  }

  static async findRunByLogicalKey(
    scheduleId: number,
    logicalRunKey: string,
    trx?: QueryContext,
  ): Promise<IScheduleRun | undefined> {
    return this.table(trx)
      .where({
        schedule_id: scheduleId,
        logical_run_key: logicalRunKey,
      })
      .first();
  }

  static async createOrFindRunForLogicalJob(
    scheduleId: number,
    logicalRunKey: string,
    trx?: QueryContext,
  ): Promise<IScheduleRun> {
    const [created] = await this.table(trx)
      .insert({
        schedule_id: scheduleId,
        logical_run_key: logicalRunKey,
        status: "running",
        started_at: new Date(),
        created_at: new Date(),
      })
      .onConflict(["schedule_id", "logical_run_key"])
      .ignore()
      .returning("*");
    if (created) return created;

    const existing = await this.findRunByLogicalKey(
      scheduleId,
      logicalRunKey,
      trx,
    );
    if (!existing) {
      throw new Error(
        `Could not create or recover logical schedule run ${logicalRunKey}.`
      );
    }
    return existing;
  }

  /**
   * Serialize active-run acquisition on the parent schedule row.
   *
   * The row lock closes the check-then-insert race between two workers carrying
   * different logical keys for the same schedule. The logical-key uniqueness
   * constraint still owns same-job recovery; this lock owns cross-job
   * exclusion.
   */
  static async acquireRunForLogicalJob(
    scheduleId: number,
    logicalRunKey: string,
  ): Promise<IScheduleRun | undefined> {
    return ScheduleModel.transaction(async (trx) => {
      const schedule = await ScheduleModel.findByIdForUpdate(scheduleId, trx);
      if (!schedule) {
        throw new Error(`Schedule ${scheduleId} not found while acquiring a run.`);
      }

      const existing = await this.findRunByLogicalKey(
        scheduleId,
        logicalRunKey,
        trx,
      );
      if (existing) return existing;

      if (await this.hasActiveRun(scheduleId, trx)) return undefined;

      return this.createOrFindRunForLogicalJob(
        scheduleId,
        logicalRunKey,
        trx,
      );
    });
  }

  /**
   * Own one schedule's execution for the full handler lifetime.
   *
   * A PostgreSQL session advisory lock closes the gap left by a transaction
   * row lock: the row lock protects check + insert, but releases before paid
   * work starts. Keeping this dedicated connection checked out until release
   * prevents scheduled/scheduled, manual/manual, and scheduled/manual overlap.
   * PostgreSQL releases the lock automatically if the process or connection
   * dies, so a BullMQ redelivery can recover without a permanent lease row.
   */
  static async acquireExecutionLock(
    scheduleId: number,
  ): Promise<ScheduleExecutionLock | undefined> {
    const connection = await db.client.acquireConnection();

    try {
      const result = await db
        .raw<AdvisoryLockResult>(
          "SELECT pg_try_advisory_lock(?, ?) AS acquired",
          [SCHEDULE_EXECUTION_LOCK_NAMESPACE, scheduleId],
        )
        .connection(connection);

      if (!result.rows[0]?.acquired) {
        await db.client.releaseConnection(connection);
        return undefined;
      }
    } catch (error) {
      await db.client.destroyRawConnection(connection).catch(() => undefined);
      throw error;
    }

    let released = false;
    return {
      release: async (): Promise<void> => {
        if (released) return;
        released = true;

        try {
          const result = await db
            .raw<AdvisoryLockResult>(
              "SELECT pg_advisory_unlock(?, ?) AS acquired",
              [SCHEDULE_EXECUTION_LOCK_NAMESPACE, scheduleId],
            )
            .connection(connection);
          if (!result.rows[0]?.acquired) {
            throw new Error(
              `PostgreSQL did not release the execution lock for schedule ${scheduleId}.`,
            );
          }
          await db.client.releaseConnection(connection);
        } catch (error) {
          // Never return a connection with uncertain lock state to the pool.
          await db.client.destroyRawConnection(connection).catch(() => undefined);
          throw error;
        }
      },
    };
  }

  static async claimLogicalRunKey(
    runId: number,
    scheduleId: number,
    logicalRunKey: string,
    trx?: QueryContext,
  ): Promise<IScheduleRun> {
    const [run] = await this.table(trx)
      .where({ id: runId, schedule_id: scheduleId })
      .where((query) => {
        query
          .whereNull("logical_run_key")
          .orWhere("logical_run_key", logicalRunKey);
      })
      .update({ logical_run_key: logicalRunKey })
      .returning("*");
    if (!run) {
      throw new Error(
        `Schedule run ${runId} is not claimable by logical job ${logicalRunKey}.`
      );
    }
    return run;
  }

  static async findRunByIdForSchedule(
    runId: number,
    scheduleId: number,
    trx?: QueryContext,
  ): Promise<IScheduleRun | undefined> {
    return this.table(trx)
      .where({ id: runId, schedule_id: scheduleId })
      .first();
  }

  static async resumeRun(
    runId: number,
    scheduleId: number,
    trx?: QueryContext,
  ): Promise<void> {
    const updated = await this.table(trx)
      .where({ id: runId, schedule_id: scheduleId, status: "failed" })
      .update({
        status: "running",
        completed_at: null,
        duration_ms: null,
        summary: null,
        error: null,
      });
    if (updated !== 1) {
      throw new Error(
        `Could not resume schedule run ${runId} for schedule ${scheduleId}.`
      );
    }
  }

  static async completeRun(
    runId: number,
    summary: Record<string, unknown>,
    trx?: QueryContext,
  ): Promise<void> {
    const now = new Date();
    const run = await this.table(trx).where({ id: runId }).first();
    const durationMs = run ? now.getTime() - new Date(run.started_at).getTime() : null;

    await this.table(trx).where({ id: runId }).update({
      status: "completed",
      completed_at: now,
      duration_ms: durationMs,
      summary: JSON.stringify(summary),
    });
  }

  static async failRun(
    runId: number,
    error: string,
    trx?: QueryContext,
  ): Promise<void> {
    const now = new Date();
    const run = await this.table(trx).where({ id: runId }).first();
    const durationMs = run ? now.getTime() - new Date(run.started_at).getTime() : null;

    await this.table(trx).where({ id: runId }).update({
      status: "failed",
      completed_at: now,
      duration_ms: durationMs,
      error,
    });
  }

  static async hasActiveRun(scheduleId: number, trx?: QueryContext): Promise<boolean> {
    const row = await this.table(trx)
      .where({ schedule_id: scheduleId, status: "running" })
      .first();
    return !!row;
  }

  static async latestRun(scheduleId: number, trx?: QueryContext): Promise<IScheduleRun | undefined> {
    return this.table(trx)
      .where({ schedule_id: scheduleId })
      .orderBy("started_at", "desc")
      .first();
  }
}
