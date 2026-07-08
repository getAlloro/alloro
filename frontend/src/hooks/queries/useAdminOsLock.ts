import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import {
  adminOsAcquireLock,
  adminOsGetLock,
  adminOsHeartbeatLock,
  adminOsReleaseLock,
} from "../../api/admin-os";
import { ApiError } from "../../api";

/**
 * Edit-lock lifecycle for the OS editor (master spec D8 — HTTP heartbeat, no
 * WebSockets): acquire on mount, heartbeat every 45s (TTL is 120s server-
 * side), best-effort release on unmount. Acquiring is a side-effect
 * lifecycle, not cached server state, so it lives in effect state rather
 * than a query (§15.1 governs fetched data; nothing here is mirrored).
 */

const OS_LOCK_HEARTBEAT_MS = 45_000;

export type OsLockState = "acquiring" | "held" | "blocked" | "error";

export type AdminOsLockHandle = {
  state: OsLockState;
  /** True while WE hold the lock — the editor may write. */
  isHeld: boolean;
  /** True when someone else holds it — banner + read-only editor. */
  heldByOther: boolean;
  /** users.id of the current holder when blocked (for the banner name). */
  heldByUserId: number | null;
  /** Re-attempt acquisition (retry button on the banner). */
  retry: () => void;
};

export function useAdminOsLock(
  documentId: string | null,
  enabled = true,
): AdminOsLockHandle {
  const [state, setState] = useState<OsLockState>("acquiring");
  const [heldByUserId, setHeldByUserId] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const isHeldRef = useRef(false);

  // Acquire on mount / retry; release on unmount (fire-and-forget — the
  // server-side TTL + reaper cover a lost release, so failures are benign).
  useEffect(() => {
    if (!documentId || !enabled) return;
    let cancelled = false;
    setState("acquiring");
    setHeldByUserId(null);

    adminOsAcquireLock(documentId)
      .then(() => {
        if (cancelled) return;
        isHeldRef.current = true;
        setState("held");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.code === "OS_LOCK_HELD") {
          setState("blocked");
          adminOsGetLock(documentId)
            .then(({ lock }) => {
              if (!cancelled) setHeldByUserId(lock?.locked_by ?? null);
            })
            .catch(() => {
              // Holder lookup is cosmetic; the blocked state already renders.
            });
          return;
        }
        setState("error");
      });

    return () => {
      cancelled = true;
      if (isHeldRef.current) {
        isHeldRef.current = false;
        adminOsReleaseLock(documentId).catch(() => {
          // Best-effort: an unreleased lock expires via TTL + reaper job.
        });
      }
    };
  }, [documentId, enabled, attempt]);

  // Heartbeat while held. A lost lock (OS_LOCK_NOT_HELD) flips to blocked;
  // transient network failures keep the lock and rely on the next beat
  // (TTL 120s comfortably spans one missed 45s interval).
  useEffect(() => {
    if (state !== "held" || !documentId) return;
    const interval = window.setInterval(() => {
      adminOsHeartbeatLock(documentId).catch((error: unknown) => {
        if (error instanceof ApiError && error.code === "OS_LOCK_NOT_HELD") {
          isHeldRef.current = false;
          setState("blocked");
          toast.error("Your edit lock expired — the document is now read-only.");
        }
      });
    }, OS_LOCK_HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [state, documentId]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    state,
    isHeld: state === "held",
    heldByOther: state === "blocked",
    heldByUserId,
    retry,
  };
}
