import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { DollarSign, Loader2, ChevronDown, RefreshCw } from "lucide-react";
import { fetchProjectCosts } from "../../../api/websites";
import type { AiCostEvent, ProjectCostsResponse } from "../../../api/websites";
import { logger } from "../../../lib/logger";

interface CostsTabProps {
  projectId: string;
  /** Set to true while any page generation / layouts build is in flight. */
  isGenerating?: boolean;
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  "page-generate": "bg-blue-100 text-blue-700 border-blue-200",
  "section-regenerate": "bg-cyan-100 text-cyan-700 border-cyan-200",
  warmup: "bg-purple-100 text-purple-700 border-purple-200",
  "layouts-build": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "editor-chat": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "identity-propose": "bg-violet-100 text-violet-700 border-violet-200",
  critic: "bg-amber-100 text-amber-700 border-amber-200",
  "seo-generation": "bg-pink-100 text-pink-700 border-pink-200",
  "ai-command": "bg-orange-100 text-orange-700 border-orange-200",
  "select-image-tool": "bg-gray-100 text-gray-600 border-gray-200",
  "minds-chat": "bg-teal-100 text-teal-700 border-teal-200",
};

function EventTypeBadge({ type }: { type: string }) {
  const colors =
    EVENT_TYPE_COLORS[type] || "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${colors}`}
    >
      {type}
    </span>
  );
}

function EventRow({ event }: { event: AiCostEvent }) {
  const [expanded, setExpanded] = useState(false);
  const isNested = !!event.parent_event_id;
  return (
    <div
      className={`border-b border-gray-100 last:border-b-0 ${
        isNested ? "bg-gray-50/40" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        {isNested && (
          <span
            className="inline-block w-3 border-t border-gray-300 ml-1"
            aria-hidden
          />
        )}
        <div className="flex-shrink-0">
          <EventTypeBadge type={event.event_type} />
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 items-center">
          <span className="text-xs text-gray-600 font-mono truncate">
            {event.model}
          </span>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {formatTokens(event.input_tokens)} → {formatTokens(event.output_tokens)}
            {event.cache_read_tokens != null && event.cache_read_tokens > 0 && (
              <span className="ml-1 text-emerald-600">
                (cache {formatTokens(event.cache_read_tokens)})
              </span>
            )}
          </span>
          <span className="text-sm text-gray-900 font-semibold whitespace-nowrap min-w-[64px] text-right">
            {formatUsd(event.estimated_cost_usd)}
          </span>
          <span className="text-[11px] text-gray-400 whitespace-nowrap min-w-[80px] text-right">
            {relativeTime(event.created_at)}
          </span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-3 -mt-1">
          <pre className="text-[11px] text-gray-600 bg-white border border-gray-200 rounded p-2 overflow-x-auto">
            {JSON.stringify(
              {
                id: event.id,
                vendor: event.vendor,
                cache_creation_tokens: event.cache_creation_tokens,
                cache_read_tokens: event.cache_read_tokens,
                parent_event_id: event.parent_event_id,
                metadata: event.metadata,
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function CostsTab({ projectId, isGenerating }: CostsTabProps) {
  const [data, setData] = useState<ProjectCostsResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousGeneratingRef = useRef<boolean | undefined>(undefined);

  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await fetchProjectCosts(projectId);
      setData(response.data);
      setError(null);
    } catch (err) {
      logger.error("[CostsTab] Failed to load:", err);
      setError(err instanceof Error ? err.message : "Failed to load costs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => {
    load(true);
  }, [load]);

  // Refetch when a generation transition completes (active → idle).
  useEffect(() => {
    const prev = previousGeneratingRef.current;
    if (prev === true && isGenerating === false) {
      load(false);
    }
    previousGeneratingRef.current = isGenerating;
  }, [isGenerating, load]);

  if (loading) {
    return (
      <motion.div
        className="rounded-xl border border-gray-200 bg-white shadow-sm p-12 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Loading costs…</span>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        className="rounded-xl border border-red-200 bg-red-50 shadow-sm p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <p className="text-sm text-red-700">Failed to load costs: {error}</p>
        <button
          type="button"
          onClick={() => load(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-800"
        >
          <RefreshCw className="h-3 w-3" /> Try again
        </button>
      </motion.div>
    );
  }

  const events = data?.events || [];
  const total = data?.total_cost_usd ?? 0;
  const tokens = data?.total_tokens ?? {
    input: 0,
    output: 0,
    cache_creation: 0,
    cache_read: 0,
  };
  const totalEvents = data?.total_events ?? 0;

  return (
    <motion.div
      className="rounded-xl border border-gray-200 bg-white shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header — total + token breakdown */}
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                Project AI Costs
              </h3>
            </div>
            {refreshing && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
            )}
          </div>
          <button
            type="button"
            onClick={() => load(false)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            <RefreshCw
              className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className="text-2xl font-bold text-gray-900">
            {formatUsd(total)}
          </div>
          <span className="text-sm text-gray-500">
            across {totalEvents} {totalEvents === 1 ? "run" : "runs"}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-700">
            in: {formatTokens(tokens.input)}
          </span>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-700">
            out: {formatTokens(tokens.output)}
          </span>
          {tokens.cache_creation > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
              cache write: {formatTokens(tokens.cache_creation)}
            </span>
          )}
          {tokens.cache_read > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
              cache read: {formatTokens(tokens.cache_read)}
            </span>
          )}
        </div>
      </div>

      {/* Events list */}
      <div className="max-h-[640px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-12 text-center">
            <DollarSign className="h-8 w-8 mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">
              No AI runs recorded yet. Costs will appear here as soon as you run
              warmup, generate a page, or use the editor.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        )}
      </div>

      {events.length >= 100 && (
        <div className="border-t border-gray-100 px-5 py-3 text-center text-xs text-gray-500">
          Showing the 100 most recent events. Older events are still counted in the
          total above.
        </div>
      )}
    </motion.div>
  );
}
