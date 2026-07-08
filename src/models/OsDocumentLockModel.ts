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
 * One row per document (PK document_id); expiry-based, reaped by the
 * os-lock-reaper job. Lock POLICY (who may take/extend/release) lives in
 * OsLockService — this model is plain row access.
 *
 * §11.7 posture: os.* tables are internal-admin single-tenant by design;
 * isolation is the super-admin gate on every /api/admin/os route (§11.1).
 */
export class OsDocumentLockModel extends BaseModel {
  protected static tableName = "os.document_locks";

  static async findByDocumentId(
    documentId: string,
    trx?: QueryContext
  ): Promise<IOsDocumentLock | undefined> {
    return this.table(trx).where({ document_id: documentId }).first();
  }

  /** Take or refresh the lock row for a document (acquire + override paths). */
  static async upsertLock(
    documentId: string,
    lockedBy: number,
    expiresAt: Date,
    trx?: QueryContext
  ): Promise<IOsDocumentLock> {
    const fields = {
      locked_by: lockedBy,
      acquired_at: new Date(),
      heartbeat_at: new Date(),
      expires_at: expiresAt,
    };
    const [row] = await this.table(trx)
      .insert({ document_id: documentId, ...fields })
      .onConflict("document_id")
      .merge(fields)
      .returning("*");
    return row;
  }

  /** Extend the holder's lock; returns 0 when the holder no longer matches. */
  static async heartbeatLock(
    documentId: string,
    lockedBy: number,
    expiresAt: Date,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ document_id: documentId, locked_by: lockedBy })
      .update({ heartbeat_at: new Date(), expires_at: expiresAt });
  }

  static async releaseLock(
    documentId: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ document_id: documentId }).del();
  }

  /**
   * Reaper support: hard-delete locks whose expiry has passed. Idempotent by
   * predicate (§21.1) — re-runs and overlapping ticks only ever delete rows
   * that are already expired at call time.
   */
  static async deleteExpired(now: Date, trx?: QueryContext): Promise<number> {
    return this.table(trx).where("expires_at", "<", now).del();
  }
}
