import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export interface PmsJobEvent {
  id: string;
  pms_job_id: number;
  actor_user_id: number | null;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: Date | string;
  actor_name?: string | null;
  actor_email?: string | null;
}

export class PmsJobEventModel extends BaseModel {
  protected static tableName = "pms_job_events";
  protected static jsonFields = ["metadata"];

  static async create(
    data: Omit<PmsJobEvent, "id" | "created_at">,
    trx?: QueryContext
  ): Promise<PmsJobEvent> {
    const serialized = this.serializeJsonFields(data as Record<string, unknown>);
    const [row] = await this.table(trx).insert(serialized).returning("*");
    return this.deserializeJsonFields(row);
  }

  static async listForJob(
    pmsJobId: number,
    trx?: QueryContext
  ): Promise<PmsJobEvent[]> {
    const rows = await this.table(trx)
      .leftJoin("users", "users.id", "pms_job_events.actor_user_id")
      .where("pms_job_events.pms_job_id", pmsJobId)
      .orderBy("pms_job_events.created_at", "desc")
      .select(
        "pms_job_events.*",
        "users.email as actor_email",
        db.raw(
          "COALESCE(users.name, NULLIF(CONCAT_WS(' ', users.first_name, users.last_name), ''), users.email) AS actor_name"
        )
      );

    return rows.map((row: unknown) => this.deserializeJsonFields(row));
  }
}
