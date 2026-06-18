import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Check,
  X,
  ChevronRight,
} from "lucide-react";
import type { AiCommandRecommendation } from "../../../../api/websites";
import type { RecommendationListProps } from "../aiCommandTab.types";
import { groupKey, subGroupKey, getStatusSummary } from "../aiCommandTab.utils";
import { RecommendationCard } from "./RecommendationCard";

export function RecommendationList({ recommendations, expandedGroups, toggleGroup, onApproveReject, readonly, loadingRecId }: RecommendationListProps) {
  const groups = new Map<string, Map<string, AiCommandRecommendation[]>>();
  for (const rec of recommendations) {
    const gk = groupKey(rec);
    const sk = subGroupKey(rec);
    if (!groups.has(gk)) groups.set(gk, new Map());
    const sub = groups.get(gk)!;
    if (!sub.has(sk)) sub.set(sk, []);
    sub.get(sk)!.push(rec);
  }

  const order = ["Layouts", "Pages", "Posts", "New Posts", "New Pages", "Menu Changes", "Redirects"];

  return (
    <div className="space-y-5">
      {order.map((gk) => {
        const subGroups = groups.get(gk);
        if (!subGroups || subGroups.size === 0) return null;

        // Collect all recs in this top-level group for batch actions
        const allGroupRecs: AiCommandRecommendation[] = [];
        for (const [, recs] of subGroups) allGroupRecs.push(...recs);
        const groupPending = allGroupRecs.filter((r) => r.status === "pending").length;
        const groupTotal = allGroupRecs.length;
        const groupExecuted = allGroupRecs.filter((r) => r.status === "executed").length;
        const groupProcessing = allGroupRecs.some((r) => {
          if (r.execution_result) {
            const res = typeof r.execution_result === "string" ? JSON.parse(r.execution_result) : r.execution_result;
            if (res?.in_progress) return true;
          }
          return false;
        });

        return (
          <div key={gk}>
            <div className="flex items-center justify-between mb-2 pl-1 pr-1">
              <div className="flex items-center gap-2">
                {groupProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-alloro-orange" />}
                <h4 className={`text-[10px] font-bold uppercase tracking-[0.12em] ${groupProcessing ? "text-alloro-orange" : "text-gray-400"}`}>{gk}</h4>
                <span className="text-[10px] text-gray-300">{groupTotal}</span>
                {groupExecuted > 0 && <span className="text-[9px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">{groupExecuted} done</span>}
              </div>
              {!readonly && groupPending > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => allGroupRecs.filter((r) => r.status === "pending").forEach((r) => onApproveReject(r.id, "approved"))}
                    className="text-[10px] text-gray-400 hover:text-green-600 transition-colors flex items-center gap-0.5"
                    title={`Approve all ${groupPending} pending in ${gk}`}
                  >
                    <Check className="w-3 h-3" /> Approve {gk}
                  </button>
                  <span className="text-gray-200">|</span>
                  <button
                    onClick={() => allGroupRecs.filter((r) => r.status === "pending").forEach((r) => onApproveReject(r.id, "rejected"))}
                    className="text-[10px] text-gray-400 hover:text-red-500 transition-colors flex items-center gap-0.5"
                    title={`Reject all ${groupPending} pending in ${gk}`}
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              {Array.from(subGroups.entries()).map(([sk, recs]) => {
                const isExpanded = expandedGroups.has(sk);
                const counts = {
                  pending: recs.filter((r) => r.status === "pending").length,
                  approved: recs.filter((r) => r.status === "approved").length,
                  rejected: recs.filter((r) => r.status === "rejected").length,
                  executed: recs.filter((r) => r.status === "executed").length,
                  failed: recs.filter((r) => r.status === "failed").length,
                };
                const statusSummary = getStatusSummary(recs);
                const isProcessing = recs.some((r) => {
                  if (loadingRecId === r.id) return true;
                  // Check execution_result.in_progress for items being worked on during batch execution
                  if (r.execution_result) {
                    const res = typeof r.execution_result === "string" ? JSON.parse(r.execution_result) : r.execution_result;
                    if (res?.in_progress) return true;
                  }
                  return false;
                });

                return (
                  <div key={sk} className={`border rounded-lg overflow-hidden transition-all ${
                    statusSummary === "executed" ? "border-green-300 bg-green-50/30" :
                    statusSummary === "approved" ? "border-purple-200 bg-purple-50/20" :
                    statusSummary === "rejected" ? "border-red-100/40 opacity-40" :
                    statusSummary === "failed" ? "border-red-400 bg-red-50/20" :
                    isProcessing ? "border-alloro-orange/30 bg-alloro-orange/5" :
                    "border-gray-200"
                  }`}>
                    {/* Accordion header */}
                    <div className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50/60 transition-colors">
                      <button onClick={() => toggleGroup(sk)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin text-alloro-orange shrink-0" />
                        ) : (
                          <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                          </motion.div>
                        )}
                        <span className="text-[13px] font-semibold text-gray-800 truncate">{sk}</span>
                      </button>

                      {/* Inline status bar — visible even when collapsed */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Mini progress bar */}
                        {recs.length > 1 && (
                          <div className="flex items-center gap-px h-1.5 rounded-full overflow-hidden w-16 bg-gray-100">
                            {counts.executed > 0 && <div className="h-full bg-green-500 transition-all" style={{ width: `${(counts.executed / recs.length) * 100}%` }} />}
                            {counts.approved > 0 && <div className="h-full bg-purple-400 transition-all" style={{ width: `${(counts.approved / recs.length) * 100}%` }} />}
                            {counts.pending > 0 && <div className="h-full bg-amber-300 transition-all" style={{ width: `${(counts.pending / recs.length) * 100}%` }} />}
                            {counts.rejected > 0 && <div className="h-full bg-red-300 transition-all" style={{ width: `${(counts.rejected / recs.length) * 100}%` }} />}
                            {counts.failed > 0 && <div className="h-full bg-red-600 transition-all" style={{ width: `${(counts.failed / recs.length) * 100}%` }} />}
                          </div>
                        )}

                        {/* Count chips — distinct colors per status */}
                        <div className="flex items-center gap-0.5">
                          {counts.executed > 0 && (
                            <span className="w-5 h-5 rounded-full flex items-center justify-center bg-green-100 text-green-700">
                              <Check className="w-3 h-3" />
                            </span>
                          )}
                          {isProcessing && (
                            <span className="w-5 h-5 rounded-full flex items-center justify-center bg-alloro-orange/10 text-alloro-orange">
                              <Loader2 className="w-3 h-3 animate-spin" />
                            </span>
                          )}
                          {counts.approved > 0 && <span className="text-[9px] font-bold bg-purple-50 text-purple-600 w-5 h-5 rounded-full flex items-center justify-center">{counts.approved}</span>}
                          {counts.pending > 0 && !isProcessing && <span className="text-[9px] font-bold bg-amber-50 text-amber-600 w-5 h-5 rounded-full flex items-center justify-center">{counts.pending}</span>}
                          {counts.rejected > 0 && <span className="text-[9px] font-bold bg-red-50 text-red-300 w-5 h-5 rounded-full flex items-center justify-center">{counts.rejected}</span>}
                          {counts.failed > 0 && (
                            <span className="w-5 h-5 rounded-full flex items-center justify-center bg-red-100 text-red-600">
                              <X className="w-3 h-3" />
                            </span>
                          )}
                        </div>

                        {/* Batch approve/reject per group */}
                        {!readonly && counts.pending > 0 && (
                          <div className="flex items-center gap-0.5 ml-1 border-l border-gray-200 pl-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); recs.filter((r) => r.status === "pending").forEach((r) => onApproveReject(r.id, "approved")); }}
                              className="p-1 rounded text-gray-300 hover:text-green-600 hover:bg-green-50 transition-colors"
                              title="Approve all in this group"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); recs.filter((r) => r.status === "pending").forEach((r) => onApproveReject(r.id, "rejected")); }}
                              className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Reject all in this group"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="px-3 pb-3 space-y-1.5 border-t border-gray-100 pt-2">
                            {recs.map((rec) => (
                              <RecommendationCard key={rec.id} rec={rec} onApproveReject={onApproveReject}
                                readonly={readonly} isLoading={loadingRecId === rec.id} />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
