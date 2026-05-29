import React from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, FileSpreadsheet } from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import { useDashboardMetrics } from "../../../hooks/queries/useDashboardMetrics";
import {
  fetchPmsKeyData,
  type PmsKeyDataResponse,
} from "../../../api/pms";
import { FocusTrendChart, type FocusTrendDatum } from "./FocusTrendChart";
import { useIsWizardActive, useWizardDemoData } from "../../../contexts/OnboardingWizardContext";

/**
 * PMSCard — PMS production / referral mix card for the Focus dashboard.
 *
 * Reads:
 *   - useDashboardMetrics(orgId, locationId) for production_total,
 *     production_change_30d, total_referrals, doctor_referrals,
 *     self_referrals.
 *   - usePmsKeyData(orgId, locationId) (defined inline below) for the
 *     12-month sparkline series and the top-3 sources list. Wraps the
 *     existing fetchPmsKeyData(orgId, locationId) helper that
 *     DashboardOverview.tsx:227 already calls.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T16)
 *
 * Visual reference:
 *   - ~/Desktop/another-design/project/cards.jsx :: PMSCard
 *   - ~/Desktop/another-design/project/Focus Dashboard.html lines 556-712
 */

type PmsKeyData = NonNullable<PmsKeyDataResponse["data"]>;

interface PmsKeyDataSourceWithTrend {
  rank: number;
  name: string;
  referrals: number;
  production: number;
  percentage: number;
  trend?: { dir: "up" | "down"; value: string } | null;
}

async function fetchPmsKeyDataInner(
  orgId: number | null,
  locationId: number | null,
): Promise<PmsKeyData | null> {
  const response = await fetchPmsKeyData(orgId ?? undefined, locationId);
  if (!response?.success || !response.data) {
    if (response?.error || response?.message) {
      throw new Error(
        response.error || response.message || "Failed to load PMS data",
      );
    }
    return null;
  }
  return response.data;
}

function usePmsKeyData(orgId: number | null, locationId: number | null) {
  return useQuery<PmsKeyData | null>({
    queryKey: ["pmsKeyData", orgId, locationId],
    queryFn: () => fetchPmsKeyDataInner(orgId, locationId),
    enabled: !!orgId && locationId != null,
    staleTime: 5 * 60 * 1000,
  });
}

const CARD_BG = "#FDFDFD";
const CARD_BORDER = "#E8E4DD";
const BRAND_ORANGE = "#D66853";
const PMS_GREEN = "#4F8A5B";
const SELF_GREY = "#D6CFC2";
const MUTED = "#8E8579";
const MUTED_2 = "#A8A192";
const INK = "#1F1B16";
const INK_SOFT = "#3A342B";
const LINE_SOFT = "#F0ECE5";

const FRAUNCES =
  "'Fraunces', ui-serif, Georgia, Cambria, 'Times New Roman', serif";
const MONO =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function CardShell({ children }: { children: React.ReactNode }) {
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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-2.5 flex items-center gap-2 font-bold uppercase"
      style={{ color: MUTED, fontSize: 10, letterSpacing: "0.16em" }}
    >
      <span
        className="inline-block rounded-full"
        style={{ width: 6, height: 6, background: INK }}
      />
      {children}
    </div>
  );
}

function SkeletonShell({ monthName }: { monthName: string }) {
  return (
    <CardShell>
      <Eyebrow>PMS · {monthName}</Eyebrow>
      <div className="space-y-3">
        <div className="h-9 w-44 animate-pulse rounded-md bg-neutral-100" />
        <div className="h-3 w-56 animate-pulse rounded bg-neutral-100" />
      </div>
      <div className="mt-5 h-16 w-full animate-pulse rounded-md bg-neutral-100" />
      <div className="mt-5 h-2 w-full animate-pulse rounded-full bg-neutral-100" />
      <div className="mt-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-3 w-full animate-pulse rounded bg-neutral-100" />
        ))}
      </div>
    </CardShell>
  );
}

function ErrorShell({
  monthName,
  onRetry,
  message,
}: {
  monthName: string;
  onRetry: () => void;
  message: string;
}) {
  return (
    <CardShell>
      <Eyebrow>PMS · {monthName}</Eyebrow>
      <div
        className="rounded-md border px-3 py-2 text-xs"
        style={{
          borderColor: "#F3D6C4",
          background: "#FFF7F2",
          color: "#8A4A36",
        }}
      >
        {message}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 self-start rounded-md px-2.5 py-1 text-xs font-semibold"
        style={{ color: BRAND_ORANGE }}
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </CardShell>
  );
}

function EmptyShell({ monthName }: { monthName: string }) {
  return (
    <CardShell>
      <Eyebrow>PMS · {monthName}</Eyebrow>
      <div className="flex flex-1 flex-col items-center justify-center text-center py-6">
        <div
          className="flex items-center justify-center rounded-full mb-3"
          style={{
            width: 44,
            height: 44,
            background: "#FFF7F2",
            color: BRAND_ORANGE,
          }}
        >
          <FileSpreadsheet size={20} />
        </div>
        <p
          className="text-[13.5px] font-semibold leading-snug"
          style={{ color: INK }}
        >
          No PMS data yet
        </p>
        <p
          className="text-[12px] mt-1 leading-relaxed max-w-[220px]"
          style={{ color: MUTED }}
        >
          Upload production and referral rows to see your monthly summary.
        </p>
      </div>
    </CardShell>
  );
}

function TrendPill({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  return (
    <span
      className="ml-auto font-bold"
      style={{ fontSize: 11, color: up ? PMS_GREEN : "#B3503E" }}
    >
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {delta}%
    </span>
  );
}

function monthLabelLong(month: string | undefined): string {
  if (!month) return "";
  const m = /^(\d{4})-(\d{2})/.exec(month);
  if (!m) return month;
  const yr = m[1].slice(2);
  const idx = parseInt(m[2], 10) - 1;
  if (idx < 0 || idx > 11) return month;
  const names = [
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
  return names[idx] + " '" + yr;
}

function currentMonthName(): string {
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return names[new Date().getMonth()];
}

const PMSCard: React.FC = () => {
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const metrics = useDashboardMetrics(orgId, locationId);
  const keyData = usePmsKeyData(orgId, locationId);

  const monthName = currentMonthName();

  const retry = () => {
    metrics.refetch();
    keyData.refetch();
  };

  if (!isWizardActive && metrics.isLoading) return <SkeletonShell monthName={monthName} />;

  if (!isWizardActive && metrics.isError) {
    const msg =
      (metrics.error as Error)?.message || "Could not load PMS data.";
    return (
      <ErrorShell monthName={monthName} onRetry={retry} message={msg} />
    );
  }

  const pms = isWizardActive ? wizardDemoData?.dashboardMetrics?.pms : metrics.data?.pms;
  const data = isWizardActive ? null : keyData.data;
  const wizardPmsCard = wizardDemoData?.pmsCardData as { months?: PmsKeyData["months"]; sources?: PmsKeyDataSourceWithTrend[] } | undefined;
  const months = isWizardActive ? (wizardPmsCard?.months ?? []) : (data?.months ?? []);
  const sources = isWizardActive
    ? ((wizardPmsCard?.sources ?? []) as PmsKeyDataSourceWithTrend[])
    : ((data?.sources ?? []) as PmsKeyDataSourceWithTrend[]);

  const productionThisMonth = pms?.production_this_month ?? null;

  if (!pms || (productionThisMonth === null && months.length === 0)) {
    return <EmptyShell monthName={monthName} />;
  }

  const productionTotal = productionThisMonth ?? 0;
  const productionChange = pms.production_change_30d;
  const totalReferrals = pms.total_referrals_this_month ?? 0;
  const doctorRefs = pms.doctor_referrals_this_month ?? 0;
  const selfRefs = totalReferrals - doctorRefs;
  const denom = doctorRefs + selfRefs;
  const doctorPct = denom > 0 ? Math.round((doctorRefs / denom) * 100) : 0;
  const selfPct = denom > 0 ? 100 - doctorPct : 0;

  const productionTrend = months.map<FocusTrendDatum>((m) => ({
    key: m.month,
    label: monthLabelLong(m.month),
    tooltipLabel: monthLabelLong(m.month),
    value: Number(m.productionTotal) || 0,
    detail: `${m.totalReferrals} referrals`,
  }));
  const top3 = sources.slice(0, 3);

  return (
    <CardShell>
      <Eyebrow>PMS · {monthName}</Eyebrow>

      <div className="flex flex-wrap items-baseline gap-2">
        <span
          style={{
            fontFamily: FRAUNCES,
            fontWeight: 500,
            fontSize: 32,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: INK,
          }}
        >
          ${productionTotal.toLocaleString()}
        </span>
        <span className="font-medium" style={{ fontSize: 12, color: MUTED }}>
          current period
        </span>
        <TrendPill
          delta={productionChange === null ? null : Math.round(productionChange)}
        />
      </div>

      <div
        className="mt-1.5 leading-relaxed"
        style={{ fontSize: 12, color: MUTED }}
      >
        {totalReferrals} total referrals · {doctorRefs} doctor / {selfRefs}{" "}
        self
      </div>

      {!isWizardActive && keyData.isLoading ? (
        <div className="mt-4 space-y-3">
          <div className="h-16 w-full animate-pulse rounded-md bg-neutral-100" />
          <div className="h-2 w-full animate-pulse rounded-full bg-neutral-100" />
        </div>
      ) : productionTrend.length > 0 && (
        <div className="mt-4">
          <FocusTrendChart
            data={productionTrend}
            color={PMS_GREEN}
            gradientId="pms-production"
            ariaLabel="Monthly PMS production trend"
            emptyLabel="No monthly PMS trend yet"
            valueLabel={(value) => `$${value.toLocaleString()} production`}
          />
        </div>
      )}

      <div className="mt-4">
        <div
          className="mb-1.5 flex items-center justify-between font-semibold uppercase"
          style={{ fontSize: 11, letterSpacing: "0.06em", color: MUTED }}
        >
          <span>Referral mix</span>
          <span style={{ color: INK_SOFT, fontFamily: MONO }}>
            {doctorRefs} / {selfRefs}
          </span>
        </div>
        <div
          className="flex overflow-hidden rounded-full"
          style={{ height: 6, background: LINE_SOFT }}
        >
          <div style={{ width: `${doctorPct}%`, background: BRAND_ORANGE }} />
          <div style={{ width: `${selfPct}%`, background: SELF_GREY }} />
        </div>
        <div
          className="mt-2 flex gap-4 font-semibold uppercase"
          style={{ fontSize: 10, letterSpacing: "0.1em", color: MUTED }}
        >
          <span className="inline-flex items-center">
            <span
              className="mr-1.5 inline-block align-middle"
              style={{
                width: 7,
                height: 7,
                borderRadius: 2,
                background: BRAND_ORANGE,
              }}
            />
            Doctor
          </span>
          <span className="inline-flex items-center">
            <span
              className="mr-1.5 inline-block align-middle"
              style={{
                width: 7,
                height: 7,
                borderRadius: 2,
                background: SELF_GREY,
              }}
            />
            Self / walk-in
          </span>
        </div>
      </div>

      {top3.length > 0 && (
        <div className="mt-4 pt-3.5 border-t" style={{ borderColor: LINE_SOFT }}>
          <div
            className="mb-1.5 font-bold uppercase"
            style={{
              fontSize: 9.5,
              letterSpacing: "0.14em",
              color: MUTED,
            }}
          >
            Top sources this month
          </div>
          {top3.map((s) => (
            <div key={s.rank} className="flex items-center gap-2.5 py-1.5">
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  color: MUTED_2,
                  width: 16,
                }}
              >
                {s.rank}.
              </span>
              <span
                className="flex-1 truncate font-medium"
                style={{ fontSize: 12.5, color: INK_SOFT }}
              >
                {s.name}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>
                {s.referrals} · ${s.production.toLocaleString()}
              </span>
              {s.trend && (
                <span
                  className="ml-1.5 rounded-full px-1.5 py-0.5 font-bold"
                  style={{
                    fontSize: 9,
                    color: s.trend.dir === "down" ? "#B3503E" : PMS_GREEN,
                    background:
                      s.trend.dir === "down" ? "#FCEAE3" : "#E6F0E7",
                  }}
                >
                  {s.trend.dir === "down" ? "▼" : "▲"} {s.trend.value}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
};

export default PMSCard;
