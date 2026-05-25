import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export type GbpDeploymentAttemptStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed";

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
