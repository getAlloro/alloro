import { BaseModel, QueryContext } from "./BaseModel";
import {
  OsActivityAction,
  OsActivityTargetType,
} from "../config/osActivityActions";

export interface IOsActivity {
  id: string;
  actor_id: number | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface INewOsActivity {
  actor_id: number | null;
  action: OsActivityAction;
  target_type: OsActivityTargetType;
  target_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * os.activity — the accountability layer for the flat all-admin OS domain:
 * every consequential state change writes one row with a controlled action
 * vocabulary (config/osActivityActions.ts). Append-only.
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 */
export class OsActivityModel extends BaseModel {
  protected static tableName = "os.activity";
  protected static jsonFields = ["metadata"];

  static async log(input: INewOsActivity, trx?: QueryContext): Promise<void> {
    await this.table(trx).insert({
      actor_id: input.actor_id,
      action: input.action,
      target_type: input.target_type,
      target_id: input.target_id ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
    });
  }

  static async listForTarget(
    targetType: OsActivityTargetType,
    targetId: string,
    limit: number,
    trx?: QueryContext
  ): Promise<IOsActivity[]> {
    const rows = await this.table(trx)
      .where({ target_type: targetType, target_id: targetId })
      .orderBy("created_at", "desc")
      .limit(limit);
    return rows.map((row: unknown) => this.deserializeJsonFields(row));
  }
}
