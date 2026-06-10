import type { ReactNode } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import { useDashboardMetrics } from "../../../hooks/queries/useDashboardMetrics";
import { usePmsKeyData } from "../../../hooks/queries/usePmsKeyData";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../../contexts/OnboardingWizardContext";
import { FocusTrendChart, type FocusTrendDatum } from "./FocusTrendChart";

/**
 * ProductionPanel — the single year-to-date production chart that anchors
 * the simplified Practice Hub.
 *
 * Reads:
 *   - usePmsKeyData → months[] (YTD total + the charted series)
 *   - useDashboardMetrics → pms.production_change_30d (the trend pill)
 *
 * The "YEAR TO DATE" framing is a static label; the trend pill is
 * month-over-month (`production_change_30d`) and is explicitly labeled
 * "vs last mo" so it isn't misread as a YTD growth figure.
 *
 * Spec: plans/06092026-practice-hub-simplification/spec.html (T3)
 */

const CARD_BG = "#FDFDFD";
const CARD_BORDER = "#E8E4DD";
const INK = "#1F1B16";
const MUTED = "#8E8579";
const PMS_GREEN = "#4F8A5B";
const SPECTRAL = "'Spectral', Georgia, Cambria, 'Times New Roman', serif";

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

function monthShort(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return month;
  const idx = parseInt(m[2], 10) - 1;
  return idx >= 0 && idx < 12 ? MONTH_SHORT[idx] : month;
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
  return (
    <div
      className="mb-2.5 flex items-center gap-2 font-bold uppercase"
      style={{ color: MUTED, fontSize: 10, letterSpacing: "0.16em" }}
    >
      <span
        className="inline-block rounded-full"
        style={{ width: 6, height: 6, background: INK }}
      />
      Production · Year to date
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section
      data-wizard-target="dashboard-pms"
      className="flex flex-col"
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        padding: "24px 24px 22px",
      }}
    >
      {children}
    </section>
  );
}

export function ProductionPanel() {
  const isWizardActive = useIsWizardActive();
  const wizard = useWizardDemoData();
  const { userProfile } = useAuth();
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

  // Current-year window for the YTD total + the charted series.
  const currentYear = String(new Date().getFullYear());
  const ytdMonths = months
    .filter((m) => m.month.startsWith(currentYear))
    .sort((a, b) => a.month.localeCompare(b.month));
  // Fall back to all available months if no current-year rows exist yet
  // (e.g. early January, or a practice that only uploaded prior-year data).
  const series = ytdMonths.length > 0 ? ytdMonths : [...months].sort((a, b) => a.month.localeCompare(b.month));

  if (series.length === 0) {
    return (
      <Shell>
        <Eyebrow />
        <div
          className="mt-2 flex h-[150px] items-center justify-center rounded-[10px] border border-dashed text-[13px] font-medium"
          style={{ borderColor: CARD_BORDER, color: MUTED }}
        >
          Upload PMS data to see your production trend.
        </div>
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
    detail: `${m.totalReferrals} referrals`,
  }));

  return (
    <Shell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow />
          <div className="flex items-baseline gap-2">
            <span
              style={{
                fontFamily: SPECTRAL,
                fontWeight: 500,
                fontSize: 40,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                color: INK,
              }}
            >
              {compactCurrency(ytdTotal)}
            </span>
          </div>
        </div>
        {change != null && (
          <span
            className="font-bold"
            style={{ fontSize: 12, color: up ? PMS_GREEN : "#B3503E" }}
          >
            {up ? "▲" : "▼"} {up ? "+" : ""}
            {Math.round(change)}%
            <span
              className="ml-1 font-semibold uppercase"
              style={{ fontSize: 9.5, letterSpacing: "0.1em", color: MUTED }}
            >
              vs last mo
            </span>
          </span>
        )}
      </div>

      <div className="mt-5">
        <FocusTrendChart
          data={chartData}
          color={PMS_GREEN}
          gradientId="practice-hub-production"
          ariaLabel="Year-to-date production trend"
          emptyLabel="No production trend yet"
          valueLabel={(value) => `${compactCurrency(value)} production`}
        />
      </div>
    </Shell>
  );
}

export default ProductionPanel;
