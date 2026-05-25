import { BaseModel, QueryContext } from "./BaseModel";

export interface IGbpWorkEvent {
  id: string;
  work_item_id: string;
  actor_user_id: number | null;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: Date;
}

export class GbpWorkEventModel extends BaseModel {
  protected static tableName = "gbp_work_events";
  protected static jsonFields = ["metadata"];

  static async create(
    data: Partial<IGbpWorkEvent>,
    trx?: QueryContext
  ): Promise<IGbpWorkEvent> {
    const serialized = this.serializeJsonFields({
      ...data,
      created_at: data.created_at || new Date(),
    });
    const [result] = await this.table(trx).insert(serialized).returning("*");
    return this.deserializeJsonFields(result);
  }

  static async listByWorkItem(
    workItemId: string,
    trx?: QueryContext
  ): Promise<IGbpWorkEvent[]> {
    const rows = await this.table(trx)
      .where({ work_item_id: workItemId })
      .orderBy("created_at", "asc");
    return rows.map((row: IGbpWorkEvent) => this.deserializeJsonFields(row));
  }
}
