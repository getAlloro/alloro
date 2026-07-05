import { BaseModel, QueryContext } from "./BaseModel";

export interface IOsDocumentLock {
  document_id: string;
  locked_by: number;
  acquired_at: Date;
  heartbeat_at: Date;
  expires_at: Date;
}

/**
 * os.document_locks — single-editor locks for OS documents
 * (plans/07042026-alloro-os-admin-port, D8: HTTP heartbeat, no WebSockets).
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 * P1 ships only what the lock reaper needs; P2 adds acquire/heartbeat/release.
 */
export class OsDocumentLockModel extends BaseModel {
  protected static tableName = "os.document_locks";

  /**
   * Reaper support: hard-delete locks whose expiry has passed. Idempotent by
   * predicate (§21.1) — re-runs and overlapping ticks only ever delete rows
   * that are already expired at call time.
   */
  static async deleteExpired(now: Date, trx?: QueryContext): Promise<number> {
    return this.table(trx).where("expires_at", "<", now).del();
  }
}
