import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-hot-toast";
import {
  startBulkSeoGenerate,
  getBulkSeoStatus,
  getActiveBulkSeoJob,
} from "../../api/websites";
import type { BulkSeoStatus } from "../../api/websites";
import { getErrorMessage } from "./websiteDetail.utils";

/**
 * Bulk SEO generation state + polling for WebsiteDetail.
 * Moved verbatim from WebsiteDetail — preserves the original internal hook
 * call order (2× useState, useRef, 3× useCallback, 2× useEffect).
 */
export function useWebsiteDetailBulkSeo(
  id: string | undefined,
  invalidateWebsite: (uuid: string) => Promise<void>,
) {
  // Bulk SEO generation state
  const [, setBulkSeoJobId] = useState<string | null>(null);
  const [bulkSeoStatus, setBulkSeoStatus] = useState<BulkSeoStatus | null>(null);
  const bulkSeoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopBulkSeoPoll = useCallback(() => {
    if (bulkSeoIntervalRef.current) {
      clearInterval(bulkSeoIntervalRef.current);
      bulkSeoIntervalRef.current = null;
    }
  }, []);

  const pollBulkSeo = useCallback(async (jobId: string) => {
    if (!id) return;
    try {
      const res = await getBulkSeoStatus(id, jobId);
      setBulkSeoStatus(res.data);
      if (res.data.status === "completed" || res.data.status === "failed") {
        stopBulkSeoPoll();
        if (res.data.status === "completed") {
          invalidateWebsite(id!);
          setTimeout(() => {
            setBulkSeoStatus(null);
            setBulkSeoJobId(null);
          }, 2000);
        }
      }
    } catch {
      stopBulkSeoPoll();
    }
  }, [id, stopBulkSeoPoll, invalidateWebsite]);

  const startBulkPageSeo = useCallback(async (paths?: string[]) => {
    if (!id) return;
    try {
      const res = await startBulkSeoGenerate(id, "page", undefined, paths);
      setBulkSeoJobId(res.job_id);
      setBulkSeoStatus({ id: res.job_id, status: "queued", total_count: 0, completed_count: 0, failed_count: 0, failed_items: null, item_statuses: [] });
      stopBulkSeoPoll();
      await pollBulkSeo(res.job_id);
      bulkSeoIntervalRef.current = setInterval(() => pollBulkSeo(res.job_id), 2000);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to start SEO generation"));
    }
  }, [id, pollBulkSeo, stopBulkSeoPoll]);

  useEffect(() => {
    return () => stopBulkSeoPoll();
  }, [stopBulkSeoPoll]);

  // On mount: check for active page SEO job and resume polling
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getActiveBulkSeoJob(id, "page");
        if (cancelled) return;
        if (res.data && (res.data.status === "queued" || res.data.status === "processing")) {
          setBulkSeoJobId(res.data.id);
          setBulkSeoStatus(res.data);
          bulkSeoIntervalRef.current = setInterval(() => pollBulkSeo(res.data!.id), 2000);
        }
      } catch {
        // Silently ignore
      }
    })();
    return () => { cancelled = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isBulkSeoActive = bulkSeoStatus !== null && (bulkSeoStatus.status === "queued" || bulkSeoStatus.status === "processing");

  return { bulkSeoStatus, startBulkPageSeo, isBulkSeoActive };
}
