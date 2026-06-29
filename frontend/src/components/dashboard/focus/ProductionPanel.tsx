import type { ReactNode } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { useLabels } from "../../../hooks/useLabels";
import { useLocationContext } from "../../../contexts/locationContext";
import { useDashboardMetrics } from "../../../hooks/queries/useDashboardMetrics";
import { usePmsKeyData } from "../../../hooks/queries/usePmsKeyData";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../../contexts/OnboardingWizardContext";
import { FocusTrendChart, type FocusTrendDatum } from "./FocusTrendChart";
import { parseYM } from "../../PMS/dashboard/pmsPeriod";
import { InsightCue } from "../InsightCue";
import { TONE_COLOR } from "./statusRules";
import { usePmsCopy } from "../../PMS/pmsCopy";

/**
 * ProductionPanel — the single year-to-date production chart that anchors
 * the simplified Practice Hub.
 *
 * Reads:
 *   - usePmsKeyData → months[] (YTD total + the charted series)
 *   - useDashboardMetrics → pms.production_change_30d (the trend pill)
 *
 * YTD means Jan 1 → today, strictly: only current-year months are summed
 * and charted. A practice with only prior-year data gets an honest
 * "no {year} data yet" state instead of an all-time sum mislabeled YTD.
 *
 * The trend pill is month-over-month (`production_change_30d`) and is
 * explicitly labeled "vs last mo" so it isn't misread as YTD growth.
 *
 * Spec: plans/06092026-practice-hub-simplification/spec.html (T3)
 *       plans/06112026-design-consistency-pass (tokens + YTD honesty)
 */

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Month keys arrive as EITHER "2026-04" or display labels ("Apr 2026")
// depending on the upload path — parseYM handles both. A naive
// startsWith(year) filter silently matched nothing for labeled months and
// fell back to an all-time sum mislabeled YTD (the "$2.2M" bug).
function monthShort(month: string): string {
  const p = parseYM(month);
  return p && p.month >= 1 && p.month <= 12 ? MONTH_SHORT[p.month - 1] : month;
}

function monthSortKey(month: string): number {
  const p = parseYM(month);
  return p ? p.year * 100 + p.month : 0;
}

function compactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

type MonthRow = { month: string; productionTotal: number; totalReferrals: number };

function Eyebrow() {
  const labels = useLabels();
  return (
    <div className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-alloro-navy" />
      {labels.production} · Year to date
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section
      data-wizard-target="dashboard-pms"
      className="flex flex-col rounded-[14px] border border-line-soft bg-white px-6 pb-[22px] pt-6 shadow-premium"
    >
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex h-[150px] items-center justify-center rounded-[10px] border border-dashed border-line-soft px-6 text-center text-[13px] font-medium text-ink-muted">
      {children}
    </div>
  );
}

export function ProductionPanel() {
  const isWizardActive = useIsWizardActive();
  const wizard = useWizardDemoData();
  const { userProfile } = useAuth();
  const labels = useLabels();
  const copy = usePmsCopy();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const metrics = useDashboardMetrics(orgId, locationId);
  const keyData = usePmsKeyData(orgId, locationId);

  const demo = isWizardActive ? wizard : null;
  const months: MonthRow[] = demo
    ? demo.pmsCardData.months
    : (keyData.data?.months ?? []);
  const change = demo
    ? demo.dashboardMetrics.pms.production_change_30d
    : (metrics.data?.pms?.production_change_30d ?? null);

  // Loading (real path only — wizard always has demo data).
  if (!isWizardActive && (metrics.isLoading || keyData.isLoading)) {
    return (
      <Shell>
        <Eyebrow />
        <div className="mt-1 h-10 w-48 animate-pulse rounded-md bg-neutral-100" />
        <div className="mt-5 h-[116px] w-full animate-pulse rounded-md bg-neutral-100" />
      </Shell>
    );
  }

  // YTD = Jan 1 → today. Current-year rows only — no all-time fallback.
  const currentYear = new Date().getFullYear();
  const series = months
    .filter((m) => parseYM(m.month)?.year === currentYear)
    .sort((a, b) => monthSortKey(a.month) - monthSortKey(b.month));

  if (series.length === 0) {
    return (
      <Shell>
        <Eyebrow />
        <EmptyState>
          {months.length > 0
            ? `No ${currentYear} data yet — your year-to-date trend starts with your first ${currentYear} upload.`
            : `${copy.uploadDataCta} to see your ${copy.moneyLower} trend.`}
        </EmptyState>
      </Shell>
    );
  }

  const ytdTotal = series.reduce((sum, m) => sum + (Number(m.productionTotal) || 0), 0);
  const up = change != null && change >= 0;

  const chartData = series.map<FocusTrendDatum>((m) => ({
    key: m.month,
    label: monthShort(m.month),
    tooltipLabel: monthShort(m.month),
    value: Number(m.productionTotal) || 0,
    detail: `${m.totalReferrals} ${copy.countPlural}`,
  }));

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow />
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[40px] font-medium leading-none tracking-[-0.02em] text-alloro-navy tabular-nums">
              {compactCurrency(ytdTotal)}
            </span>
          </div>
        </div>
        {change != null && (
          <span
            className="text-xs font-bold"
            style={{ color: up ? TONE_COLOR.positive : TONE_COLOR.critical }}
          >
            {up ? "▲" : "▼"} {up ? "+" : ""}
            {Math.round(change)}%
            <span className="ml-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
              vs last mo
            </span>
          </span>
        )}
      </div>

      <div className="mt-5">
        <FocusTrendChart
          data={chartData}
          color={TONE_COLOR.positive}
          gradientId="practice-hub-production"
          ariaLabel={`Year-to-date ${labels.revenueNoun} trend`}
          emptyLabel={`No ${labels.revenueNoun} trend yet`}
          valueLabel={(value) => `${compactCurrency(value)} ${labels.revenueNoun}`}
        />
      </div>

      {change != null && (
        <div className="mt-4">
          <InsightCue trend={up ? "up" : "down"} />
        </div>
      )}
    </Shell>
  );
}

export default ProductionPanel;
