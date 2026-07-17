/**
 * LeadgenSubmissionDetail
 *
 * Right-side slide-in drawer for a single leadgen session. Hand-rolled using
 * framer-motion AnimatePresence (no existing drawer component in this repo).
 * Fetches full detail via getSubmission() on open, shows session summary,
 * event timeline, and a compact audit snapshot.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, RefreshCw } from "lucide-react";
import {
  deleteSubmission,
  getSubmission,
  rerunSubmission,
} from "../../../api/leadgenSubmissions";
import { useConfirm } from "../../ui/ConfirmModal";
import type { SubmissionDetail } from "../../../types/leadgen";
import { logger } from "../../../lib/logger";
import LiveIndicator from "./LeadgenSubmissionDetail/LiveIndicator";
import SummaryCard from "./LeadgenSubmissionDetail/SummaryCard";
import EventTimeline from "./LeadgenSubmissionDetail/EventTimeline";
import AuditPayloadBar from "./LeadgenSubmissionDetail/AuditPayloadBar";
import AuditPayloadSheet from "./LeadgenSubmissionDetail/AuditPayloadSheet";

interface Props {
  submissionId: string | null;
  onClose: () => void;
  onDeleted?: () => void;
  /**
   * Fires every time the drawer's live-polling loop receives a fresh detail
   * snapshot. Parent uses this to update the matching row in the list so
   * final_stage / last_seen_at stay in sync while the drawer is open.
   */
  onDetailUpdate?: (detail: SubmissionDetail) => void;
}

export default function LeadgenSubmissionDetail({
  submissionId,
  onClose,
  onDeleted,
  onDetailUpdate,
}: Props) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [rerunNotice, setRerunNotice] = useState<string | null>(null);
  const [payloadOpen, setPayloadOpen] = useState(false);
  // `fetching` is true during the in-flight request of a live-poll tick;
  // drives the LIVE indicator's pulse. Distinct from `loading`, which only
  // gates the initial skeleton state.
  const [fetching, setFetching] = useState(false);
  const confirm = useConfirm();

  // Keep the latest onDetailUpdate in a ref so the polling loop's closure
  // always calls the current parent callback without needing to restart.
  const onDetailUpdateRef = useRef(onDetailUpdate);
  onDetailUpdateRef.current = onDetailUpdate;

  const handleDelete = async () => {
    if (!submissionId) return;
    const ok = await confirm({
      title: "Delete session",
      message:
        "Delete this session and all its events? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      setDeleting(true);
      await deleteSubmission(submissionId);
      onDeleted?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete submission";
      setError(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Admin rerun — bypasses the 3-retry cap the public endpoint enforces and
  // does NOT increment retry_count. Optimistically flips the local audit
  // status to "pending" so the UI reflects the new state before the next
  // live-poll tick lands.
  const handleRerun = async () => {
    if (!submissionId || !detail?.audit) return;
    if (detail.audit.status !== "failed") return;
    const ok = await confirm({
      title: "Rerun audit",
      message:
        "Re-enqueue this failed audit? This bypasses the 3-retry cap and does not increment retry_count.",
      confirmLabel: "Rerun",
    });
    if (!ok) return;
    try {
      setRerunning(true);
      setRerunNotice(null);
      await rerunSubmission(submissionId);
      setDetail((prev) =>
        prev && prev.audit
          ? {
              ...prev,
              audit: {
                ...prev.audit,
                status: "pending",
                error_message: null,
              },
            }
          : prev
      );
      setRerunNotice("Rerun queued");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to rerun audit";
      setRerunNotice(msg);
    } finally {
      setRerunning(false);
    }
  };

  // Live polling — request-after-response with a 500ms delay between ticks.
  // Runs for the lifetime of the drawer (same submissionId). Pauses while the
  // tab is hidden so a backgrounded admin doesn't hammer the API. Stops
  // cleanly when submissionId changes or the component unmounts.
  useEffect(() => {
    if (!submissionId) {
      setDetail(null);
      setError(null);
      setPayloadOpen(false);
      return;
    }
    // Different session opened — reset the payload sheet so it doesn't
    // carry over visible state from the previous row.
    setPayloadOpen(false);

    let cancelled = false;
    const POLL_GAP_MS = 500;

    setLoading(true);
    setError(null);

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = window.setTimeout(resolve, ms);
        // If cancelled mid-wait, still let the timer clear naturally — the
        // cancelled flag gates the next iteration so no fetch actually fires.
        void t;
      });

    const waitForVisible = async () => {
      if (typeof document === "undefined") return;
      while (!cancelled && document.visibilityState === "hidden") {
        await new Promise<void>((resolve) => {
          const handler = () => {
            document.removeEventListener("visibilitychange", handler);
            resolve();
          };
          document.addEventListener("visibilitychange", handler);
        });
      }
    };

    (async () => {
      let isFirst = true;
      while (!cancelled) {
        await waitForVisible();
        if (cancelled) break;

        setFetching(true);
        try {
          const d = await getSubmission(submissionId);
          if (cancelled) break;
          setDetail(d);
          onDetailUpdateRef.current?.(d);
          setError(null);
          if (isFirst) {
            setLoading(false);
            isFirst = false;
          }
        } catch (err: unknown) {
          if (cancelled) break;
          const msg =
            err instanceof Error ? err.message : "Failed to load submission";
          // Only surface the error on the INITIAL fetch — polling glitches
          // shouldn't replace a rendered drawer with a red banner. Log and
          // try again next tick.
          if (isFirst) {
            setError(msg);
            setLoading(false);
            isFirst = false;
          } else {
            logger.warn("[LeadgenDetail] poll tick failed:", msg);
          }
        } finally {
          if (!cancelled) setFetching(false);
        }

        if (cancelled) break;
        await wait(POLL_GAP_MS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  // ESC to close
  useEffect(() => {
    if (!submissionId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submissionId, onClose]);

  const isOpen = !!submissionId;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            className="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 backdrop-blur px-6 py-4 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-base font-bold text-alloro-navy shrink-0">
                  Submission detail
                </h2>
                <LiveIndicator fetching={fetching} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {detail?.audit?.status === "failed" && (
                  <button
                    onClick={handleRerun}
                    disabled={rerunning}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-alloro-navy hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                    title="Re-enqueue this failed audit (bypasses 3-retry cap)"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${rerunning ? "animate-spin" : ""}`}
                    />
                    {rerunning ? "Rerunning..." : "Rerun"}
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  disabled={deleting || !detail}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-200 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                  title="Delete session"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? "Deleting..." : "Delete"}
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-6">
              {rerunNotice && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    rerunNotice === "Rerun queued"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {rerunNotice}
                </div>
              )}

              {loading && (
                <div className="space-y-3">
                  <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
                  <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
                </div>
              )}

              {!loading && error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              {!loading && !error && detail && (
                <>
                  <SummaryCard detail={detail} />
                  <EventTimeline
                    events={detail.events}
                    hasAudit={Boolean(detail.session.audit_id)}
                  />
                  {detail.audit && !payloadOpen && (
                    <AuditPayloadBar
                      audit={detail.audit}
                      onOpen={() => setPayloadOpen(true)}
                    />
                  )}
                </>
              )}
            </div>
            {/* Slide-up dark payload deck — only mounts when opened so
                the motion enter animation plays each time. */}
            <AnimatePresence>
              {payloadOpen && detail?.audit && (
                <AuditPayloadSheet
                  audit={detail.audit}
                  onClose={() => setPayloadOpen(false)}
                />
              )}
            </AnimatePresence>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
