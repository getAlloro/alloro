/**
 * RankingInFlightBanner
 *
 * Quiet banner shown at the top of the rankings dashboard when a ranking
 * batch is processing. Doesn't try to render granular step progress —
 * just tells the user "an analysis is running, check back later" and
 * auto-dismisses when the batch completes.
 *
 * Polls /api/practice-ranking/batch/:batchId/status every 4s purely so
 * the banner can dismiss itself when the batch reaches a terminal state.
 *
 * Spec: plans/04282026-no-ticket-rankings-dashboard-in-flight-batch-banner/spec.md
 */

import { useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { getBatchStatus } from "../../api/practiceRanking";

const POLL_INTERVAL_MS = 4000;

interface Props {
  batchId: string;
  onComplete: () => void;
  onDismiss: () => void;
}

export function RankingInFlightBanner({
  batchId,
  onComplete,
  onDismiss,
}: Props) {
  const completedFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    async function poll() {
      try {
        const res = await getBatchStatus(batchId);
        if (cancelled) return;
        if (
          (res.status === "completed" || res.status === "failed") &&
          !completedFiredRef.current
        ) {
          completedFiredRef.current = true;
          if (!cancelled) onComplete();
          return;
        }
      } catch {
        /* silent — we don't show network errors on this banner */
      }
      if (!cancelled) {
        timer = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [batchId, onComplete]);

  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm px-5 py-4 mb-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-alloro-orange/10 flex items-center justify-center flex-shrink-0">
          <Loader2 size={18} className="text-alloro-orange animate-spin" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-alloro-textDark/40 mb-0.5">
            Ranking in progress
          </p>
          <p className="text-sm font-medium text-alloro-textDark">
            You have a new analysis running. This usually takes around 5-10
            minutes, so come back later for the result.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="w-7 h-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center flex-shrink-0"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
