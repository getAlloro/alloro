import { BaseModel, QueryContext } from "./BaseModel";
import type { FinalStage } from "./LeadgenSessionModel";

/**
 * Event names share the same enum as `FinalStage`. Re-exporting via type alias
 * keeps a single source of truth in `LeadgenSessionModel.ts`.
 */
export type LeadgenEventName = FinalStage;

export interface ILeadgenEvent {
  id: string;
  session_id: string;
  event_name: LeadgenEventName;
  event_data: Record<string, unknown> | null;
  created_at: Date;
}

export class LeadgenEventModel extends BaseModel {
  protected static tableName = "leadgen_events";

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<ILeadgenEvent | undefined> {
    return super.findById(id, trx);
  }

  /** Raw insert — caller owns the exact column set (event_data may be a
   * JSON string, an object, or null depending on the call site). */
  static async insertRow(
    data: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert(data);
  }

  /** Idempotency probe: does a (session_id, event_name) row already exist? */
  static async existsForSessionEvent(
    sessionId: string,
    eventName: string,
    trx?: QueryContext
  ): Promise<boolean> {
    const existing = await this.table(trx)
      .select("id")
      .where({ session_id: sessionId, event_name: eventName })
      .first();
    return Boolean(existing);
  }

  /** All events for a session, oldest-first (admin detail view). */
  static async findBySessionId(
    sessionId: string,
    trx?: QueryContext
  ): Promise<ILeadgenEvent[]> {
    return this.table(trx)
      .where({ session_id: sessionId })
      .orderBy("created_at", "asc");
  }
}
