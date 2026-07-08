/**
 * Edit-lock semantics for OS documents (master spec D8: HTTP heartbeat, no
 * WebSockets; TTL from OS_LOCK_TTL_SECONDS). One live lock per document:
 *  - acquire fails OS_LOCK_HELD (409) while another user's lock is live;
 *  - heartbeat extends expires_at by the TTL, OS_LOCK_NOT_HELD (409) once lost;
 *  - release is idempotent and owner-only (OS_LOCK_ACCESS_DENIED otherwise).
 * Expired rows behave as absent here; the os-lock-reaper job deletes them.
 */

import { getOsKnowledgeBaseConfig } from "../../../config/osKnowledgeBase";
import {
  IOsDocumentLock,
  OsDocumentLockModel,
} from "../../../models/OsDocumentLockModel";
import { OsDocumentModel } from "../../../models/OsDocumentModel";
import { OsActivityModel } from "../../../models/OsActivityModel";
import { OsError } from "../feature-utils/OsError";

const MS_PER_SECOND = 1000;

function lockExpiry(): Date {
  const { lockTtlSeconds } = getOsKnowledgeBaseConfig();
  return new Date(Date.now() + lockTtlSeconds * MS_PER_SECOND);
}

function isLiveLock(lock: IOsDocumentLock): boolean {
  return new Date(lock.expires_at).getTime() > Date.now();
}

async function requireDocument(documentId: string): Promise<void> {
  const document = await OsDocumentModel.findDocumentById(documentId);
  if (!document) {
    throw new OsError("OS_DOCUMENT_NOT_FOUND", "Document not found.", {
      documentId,
    });
  }
}

export class OsLockService {
  /** Current live lock, or null (expired rows count as absent). */
  static async getLock(documentId: string): Promise<IOsDocumentLock | null> {
    await requireDocument(documentId);
    const lock = await OsDocumentLockModel.findByDocumentId(documentId);
    return lock && isLiveLock(lock) ? lock : null;
  }

  static async acquire(
    documentId: string,
    userId: number
  ): Promise<IOsDocumentLock> {
    await requireDocument(documentId);
    const existing = await OsDocumentLockModel.findByDocumentId(documentId);
    if (existing && existing.locked_by !== userId && isLiveLock(existing)) {
      throw new OsError(
        "OS_LOCK_HELD",
        "Someone else is editing this document.",
        { locked_by: existing.locked_by, since: existing.acquired_at }
      );
    }
    const lock = await OsDocumentLockModel.upsertLock(
      documentId,
      userId,
      lockExpiry()
    );
    await OsActivityModel.log({
      actor_id: userId,
      action: "lock.acquired",
      target_type: "lock",
      target_id: documentId,
    });
    return lock;
  }

  /** Extend the caller's lock by one TTL; 409 once the lock is lost. */
  static async heartbeat(
    documentId: string,
    userId: number
  ): Promise<IOsDocumentLock> {
    const extended = await OsDocumentLockModel.heartbeatLock(
      documentId,
      userId,
      lockExpiry()
    );
    if (extended === 0) {
      throw new OsError("OS_LOCK_NOT_HELD", "You no longer hold this lock.", {
        documentId,
      });
    }
    const lock = await OsDocumentLockModel.findByDocumentId(documentId);
    if (!lock) {
      throw new OsError("OS_LOCK_NOT_HELD", "You no longer hold this lock.", {
        documentId,
      });
    }
    return lock;
  }

  /** Idempotent, owner-only release. */
  static async release(
    documentId: string,
    userId: number
  ): Promise<{ released: boolean }> {
    const existing = await OsDocumentLockModel.findByDocumentId(documentId);
    if (!existing) return { released: true };
    if (existing.locked_by !== userId) {
      throw new OsError(
        "OS_LOCK_ACCESS_DENIED",
        "You do not hold this lock.",
        { locked_by: existing.locked_by }
      );
    }
    await OsDocumentLockModel.releaseLock(documentId);
    await OsActivityModel.log({
      actor_id: userId,
      action: "lock.released",
      target_type: "lock",
      target_id: documentId,
    });
    return { released: true };
  }

  /** Guard for writes (draft save / publish): reject on a foreign live lock. */
  static async assertNoForeignLiveLock(
    documentId: string,
    userId: number
  ): Promise<void> {
    const existing = await OsDocumentLockModel.findByDocumentId(documentId);
    if (existing && existing.locked_by !== userId && isLiveLock(existing)) {
      throw new OsError(
        "OS_LOCK_HELD",
        "Someone else is editing this document.",
        { locked_by: existing.locked_by, since: existing.acquired_at }
      );
    }
  }

  /** Archive path: drop any lock row without ownership checks (audited there). */
  static async forceRelease(documentId: string): Promise<void> {
    await OsDocumentLockModel.releaseLock(documentId);
  }
}
