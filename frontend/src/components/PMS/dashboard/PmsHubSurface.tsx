import { useState } from "react";
import { ArrowUp, ChevronRight, ArrowLeftRight } from "lucide-react";
import { ActionBanner } from "../../dashboard/ActionBanner";
import { PeriodToggle } from "../../dashboard/PeriodToggle";
import { formatDataMonth, TO_DATE } from "../../../utils/timeframe";
import { PmsEmptyDashboardState } from "./PmsEmptyDashboardState";
import { PmsProcessingStatusCard } from "./PmsProcessingStatusCard";
import { PmsEyebrow } from "./primitives";
import { PmsHubTrendChart } from "./PmsHubTrendChart";
import { PmsHubTopSources } from "./PmsHubTopSources";
import { buildSourceDetailLookup, buildSourceTrendLookup } from "./sourceTrend";
import {
  bucketByPeriod,
  scopedTotals,
  latestMonthKey,
  periodChartLabel,
  type HubTrendDatum,
  type Period,
} from "./pmsPeriod";
import { formatCompactCurrency } from "./utils";
import { useLabels } from "../../../hooks/useLabels";
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

/** MONTH/QTR/YTD options for the shared terracotta PeriodToggle. MONTH names
 *  the latest uploaded month in the tile; QTR/YTD are cumulative to-date
 *  measures, abbreviated per the standard (tooltips spell them out). */
const PERIOD_OPTIONS: { key: Period; label: string; tooltip?: string }[] = [
  { key: "MONTH", label: "Month" },
  { key: "QTR", label: TO_DATE.QTD.label, tooltip: TO_DATE.QTD.full },
  { key: "YTD", label: TO_DATE.YTD.label, tooltip: TO_DATE.YTD.full },
];

function StatTile({
  label,
  value,
  sub,
  isLoading,
}: {
  label: string;
  value: string;
  /** Optional second line under the value (e.g. the YTD figure, "All-time"). */
  sub?: string;
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
        <>
          <span className="font-display text-2xl font-medium leading-none tracking-tight tabular-nums text-alloro-navy">
            {value}
          </span>
          {sub ? (
            <span className="mt-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted tabular-nums">
              {sub}
            </span>
          ) : null}
        </>
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
        <span className="block text-sm text-ink-muted">
          Re-upload a month to overwrite it
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-ink-muted" />
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
    onOpenCompare,
    onOpenSettings,
  } = props;

  const labels = useLabels();

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
  // YTD reference — derived from the months series so it stays a true
  // year-to-date figure (totalProduction prop is all-time source sum). Shown
  // as the secondary line BESIDE the monthly production number (#3.3), not a
  // standalone tile.
  const ytd = scopedTotals(monthlyData, "YTD");
  // The named latest uploaded month ("April 2026") for the MONTH-period label —
  // never a bare "this mo" (#3.1). Anchored to the same latest key the chart
  // and totals use.
  const namedMonth = formatDataMonth(latestMonthKey(monthlyData));
  // Spelled period label for the production/referrals tiles: MONTH names the
  // month; QTR/YTD use their full to-date wording.
  const periodLabel =
    period === "MONTH" ? namedMonth || "Latest month" : period === "QTR" ? TO_DATE.QTD.full : TO_DATE.YTD.full;

  const trendFor = buildSourceTrendLookup(referralData);
  const detailFor = buildSourceDetailLookup(referralData);

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

  // `slot` is the React key — labels can collide (e.g. a hovered bucket and
  // the period label), and duplicate keys corrupt reconciliation (tiles
  // visibly duplicate when toggling periods).
  // Hovering a chart point scopes production + referrals to that bucket.
  // The YTD figure rides BESIDE the monthly production number as a sub-line
  // (#3.3), shown only off-YTD and when not hovering a specific bucket — on
  // YTD the headline already IS the year-to-date number, and a hovered bucket
  // is a point-in-time read where a YTD anchor would mislead.
  // SOURCES carries no per-period data in keyData, so it is explicitly marked
  // all-time (#3.2) rather than silently ignoring the toggle.
  const showYtdSub = period !== "YTD" && !hovered;
  const tiles: {
    slot: string;
    label: string;
    value: string;
    sub?: string;
  }[] = [
    {
      slot: "period-production",
      label: hovered ? hovered.fullLabel : periodLabel,
      value: formatCompactCurrency(hovered ? hovered.production : scoped.production),
      sub: showYtdSub ? `YTD ${formatCompactCurrency(ytd.production)}` : undefined,
    },
    {
      slot: "referrals",
      label: hovered ? `${labels.referralsShort} · ${hovered.fullLabel}` : `${labels.referralsShort} · ${periodLabel}`,
      value: String(hovered ? hovered.referrals : scoped.referrals),
    },
    {
      slot: "sources",
      label: "Sources",
      value: String(topSources.length),
      sub: "All-time",
    },
  ];

  return (
    // No inner px — the orchestrator's <main> already provides horizontal
    // padding, and the alert banner above shares the same bare 1080 box.
    // Inner padding here is what threw the two out of alignment.
    <div className="pm-light mx-auto w-full max-w-[960px] space-y-6">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
          {labels.hubReferrals}
        </span>
        <div className="flex items-center gap-2">
          {onOpenCompare && monthlyData.length >= 2 && (
            <button
              type="button"
              onClick={onOpenCompare}
              className="inline-flex items-center gap-1.5 rounded-full border border-line-soft bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-alloro-navy shadow-premium transition-all duration-200 hover:border-alloro-orange/50 hover:text-alloro-orange"
            >
              <ArrowLeftRight size={13} strokeWidth={2.5} />
              Compare
            </button>
          )}
          <PeriodToggle
            options={PERIOD_OPTIONS}
            active={period}
            onChange={handlePeriodChange}
            ariaLabel={`${labels.referralsShort} timeframe`}
          />
        </div>
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

          <div data-wizard-target="pms-vitals" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {tiles.map((t) => (
              <StatTile key={t.slot} label={t.label} value={t.value} sub={t.sub} isLoading={isLoading} />
            ))}
          </div>

          <UploadCta
            onClick={onOpenDataManager ?? onOpenManualEntry}
            highlighted={isIngestionHighlighted}
          />

          <PmsHubTopSources sources={top3} trendFor={trendFor} detailFor={detailFor} />

          {(topFix || topSources.length > 0) && (
            <ActionBanner
              hub="referrals-hub"
              eyebrow="1 Action"
              title={
                topFix
                  ? topFix.title
                  : `Protect your top ${top2.length} ${top2.length === 1 ? "source" : "sources"} — ${top2Pct}% of all referrals`
              }
              description={topFix?.description ?? null}
              wizardTarget="pms-insights"
            />
          )}
        </>
      )}
    </div>
  );
}

export default PmsHubSurface;
