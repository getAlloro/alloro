import { useState } from "react";
import { ArrowUp, ChevronRight } from "lucide-react";
import { PmsEmptyDashboardState } from "./PmsEmptyDashboardState";
import { PmsProcessingStatusCard } from "./PmsProcessingStatusCard";
import { PmsCardShell, PmsEyebrow } from "./primitives";
import { PmsHubTrendChart } from "./PmsHubTrendChart";
import { buildSourceTrendLookup } from "./sourceTrend";
import {
  bucketByPeriod,
  scopedTotals,
  periodCardLabel,
  periodChartLabel,
  type HubTrendDatum,
  type Period,
} from "./pmsPeriod";
import { formatCompactCurrency } from "./utils";
import type { PmsDashboardSurfaceProps } from "./PmsDashboardSurface";

/**
 * PmsHubSurface — simplified Referrals Hub surface (redesign).
 *
 * Drop-in for PmsDashboardSurface: accepts the identical
 * PmsDashboardSurfaceProps so PMSVisualPillars swaps it in with one line.
 * Layout: header + MONTH/QTR/YTD toggle → dual-line chart → 4 stat tiles →
 * lean upload CTA (opens the referrals upload panel) → top-3 sources w/
 * trend → 1 action.
 *
 * Heavy sections (AI exec summary, growth opportunities, velocity, mix,
 * full-sources modal, chart chrome, the full ingestion card) are
 * intentionally not rendered here. The Referral-Engine fetch is kept
 * upstream — it feeds source trends.
 *
 * Spec: plans/06102026-referrals-hub-simplification/spec.html (T4, Rev 2)
 */

function PeriodToggle({
  period,
  onChange,
}: {
  period: Period;
  onChange: (p: Period) => void;
}) {
  const options: Period[] = ["MONTH", "QTR", "YTD"];
  return (
    <div className="inline-flex rounded-full p-0.5" style={{ background: "#EDEAE5" }}>
      {options.map((o) => {
        const active = period === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              active
                ? "bg-white text-alloro-navy shadow-sm"
                : "text-[color:var(--color-pm-text-secondary)] hover:text-alloro-navy"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function StatTile({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: string;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-[14px] border border-line-soft bg-white p-5 shadow-premium">
      <div className="mb-3">
        <PmsEyebrow>{label}</PmsEyebrow>
      </div>
      {isLoading ? (
        <div className="h-7 w-24 animate-pulse rounded-lg bg-line-soft" />
      ) : (
        <span className="font-display text-2xl font-medium leading-none tracking-tight tabular-nums text-alloro-navy">
          {value}
        </span>
      )}
    </div>
  );
}

/**
 * Lean dashed upload CTA — opens the data-manager panel on click. Carries
 * id="data-ingestion-hub" so the alert banner's "Upload PMS data" button can
 * smooth-scroll here; `highlighted` renders the established orange ring pulse.
 */
function UploadCta({
  onClick,
  highlighted,
}: {
  onClick: () => void;
  highlighted: boolean;
}) {
  return (
    <button
      type="button"
      id="data-ingestion-hub"
      data-wizard-target="pms-upload"
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-[14px] border-2 border-dashed px-5 py-4 text-left transition-all duration-300 hover:border-alloro-orange/70 hover:bg-white ${
        highlighted
          ? "border-alloro-orange bg-white ring-8 ring-alloro-orange/30"
          : "border-alloro-orange/40 bg-white/40"
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-alloro-orange/10 text-alloro-orange">
        <ArrowUp size={18} strokeWidth={2.5} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-alloro-navy">Upload your latest data</span>
        <span className="block text-sm text-[color:var(--color-pm-text-secondary)]">
          Re-upload a month to overwrite it
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-[color:var(--color-pm-text-secondary)]" />
    </button>
  );
}

export function PmsHubSurface(props: PmsDashboardSurfaceProps) {
  const {
    monthlyData,
    topSources,
    totalProduction,
    totalReferrals,
    referralData,
    isLoading,
    isProcessingInsights,
    isWizardActive,
    canUploadPMS,
    hasProperties,
    isIngestionHighlighted,
    onOpenManualEntry,
    onOpenDataManager,
    onOpenSettings,
  } = props;

  const [period, setPeriod] = useState<Period>("MONTH");
  // Chart hover scrubbing: while a plot point is hovered, the production +
  // referral tiles show that bucket; null falls back to the period scope.
  const [hovered, setHovered] = useState<HubTrendDatum | null>(null);

  const handlePeriodChange = (next: Period) => {
    setPeriod(next);
    setHovered(null); // a hovered bucket from another period would be stale
  };

  const hasExistingData =
    monthlyData.length > 0 ||
    topSources.length > 0 ||
    totalProduction > 0 ||
    totalReferrals > 0;
  const shouldShowUnifiedEmptyState = !isLoading && !hasExistingData;

  const trendData = bucketByPeriod(monthlyData, period);
  const scoped = scopedTotals(monthlyData, period);
  // Fixed YTD reference tile — derived from the months series so it stays a
  // true year-to-date figure (totalProduction prop is all-time source sum).
  const ytd = scopedTotals(monthlyData, "YTD");
  const trendFor = buildSourceTrendLookup(referralData);

  const top3 = topSources.slice(0, 3);
  const top2 = topSources.slice(0, 2);
  const top2Refs = top2.reduce((sum, s) => sum + (s.referrals || 0), 0);
  const top2Pct = totalReferrals > 0 ? Math.round((top2Refs / totalReferrals) * 100) : 0;

  // The 1-ACTION banner surfaces the Referral-Engine's recommended action
  // (first growth-opportunity fix — the agent now emits exactly one). The
  // protect-top-sources heuristic is only the fallback for orgs whose RE
  // analysis hasn't produced a fix yet.
  const rawFix = referralData?.growth_opportunity_summary?.top_three_fixes?.[0] ?? null;
  const topFix = rawFix
    ? typeof rawFix === "string"
      ? { title: rawFix, description: null }
      : { title: rawFix.title, description: rawFix.description || null }
    : null;

  // `slot` is the React key — labels can collide (YTD period relabels tile 1
  // to "YTD" while tile 4 is always "YTD"), and duplicate keys corrupt
  // reconciliation (tiles visibly duplicate when toggling periods).
  // Hovering a chart point scopes production + referrals to that bucket;
  // SOURCES stays the all-time count (no per-month source data in keyData)
  // and YTD is always the fixed annual reference.
  const tiles: { slot: string; label: string; value: string }[] = [
    {
      slot: "period-production",
      label: hovered ? hovered.fullLabel : periodCardLabel(period),
      value: formatCompactCurrency(hovered ? hovered.production : scoped.production),
    },
    {
      slot: "referrals",
      label: "Referrals",
      value: String(hovered ? hovered.referrals : scoped.referrals),
    },
    { slot: "sources", label: "Sources", value: String(topSources.length) },
    { slot: "ytd", label: "YTD", value: formatCompactCurrency(ytd.production) },
  ];

  return (
    // No inner px — the orchestrator's <main> already provides horizontal
    // padding, and the alert banner above shares the same bare 1080 box.
    // Inner padding here is what threw the two out of alignment.
    <div className="pm-light mx-auto w-full max-w-[1080px] space-y-6 py-8 lg:py-10">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
          Referrals Hub
        </span>
        <PeriodToggle period={period} onChange={handlePeriodChange} />
      </div>

      {isProcessingInsights && <PmsProcessingStatusCard />}

      {shouldShowUnifiedEmptyState ? (
        <PmsEmptyDashboardState
          canUploadPMS={canUploadPMS}
          hasProperties={hasProperties}
          isWizardActive={isWizardActive}
          isHighlighted={isIngestionHighlighted}
          isProcessingInsights={isProcessingInsights}
          onOpenManualEntry={onOpenManualEntry}
          onOpenSettings={onOpenSettings}
        />
      ) : (
        <>
          <PmsHubTrendChart
            data={trendData}
            periodLabel={periodChartLabel(period)}
            onHoverChange={setHovered}
          />

          <div data-wizard-target="pms-vitals" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {tiles.map((t) => (
              <StatTile key={t.slot} label={t.label} value={t.value} isLoading={isLoading} />
            ))}
          </div>

          <UploadCta
            onClick={onOpenDataManager ?? onOpenManualEntry}
            highlighted={isIngestionHighlighted}
          />

          {top3.length > 0 && (
            <PmsCardShell eyebrow="Top sources">
              <div className="divide-y divide-line-soft">
                {top3.map((s) => {
                  const trend = trendFor(s.name);
                  return (
                    <div
                      key={s.rank}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span
                        className="font-display text-lg font-medium tabular-nums"
                        style={{
                          width: 20,
                          color:
                            s.rank === 1
                              ? "var(--color-alloro-orange)"
                              : "var(--color-pm-text-secondary)",
                        }}
                      >
                        {s.rank}
                      </span>
                      <span className="flex-1 truncate font-semibold text-alloro-navy">
                        {s.name}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-[color:var(--color-pm-text-secondary)]">
                        {s.referrals} · {s.percentage}%
                      </span>
                      <span className="w-4 text-center font-bold" style={{ color: trend.color }}>
                        {trend.arrow}
                      </span>
                    </div>
                  );
                })}
              </div>
            </PmsCardShell>
          )}

          {(topFix || topSources.length > 0) && (
            <section
              data-wizard-target="pms-insights"
              className="rounded-[14px]"
              style={{ background: "#FAF1EC", border: "1px solid #EFDED4", padding: "18px 20px" }}
            >
              <div
                className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em]"
                style={{ color: "#B3503E" }}
              >
                1 Action
              </div>
              {topFix ? (
                <>
                  <p className="font-display text-lg font-medium leading-snug text-alloro-navy">
                    {topFix.title}
                  </p>
                  {topFix.description && (
                    <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--color-pm-text-secondary)]">
                      {topFix.description}
                    </p>
                  )}
                </>
              ) : (
                <p className="font-display text-lg font-medium leading-snug text-alloro-navy">
                  Protect your top {top2.length} {top2.length === 1 ? "source" : "sources"} — {top2Pct}% of all referrals
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default PmsHubSurface;
