import React, { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import { useAgentData } from "../../../hooks/useAgentData";
import { useDashboardMetrics } from "../../../hooks/queries/useDashboardMetrics";
import HighlightedText from "./HighlightedText";
import { ProoflineModal } from "./ProoflineModal";

// =====================================================================
// Types — proofline payload from agents.proofline.results
// =====================================================================

interface ProoflineResult {
  title?: string;
  trajectory?: string;
  explanation?: string;
  metric_signal?: string;
  value_change?: string | number;
  highlights?: string[];
  dateEnd?: string;
  [key: string]: unknown;
}

interface ProoflineSection {
  results?: ProoflineResult | ProoflineResult[];
  lastUpdated?: string;
  [key: string]: unknown;
}

interface AgentBundle {
  agents?: {
    proofline?: ProoflineSection;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// =====================================================================
// Helpers
// =====================================================================

function getGreeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function isNegative(value: string | number | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "number") return value < 0;
  // String: detect a leading minus or "down"/"-" pattern
  const trimmed = value.trim();
  if (trimmed.startsWith("-")) return true;
  if (/^down\b/i.test(trimmed)) return true;
  return false;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelativeTimestamp(iso?: string): string {
  if (!iso) return "Updated recently";
  const ts = new Date(iso);
  if (Number.isNaN(ts.getTime())) return "Updated recently";
  const diffMs = Date.now() - ts.getTime();
  if (diffMs < 0) return "Updated just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Updated ${days}d ago`;
  return `Updated ${ts.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function formatTrendPct(change: number | null | undefined): {
  text: string;
  up: boolean | null;
} {
  if (change === null || change === undefined || Number.isNaN(change)) {
    return { text: "—", up: null };
  }
  const sign = change >= 0 ? "+" : "";
  return {
    text: `${sign}${Math.round(change)}%`,
    up: change >= 0,
  };
}

function resolveProoflineResult(
  section: ProoflineSection | null | undefined,
): ProoflineResult | null {
  const results = section?.results;
  if (Array.isArray(results)) return results[0] ?? null;
  if (results && typeof results === "object") return results;
  return null;
}

// =====================================================================
// Subcomponents
// =====================================================================

interface TrendChipProps {
  text: string;
  up: boolean | null;
}

const TrendChip: React.FC<TrendChipProps> = ({ text, up }) => {
  if (up === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
        {text}
      </span>
    );
  }
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
        up ? "text-emerald-600" : "text-red-500"
      }`}
    >
      <Icon size={11} strokeWidth={2.5} />
      {text}
    </span>
  );
};

interface MiniStatProps {
  label: string;
  value: string;
  trend: { text: string; up: boolean | null };
}

const MiniStat: React.FC<MiniStatProps> = ({ label, value, trend }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
      {label}
    </span>
    <span
      className="font-display text-[22px] font-medium tracking-[-0.02em] text-slate-900"
    >
      {value}
    </span>
    <TrendChip text={trend.text} up={trend.up} />
  </div>
);

const TrajectorySkeleton: React.FC = () => (
  <section className="rounded-[14px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
    <div className="flex flex-wrap gap-2">
      <div className="h-5 w-44 rounded-full bg-slate-100" />
      <div className="h-5 w-36 rounded-full bg-slate-100" />
    </div>
    <div className="mt-4 h-8 w-72 rounded bg-slate-100" />
    <div className="mt-4 space-y-2 max-w-[680px]">
      <div className="h-4 w-full rounded bg-slate-100" />
      <div className="h-4 w-11/12 rounded bg-slate-100" />
      <div className="h-4 w-3/4 rounded bg-slate-100" />
    </div>
    <div className="mt-6 h-3 w-40 rounded bg-slate-100" />
    <div className="mt-6 grid grid-cols-3 gap-6 border-t border-slate-100 pt-[22px]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="h-6 w-20 rounded bg-slate-100" />
          <div className="h-3 w-12 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  </section>
);

// =====================================================================
// Main component
// =====================================================================

export interface TrajectoryProps {
  /** Optional override for the active org. Defaults to userProfile.organizationId. */
  organizationId?: number | null;
}

export const Trajectory: React.FC<TrajectoryProps> = ({ organizationId }) => {
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();

  const orgId = organizationId ?? userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const {
    data: agentData,
    loading: agentLoading,
    error: agentError,
    refetch: refetchAgent,
  } = useAgentData(orgId, locationId);

  const {
    data: dashboardMetrics,
    isLoading: metricsLoading,
  } = useDashboardMetrics(orgId, locationId);

  const [modalOpen, setModalOpen] = useState(false);

  const proofline: ProoflineResult | null = useMemo(() => {
    const bundle = agentData as AgentBundle | null;
    return resolveProoflineResult(bundle?.agents?.proofline);
  }, [agentData]);

  const lastUpdated = useMemo(() => {
    const bundle = agentData as AgentBundle | null;
    return bundle?.agents?.proofline?.lastUpdated ?? proofline?.dateEnd;
  }, [agentData, proofline]);

  const greeting = getGreeting();
  const firstName = (() => {
    const first = userProfile?.firstName?.trim();
    if (first) return first;
    const local = userProfile?.email?.split("@")[0]?.trim();
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
    return "there";
  })();

  // Loading state
  if (agentLoading) {
    return <TrajectorySkeleton />;
  }

  // Error state
  if (agentError) {
    return (
      <section className="rounded-[14px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Trajectory
          </span>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          We couldn't load your trajectory summary.
        </p>
        <button
          type="button"
          onClick={() => refetchAgent()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </section>
    );
  }

  // Empty state — no proofline yet
  if (!proofline || !proofline.trajectory) {
    return (
      <section className="rounded-[14px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Trajectory · Latest update
          </span>
        </div>
        <h2 className="mt-[14px] font-display text-[30px] font-medium leading-tight tracking-[-0.02em] text-slate-900">
          {greeting}, {firstName}.
        </h2>
        <p className="mt-3 max-w-[680px] text-[15px] leading-[1.65] text-slate-600">
          Your trajectory summary will appear once daily Proofline runs complete.
        </p>
      </section>
    );
  }

  // Determine growth status pill
  const negative = isNegative(proofline.value_change);
  const growthLabel = negative ? "Watch closely" : "Growth looks good";
  const growthClasses = negative
    ? "bg-amber-50 text-amber-700"
    : "bg-emerald-50 text-emerald-700";
  const growthDot = negative ? "bg-amber-500" : "bg-emerald-500";

  // Mini-stats data sources (D6)
  const pms = dashboardMetrics?.pms;
  const ranking = dashboardMetrics?.ranking;

  const productionValue = formatCurrency(pms?.production_total);
  const productionTrend = formatTrendPct(pms?.production_change_30d);

  // "New patient starts" — heuristic: total_referrals (no dedicated metric yet)
  const startsValue =
    pms?.total_referrals !== undefined && pms?.total_referrals !== null
      ? String(pms.total_referrals)
      : "—";
  const startsTrend = formatTrendPct(null); // no _change_30d field for referrals

  const visibilityValue =
    ranking?.score !== null && ranking?.score !== undefined
      ? String(Math.round(ranking.score))
      : "—";
  const visibilityTrend = formatTrendPct(null); // no ranking_change_30d field

  const showStatsSkeleton = metricsLoading && !dashboardMetrics;

  return (
    <>
      <section className="rounded-[14px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
        {/* Pills row */}
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            Trajectory · Latest update
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${growthClasses}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${growthDot}`} />
            {growthLabel}
          </span>
        </div>

        {/* Salutation headline */}
        <h2 className="mt-[14px] font-display text-[30px] font-medium leading-tight tracking-[-0.02em] text-slate-900">
          {greeting}, {firstName}.
        </h2>

        {/* Body paragraph */}
        <p className="mt-[14px] max-w-[680px] text-[15px] leading-[1.65] text-slate-600">
          <HighlightedText
            text={proofline.trajectory}
            highlights={proofline.highlights}
          />
        </p>

        {/* Footer row */}
        <div className="mt-[22px] flex items-center gap-[18px]">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-transparent text-[13px] font-semibold text-[#D66853] transition-opacity hover:opacity-80"
          >
            Read full explanation
            <ArrowRight size={11} strokeWidth={2.5} />
          </button>
          <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
            {formatRelativeTimestamp(lastUpdated)}
          </span>
        </div>

        {/* Mini-stats row */}
        <div className="mt-[22px] grid grid-cols-3 gap-6 border-t border-slate-100 pt-[22px]">
          {showStatsSkeleton ? (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-24 rounded bg-slate-100" />
                  <div className="h-6 w-20 rounded bg-slate-100" />
                  <div className="h-3 w-12 rounded bg-slate-100" />
                </div>
              ))}
            </>
          ) : (
            <>
              <MiniStat
                label="Production MTD"
                value={productionValue}
                trend={productionTrend}
              />
              <MiniStat
                label="New patient starts"
                value={startsValue}
                trend={startsTrend}
              />
              <MiniStat
                label="Visibility score"
                value={visibilityValue}
                trend={visibilityTrend}
              />
            </>
          )}
        </div>
      </section>

      <ProoflineModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        proofline={proofline}
      />
    </>
  );
};

export default Trajectory;
