/**
 * LeadgenFunnelChart
 *
 * Simple horizontal bar chart for leadgen funnel drop-off. No chart library —
 * plain Tailwind-styled divs with width proportional to the max stage count.
 * The `abandoned` stage is visually separated at the bottom.
 */

import { Activity } from "lucide-react";
import type { FinalStage, FunnelStage } from "../../types/leadgen";
import { STAGE_LABEL } from "./LeadgenSubmissionsTable";

interface Props {
  stages: FunnelStage[];
  loading: boolean;
}

/**
 * Ordered list of stages rendered as funnel rows. `stage_viewed_3` (Photos
 * sub-stage) is intentionally excluded — it's a legacy stage no longer
 * emitted by the leadgen tool. Kept in the FinalStage union / STAGE_LABEL
 * map for legacy session display, but no funnel row.
 * `abandoned` is handled separately as a terminal bucket.
 */
const FUNNEL_STAGES: FinalStage[] = [
  "landed",
  "input_started",
  "input_submitted",
  "audit_started",
  "stage_viewed_1",
  "stage_viewed_2",
  "stage_viewed_4",
  "stage_viewed_5",
  "results_viewed",
  "report_engaged_1min",
  "email_gate_shown",
  "email_submitted",
  "account_created",
];

export default function LeadgenFunnelChart({ stages, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!stages.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16">
        <Activity className="h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm font-medium text-gray-500">
          No events recorded yet.
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Funnel metrics will appear here once sessions start coming in.
        </p>
      </div>
    );
  }

  // Split out `abandoned` so it renders as a separated terminal row.
  // Filter to the FUNNEL_STAGES allowlist so legacy stages (e.g.
  // `stage_viewed_3`) that the backend still returns for back-compat rows
  // don't get rendered as funnel buckets.
  const mainStages = stages
    .filter((s) => FUNNEL_STAGES.includes(s.name))
    .sort((a, b) => a.ordinal - b.ordinal);
  const abandoned = stages.find((s) => s.name === "abandoned") ?? null;

  const maxCount = Math.max(
    1,
    ...stages.map((s) => s.count || 0)
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="space-y-2">
        {mainStages.map((stage) => (
          <FunnelBar
            key={stage.name}
            stage={stage}
            maxCount={maxCount}
            tone="orange"
          />
        ))}
      </div>

      {abandoned && (
        <div className="mt-6 pt-6 border-t border-gray-100">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">
            Terminal
          </p>
          <FunnelBar stage={abandoned} maxCount={maxCount} tone="red" />
        </div>
      )}
    </div>
  );
}

function FunnelBar({
  stage,
  maxCount,
  tone,
}: {
  stage: FunnelStage;
  maxCount: number;
  tone: "orange" | "red";
}) {
  const widthPct = maxCount > 0 ? Math.max(1, (stage.count / maxCount) * 100) : 0;
  const barClass =
    tone === "red"
      ? "bg-red-400"
      : "bg-alloro-orange";
  const label = STAGE_LABEL[stage.name] ?? stage.name;

  return (
    <div className="flex items-center gap-3">
      <div className="w-44 shrink-0 text-sm font-medium text-gray-700">
        {label}
      </div>
      <div className="flex-1 relative h-8 rounded-md bg-gray-100 overflow-hidden">
        <div
          className={`h-full ${barClass} transition-all duration-500`}
          style={{ width: `${widthPct}%` }}
        />
        <div className="absolute inset-0 flex items-center px-3 text-xs font-semibold text-gray-800">
          {stage.count.toLocaleString()}
        </div>
      </div>
      <div className="w-24 shrink-0 text-right text-xs text-gray-500">
        {stage.drop_off_pct === null || stage.drop_off_pct === undefined
          ? "—"
          : `${stage.drop_off_pct.toFixed(1)}% drop`}
      </div>
    </div>
  );
}
