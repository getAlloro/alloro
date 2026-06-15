import { useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  X,
  CheckCircle,
  XCircle,
  Loader2,
  Newspaper,
} from "lucide-react";
import type { AiCommandRecommendation } from "../../../../api/websites";
import { getToolLabel } from "../aiCommandTab.utils";
import { AdditionalNotesInput } from "./AdditionalNotesInput";

export function RecommendationCard({ rec, onApproveReject, readonly, isLoading }: {
  rec: AiCommandRecommendation;
  onApproveReject: (id: string, status: "approved" | "rejected", referenceData?: { reference_url?: string; reference_content?: string }) => void;
  readonly?: boolean;
  isLoading: boolean;
}) {
  const [showInstruction, setShowInstruction] = useState(false);
  const meta = rec.target_meta as Record<string, unknown>;
  const suggestedHref = meta?.suggested_href as string | undefined;
  const brokenHref = meta?.broken_href as string | undefined;
  const isBrokenLink = meta?.flag_type === "fix_broken_link" && brokenHref;
  const hasSuggestion = isBrokenLink && suggestedHref && suggestedHref !== "NEEDS_INPUT";
  const [refUrl, setRefUrl] = useState(hasSuggestion ? suggestedHref! : "");
  const [refContent, setRefContent] = useState("");

  const needsReference = rec.target_type === "create_page" || rec.target_type === "create_post";
  const needsUrlInput = rec.target_type === "update_menu" && meta?.url === "NEEDS_INPUT";
  const hasReference = !!(meta?.reference_url || meta?.reference_content);

  const statusIcon = {
    pending: <div className="w-3.5 h-3.5 rounded-full border-2 border-amber-300 shrink-0" />,
    approved: <CheckCircle className="w-4 h-4 text-purple-500 shrink-0" />,
    rejected: <div className="w-3.5 h-3.5 rounded-full border-2 border-red-200 bg-red-50 shrink-0" />,
    executed: <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />,
    failed: <XCircle className="w-4 h-4 text-red-600 shrink-0" />,
  }[rec.status];

  const parsedResult = rec.execution_result
    ? (typeof rec.execution_result === "string" ? JSON.parse(rec.execution_result) : rec.execution_result)
    : null;
  const executionError = rec.status === "failed" ? parsedResult?.error : null;
  const pipelineMessage = parsedResult?.in_progress ? parsedResult.message : null;
  const pipelineStats = rec.status === "executed" && parsedResult?.iterations > 1
    ? `${parsedResult.iterations} rounds, ${parsedResult.ui_fixes || 0} UI fix(es), ${parsedResult.link_fixes || 0} link fix(es)`
    : null;

  const handleApprove = () => {
    if (needsReference && !hasReference) {
      if (!refUrl.trim() && !refContent.trim()) return;
      onApproveReject(rec.id, "approved", {
        reference_url: refUrl.trim() || undefined,
        reference_content: refContent.trim() || undefined,
      });
    } else if (needsUrlInput) {
      return;
    } else if (isBrokenLink && rec.status !== "approved") {
      // For broken links, approve with the replacement URL
      if (!refUrl.trim()) return;
      onApproveReject(rec.id, "approved", { reference_url: refUrl.trim() });
    } else {
      onApproveReject(rec.id, rec.status === "approved" ? "rejected" : "approved");
    }
  };

  return (
    <motion.div
      layout
      className={`rounded-lg border p-3 transition-all ${
        rec.status === "executed" ? "border-green-300 bg-green-50/40"
        : rec.status === "approved" ? "border-purple-200 bg-purple-50/20"
        : rec.status === "rejected" ? "border-red-100/30 bg-red-50/10 opacity-35"
        : rec.status === "failed" ? "border-red-500 bg-red-50/50"
        : (isLoading || pipelineMessage) ? "border-alloro-orange/40 bg-alloro-orange/5"
        : "border-gray-100 bg-white hover:border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex-1 min-w-0 ${rec.status === "rejected" ? "opacity-50" : ""}`}>
          <div className="flex items-start gap-2 mb-1">
            {(isLoading || pipelineMessage) ? <Loader2 className="w-4 h-4 animate-spin text-alloro-orange shrink-0" /> : statusIcon}
            <div className="flex-1 min-w-0">
              {(() => {
                const tool = getToolLabel(rec);
                return tool ? (
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${tool.color} shrink-0`}>
                      {tool.label}
                    </span>
                  </div>
                ) : null;
              })()}
              {rec.target_type === "page_section" && !!(rec.target_meta as Record<string, unknown>)?.section_name && (
                <span className="text-[10px] text-gray-400 font-mono">
                  {String((rec.target_meta as Record<string, unknown>).section_name)}
                </span>
              )}
              <p className={`text-sm leading-relaxed ${rec.status === "rejected" ? "text-red-300 line-through" : rec.status === "failed" ? "text-red-700" : "text-gray-700"}`}>
                {rec.recommendation}
              </p>
            </div>
          </div>

          {executionError && <p className="text-xs text-red-500 mt-1 ml-6">{executionError}</p>}
          {pipelineMessage && (
            <p className="text-[11px] text-alloro-orange mt-1 ml-6 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {pipelineMessage}
            </p>
          )}
          {pipelineStats && (
            <p className="text-[10px] text-gray-400 mt-0.5 ml-6">{pipelineStats}</p>
          )}

          {/* Reference data indicator for approved create_page/create_post */}
          {/* Post type indicator for create_post */}
          {rec.target_type === "create_post" && meta?.post_type_slug && (
            <p className="text-[11px] text-purple-600 mt-1 ml-6 flex items-center gap-1">
              <Newspaper className="w-3 h-3" />
              Post type: <span className="font-semibold">{String(meta.post_type_slug)}</span>
            </p>
          )}

          {needsReference && hasReference && rec.status === "approved" && (
            <p className="text-[11px] text-green-600 mt-1 ml-6">
              Reference: {meta.reference_url ? (meta.reference_url as string) : "Content provided"}
            </p>
          )}

          {/* Reference input for create_page/create_post */}
          {needsReference && !hasReference && rec.status === "pending" && (
            <div className="ml-6 mt-2 space-y-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-[11px] font-medium text-gray-500">Reference content required for page creation:</p>
              <input
                type="url"
                value={refUrl}
                onChange={(e) => setRefUrl(e.target.value)}
                placeholder="Old site URL to scrape (e.g., https://oldsite.com/pricing)"
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-alloro-orange/20 focus:border-alloro-orange"
              />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">or</span>
              </div>
              <textarea
                value={refContent}
                onChange={(e) => setRefContent(e.target.value)}
                placeholder="Paste content text directly..."
                rows={3}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-alloro-orange/20 focus:border-alloro-orange"
              />
              <button
                onClick={handleApprove}
                disabled={!refUrl.trim() && !refContent.trim()}
                className="inline-flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="w-3 h-3" /> Approve with Reference
              </button>
            </div>
          )}

          {/* Broken link fix — show suggested URL or manual input */}
          {isBrokenLink && rec.status === "pending" && (
            <div className="ml-6 mt-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-mono text-red-400 line-through">{brokenHref}</span>
                <span className="text-[10px] text-gray-400">→</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={refUrl}
                  onChange={(e) => setRefUrl(e.target.value)}
                  placeholder="/correct-path"
                  className={`flex-1 px-2.5 py-1.5 border rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-alloro-orange/20 focus:border-alloro-orange ${
                    hasSuggestion ? "border-green-300 bg-green-50/50" : "border-gray-200"
                  }`}
                />
                <button
                  onClick={() => {
                    if (!refUrl.trim()) return;
                    onApproveReject(rec.id, "approved", { reference_url: refUrl.trim() });
                  }}
                  disabled={!refUrl.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Check className="w-3 h-3" /> Fix Link
                </button>
              </div>
              {hasSuggestion && (
                <p className="text-[10px] text-green-600 mt-1">Auto-suggested based on existing pages</p>
              )}
            </div>
          )}

          {/* URL input for menu items with NEEDS_INPUT */}
          {needsUrlInput && rec.status === "pending" && (
            <div className="ml-6 mt-2 space-y-2 p-2.5 bg-amber-50/50 rounded-lg border border-amber-200/50">
              <p className="text-[11px] font-medium text-amber-700">URL required — the AI doesn't know this link:</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={refUrl}
                  onChange={(e) => setRefUrl(e.target.value)}
                  placeholder="https://payment-portal.example.com or /internal-page"
                  className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-alloro-orange/20 focus:border-alloro-orange"
                />
                <button
                  onClick={() => {
                    if (!refUrl.trim()) return;
                    // Store the URL in target_meta by approving with updated meta
                    onApproveReject(rec.id, "approved", { reference_url: refUrl.trim() });
                  }}
                  disabled={!refUrl.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  <Check className="w-3 h-3" /> Approve
                </button>
              </div>
            </div>
          )}

          {/* Needs input indicator — only show for non-visible inputs */}
          {needsUrlInput && rec.status === "pending" && (
            <p className="text-[11px] text-amber-600 mt-1 ml-6">Requires URL before approval</p>
          )}

          {rec.status !== "rejected" && (
            <button onClick={() => setShowInstruction(!showInstruction)}
              className="text-[11px] text-gray-400 hover:text-gray-500 mt-1 ml-6 transition-colors">
              {showInstruction ? "Hide" : "Show"} instruction
            </button>
          )}

          {showInstruction && rec.status !== "rejected" && (
            <p className="text-[11px] text-gray-500 mt-1.5 ml-6 font-mono bg-gray-50 p-2 rounded border border-gray-100">
              {rec.instruction}
            </p>
          )}

          {/* Additional notes input */}
          {rec.status === "pending" && !readonly && (
            <AdditionalNotesInput recId={rec.id} onApproveReject={onApproveReject} />
          )}
        </div>

        {!readonly && rec.status !== "executed" && rec.status !== "failed" && !isLoading && (
          <div className="flex gap-0.5 shrink-0">
            <button
              onClick={handleApprove}
              disabled={isLoading}
              className={`p-1.5 rounded-md transition-all ${
                rec.status === "approved"
                  ? "bg-green-100 text-green-600 hover:bg-green-200"
                  : "hover:bg-green-50 text-gray-300 hover:text-green-600"
              }`}
              title={rec.status === "approved" ? "Undo approve" : "Approve"}
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => onApproveReject(rec.id, rec.status === "rejected" ? "approved" : "rejected")}
              disabled={isLoading}
              className={`p-1.5 rounded-md transition-all ${
                rec.status === "rejected"
                  ? "bg-red-50 text-red-500 hover:bg-red-100"
                  : "hover:bg-red-50 text-gray-300 hover:text-red-500"
              }`}
              title={rec.status === "rejected" ? "Undo reject" : "Reject"}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
