import { useState, useEffect, useCallback, useRef } from "react";
import { getBulkSeoStatus, startBulkSeoGenerate, getActiveBulkSeoJob } from "../api/websites";
import type { BulkSeoStatus } from "../api/websites";
import { getErrorMessage } from "../lib/errorMessage";

const POLL_INTERVAL = 2000;

interface UseBulkSeoProgressReturn {
  start: () => Promise<void>;
  status: BulkSeoStatus | null;
  isActive: boolean;
  error: string | null;
}

export function useBulkSeoProgress(
  projectId: string,
  entityType: "page" | "post",
  postTypeId?: string,
  onComplete?: () => void
): UseBulkSeoProgressReturn {
  const [status, setStatus] = useState<BulkSeoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const mountedRef = useRef(true);

  const isActive = status !== null && (status.status === "queued" || status.status === "processing");

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const poll = useCallback(async (jId: string) => {
    if (!mountedRef.current) return;
    try {
      const res = await getBulkSeoStatus(projectId, jId);
      if (!mountedRef.current) return;
      setStatus(res.data);
      if (res.data.status === "completed" || res.data.status === "failed") {
        stopPolling();
        if (res.data.status === "completed") {
          onCompleteRef.current?.();
          setTimeout(() => {
            if (mountedRef.current) setStatus(null);
          }, 2000);
        }
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setError(getErrorMessage(err));
      stopPolling();
    }
  }, [projectId, stopPolling]);

  const startPolling = useCallback((jId: string) => {
    stopPolling();
    poll(jId);
    intervalRef.current = setInterval(() => poll(jId), POLL_INTERVAL);
  }, [poll, stopPolling]);

  const start = useCallback(async () => {
    try {
      setError(null);
      const res = await startBulkSeoGenerate(projectId, entityType, postTypeId);
      const jId = res.job_id;
      setStatus({
        id: jId,
        status: "queued",
        total_count: 0,
        completed_count: 0,
        failed_count: 0,
        failed_items: null,
        item_statuses: [],
      });
      startPolling(jId);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }, [projectId, entityType, postTypeId, startPolling]);

  // On mount: check for existing active job and resume polling
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getActiveBulkSeoJob(projectId, entityType, postTypeId);
        if (cancelled || !mountedRef.current) return;
        if (res.data) {
          setStatus(res.data);
          if (res.data.status === "queued" || res.data.status === "processing") {
            startPolling(res.data.id);
          }
        }
      } catch {
        // Silently ignore — not critical
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, entityType, postTypeId, startPolling]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [stopPolling]);

  return { start, status, isActive, error };
}
