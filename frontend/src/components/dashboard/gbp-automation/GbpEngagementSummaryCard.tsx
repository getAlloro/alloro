import { ArrowRight, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useGbpAutomation } from "../../../hooks/queries/useGbpAutomationQueries";
import type { GbpReplyOpsMetrics } from "../../../api/gbpAutomation";
import { GbpEngagementSparkline } from "./GbpEngagementSparkline";

export type GbpEngagementSummaryCardProps = {
  organizationId: number | null;
  locationId?: number | null;
  onOpenEngage: () => void;
};

const EMPTY_REVIEW_MONTHS = { needsReply: [], replied: [] };
const EMPTY_REPLY_OPS: GbpReplyOpsMetrics = {
  totalOauthReviews: 0,
  totalUnreplied: 0,
  unrepliedLast30d: 0,
  unrepliedOver7d: 0,
  unrepliedOver30d: 0,
  oldestUnrepliedAt: null,
  averageReplyHours: null,
  averageReplyDays: null,
  medianReplyDays: null,
  replyCoveragePercent: 0,
};

function countLabel(value: number): string {
  return value.toLocaleString();
}

function durationLabel(days: number | null): string {
  if (days === null) return "-";
  if (days < 1) return "<1 day";
  return `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;
}

function MetricTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "attention";
}) {
  return (
    <div
      className={`rounded-[10px] border px-3 py-2.5 ${
        tone === "attention"
          ? "border-alloro-orange/20 bg-alloro-orange/5"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-xl font-medium tabular-nums ${
          tone === "attention" ? "text-alloro-orange" : "text-alloro-navy"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <section className="rounded-[14px] border border-line-soft bg-white p-6 shadow-premium">
      <div className="h-5 w-44 animate-pulse rounded bg-slate-100" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="h-16 animate-pulse rounded-[10px] bg-slate-100" />
        <div className="h-16 animate-pulse rounded-[10px] bg-slate-100" />
        <div className="h-16 animate-pulse rounded-[10px] bg-slate-100" />
        <div className="h-16 animate-pulse rounded-[10px] bg-slate-100" />
        <div className="h-16 animate-pulse rounded-[10px] bg-slate-100" />
      </div>
      <div className="mt-4 h-40 animate-pulse rounded-[10px] bg-slate-100" />
    </section>
  );
}

export function GbpEngagementSummaryCard({
  organizationId,
  locationId,
  onOpenEngage,
}: GbpEngagementSummaryCardProps) {
  const { data, isLoading, isFetching, error } = useGbpAutomation(
    organizationId,
    locationId
  );

  if (!organizationId || !locationId) return null;
  if (isLoading) return <SummarySkeleton />;
  if (error || !data) return null;

  const counts = data.readiness.counts;
  const replyOps = data.readiness.replyOps || EMPTY_REPLY_OPS;
  const reviewMonths = data.reviewMonths || EMPTY_REVIEW_MONTHS;
  const needsReplyTotal = counts.replyable_oauth;
  const needsReplyLast30 = counts.replyable_oauth_last_30d || 0;
  const statusCopy =
    needsReplyTotal > 0
      ? `${needsReplyTotal.toLocaleString()} review${needsReplyTotal === 1 ? "" : "s"} need a reply.`
      : "No synced GBP reviews need replies right now.";

  return (
    <motion.section
      className="rounded-[14px] border border-line-soft bg-white p-6 shadow-premium"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-alloro-navy">
            <MessageSquareText className="h-4 w-4 text-alloro-orange" />
            <h2 className="font-display text-lg font-medium tracking-tight">
              Review engagement
            </h2>
            {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          </div>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-500">
            {statusCopy} Open Alloro Engage™ to draft, polish, and publish replies.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenEngage}
          className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-alloro-navy px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Open Alloro Engage™
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile label="Total reviews" value={countLabel(counts.total)} />
        <MetricTile
          label="Need replies in 30d"
          value={countLabel(needsReplyLast30)}
          tone="attention"
        />
        <MetricTile
          label="Need replies overall"
          value={countLabel(needsReplyTotal)}
          tone="attention"
        />
        <MetricTile
          label="Avg reply time"
          value={durationLabel(replyOps.averageReplyDays)}
        />
        <MetricTile
          label="Reply coverage"
          value={`${replyOps.replyCoveragePercent}%`}
        />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-alloro-navy" />
              Total
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-alloro-orange" />
              Unreplied
            </span>
          </div>
        </div>
        <GbpEngagementSparkline
          needsReplyMonths={reviewMonths.needsReply}
          repliedMonths={reviewMonths.replied}
        />
      </div>
    </motion.section>
  );
}
