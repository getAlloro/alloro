/**
 * Visual replica of PmsDashboardSurface (Referrals Hub)
 * Source: frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx
 *
 * Stripped: API calls, recharts, framer-motion, locationContext, all hooks
 * Hardcoded: "data loaded" state, 6-month trend data, 5 source rows
 */

import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Layers3,
  Lock,
  Minus,
  PieChart,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Upload,
  UsersRound,
} from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { DashboardLayout } from "./DashboardLayout";
import { HotspotZone } from "../HotspotZone";

/* ------------------------------------------------------------------ */
/*  Hardcoded fixture data                                             */
/* ------------------------------------------------------------------ */

const monthlyData = [
  { month: "Jan", selfReferrals: 30, doctorReferrals: 12, totalReferrals: 42, productionTotal: 48200 },
  { month: "Feb", selfReferrals: 35, doctorReferrals: 14, totalReferrals: 49, productionTotal: 52800 },
  { month: "Mar", selfReferrals: 28, doctorReferrals: 16, totalReferrals: 44, productionTotal: 46100 },
  { month: "Apr", selfReferrals: 42, doctorReferrals: 18, totalReferrals: 60, productionTotal: 61400 },
  { month: "May", selfReferrals: 38, doctorReferrals: 15, totalReferrals: 53, productionTotal: 57900 },
  { month: "Jun", selfReferrals: 45, doctorReferrals: 20, totalReferrals: 65, productionTotal: 68300 },
];

const topSources = [
  { rank: 1, name: "Google Business Profile", percentage: 34, production: 82400, referrals: 68 },
  { rank: 2, name: "Dr. Sarah Miller", percentage: 18, production: 43600, referrals: 32 },
  { rank: 3, name: "Patient Referral", percentage: 15, production: 36300, referrals: 41 },
  { rank: 4, name: "Dr. Michael Chen", percentage: 12, production: 29100, referrals: 24 },
  { rank: 5, name: "Insurance Directory", percentage: 9, production: 21800, referrals: 28 },
  { rank: 6, name: "Facebook Ads", percentage: 7, production: 16900, referrals: 18 },
];

/* ------------------------------------------------------------------ */
/*  Helper components — matches PmsDashboard source                    */
/* ------------------------------------------------------------------ */

const formatCurrency = (value: number): string =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const formatCompactCurrency = (value: number): string => {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value}`;
};

function TrendPill({ change }: { change: number | null }) {
  const isPositive = change !== null && change > 0;
  const isNegative = change !== null && change < 0;

  const className = isPositive
    ? "bg-green-50 text-green-700 border-green-100"
    : isNegative
      ? "bg-red-50 text-red-700 border-red-100"
      : "bg-slate-100 text-slate-500 border-slate-200";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${className}`}
    >
      {isPositive && <ArrowUpRight className="h-3 w-3" />}
      {isNegative && <TrendingDown className="h-3 w-3" />}
      {!isPositive && !isNegative && <Minus className="h-3 w-3" />}
      {change === null ? "New" : `${change > 0 ? "+" : ""}${change}%`}
    </span>
  );
}

function VitalCard({
  label,
  value,
  sub,
  change,
  isAccent,
}: {
  label: string;
  value: string;
  sub?: string;
  change?: number | null;
  isAccent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-premium transition-all duration-200 hover:-translate-y-0.5 hover:border-alloro-orange/20 sm:p-6">
      <div className="mb-4 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
        {label}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span
          className={`font-display text-3xl font-medium leading-none tracking-tight tabular-nums ${
            isAccent ? "text-alloro-orange" : "text-alloro-navy"
          }`}
        >
          {value}
        </span>
        {change !== undefined && <TrendPill change={change ?? null} />}
      </div>
      {sub && (
        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {sub}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AttentionCard — matches PmsAttentionCards source                    */
/* ------------------------------------------------------------------ */

function AttentionCard({
  icon: Icon,
  label,
  title,
  detail,
}: {
  icon: typeof AlertTriangle;
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-premium">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
          {label}
        </span>
        <span className="rounded-xl bg-alloro-orange/10 p-2 text-alloro-orange">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <h3 className="text-base font-black leading-tight text-alloro-navy">
        {title}
      </h3>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
        {detail}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hardcoded executive summary bullets                                */
/* ------------------------------------------------------------------ */

const executiveSummaryBullets = [
  "Google Business Profile drives 34% of tracked production — your strongest organic channel by a wide margin.",
  "Doctor referrals rose 33% month-over-month (15 → 20), suggesting recent outreach efforts are landing.",
  "Self-referral volume has plateaued around 38–45/mo for the last quarter. Consider testing a patient referral incentive to unlock the next tier.",
  "June was your highest-production month at $68,300 — correlating with peak doctor referral activity.",
];

/* ------------------------------------------------------------------ */
/*  Static SVG line chart — replaces Recharts PmsProductionChart       */
/* ------------------------------------------------------------------ */

function StaticProductionChart() {
  // Data is hardcoded with 6 entries — safe to assert non-null
  const latest = monthlyData[monthlyData.length - 1]!;
  const productions = monthlyData.map((m) => m.productionTotal);
  const referrals = monthlyData.map((m) => m.totalReferrals);

  const prodMin = Math.min(...productions);
  const prodMax = Math.max(...productions);
  const refMin = Math.min(...referrals);
  const refMax = Math.max(...referrals);

  const W = 440;
  const H = 140;
  const padX = 16;
  const padY = 12;

  const scaleX = (i: number) => padX + (i / (monthlyData.length - 1)) * (W - 2 * padX);
  const scaleY = (v: number, min: number, max: number) => {
    const range = max - min || 1;
    return padY + (1 - (v - min) / range) * (H - 2 * padY);
  };

  const prodPoints = productions.map((v, i) => `${scaleX(i)},${scaleY(v, prodMin * 0.85, prodMax * 1.15)}`);
  const refPoints = referrals.map((v, i) => `${scaleX(i)},${scaleY(v, refMin * 0.85, refMax * 1.15)}`);

  const prodAreaPath = `M${prodPoints[0]} ${prodPoints.map((p) => `L${p}`).join(" ")} L${scaleX(productions.length - 1)},${H - padY} L${scaleX(0)},${H - padY} Z`;

  const firstLabel = monthlyData[0]!.month;
  const middleLabel = monthlyData[Math.floor(monthlyData.length / 2)]!.month;
  const lastLabel = latest.month;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-premium">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
            Production Trend
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="font-display text-4xl font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
              {formatCurrency(latest.productionTotal)}
            </span>
            <span className="text-sm font-semibold text-slate-500">
              {latest.month}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {latest.totalReferrals} referrals · {latest.doctorReferrals} doctor · {latest.selfReferrals} self
          </p>
        </div>
        <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-1 w-4 rounded-full bg-alloro-orange" />
            Production
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-1 w-4 rounded-full bg-green-700" />
            Referrals
          </span>
        </div>
      </div>

      <div className="h-44 w-full">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((frac) => (
            <line
              key={frac}
              x1={padX}
              x2={W - padX}
              y1={padY + frac * (H - 2 * padY)}
              y2={padY + frac * (H - 2 * padY)}
              stroke="#F0ECE8"
              strokeDasharray="3 5"
            />
          ))}
          {/* Area fill */}
          <path d={prodAreaPath} fill="#E8792B" opacity={0.12} />
          {/* Production line */}
          <polyline
            points={prodPoints.join(" ")}
            fill="none"
            stroke="#E8792B"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Referrals line */}
          <polyline
            points={refPoints.join(" ")}
            fill="none"
            stroke="#3D8B40"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Production dots */}
          {prodPoints.map((p, i) => {
            const [cx, cy] = p.split(",").map(Number);
            return (
              <circle key={`prod-${i}`} cx={cx} cy={cy} r="3.5" fill="#E8792B" stroke="white" strokeWidth="2" />
            );
          })}
          {/* Referral dots */}
          {refPoints.map((p, i) => {
            const [cx, cy] = p.split(",").map(Number);
            return (
              <circle key={`ref-${i}`} cx={cx} cy={cy} r="3" fill="#3D8B40" stroke="white" strokeWidth="2" />
            );
          })}
        </svg>
      </div>
      <div className="grid grid-cols-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        <span>{firstLabel}</span>
        <span className="text-center">{middleLabel}</span>
        <span className="text-right">{lastLabel}</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main replica component                                             */
/* ------------------------------------------------------------------ */

export function ReferralsHubReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  // Data is hardcoded with 6 entries — safe to assert non-null
  const latest = monthlyData[monthlyData.length - 1]!;
  const previous = monthlyData[monthlyData.length - 2]!;
  const totalProduction = monthlyData.reduce((s, m) => s + m.productionTotal, 0);
  const totalReferrals = monthlyData.reduce((s, m) => s + m.totalReferrals, 0);
  const prodChange = previous
    ? Math.round(((latest.productionTotal - previous.productionTotal) / previous.productionTotal) * 100)
    : null;
  const refChange = previous
    ? Math.round(((latest.totalReferrals - previous.totalReferrals) / previous.totalReferrals) * 100)
    : null;

  /* Referral mix for latest month */
  const mixTotal = latest.totalReferrals;
  const doctorPct = Math.round((latest.doctorReferrals / mixTotal) * 100);
  const selfPct = 100 - doctorPct;

  /* Velocity max for bar scaling */
  const maxReferrals = Math.max(...monthlyData.map((m) => m.selfReferrals + m.doctorReferrals));

  /* Top sources max */
  const maxSourcePct = Math.max(...topSources.map((s) => s.percentage));

  return (
    <DashboardLayout activeItem="referrals-hub">
      <div className="min-h-full bg-alloro-bg font-body text-alloro-textDark selection:bg-alloro-orange selection:text-white">
        <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          {/* Hero — PmsDashboardHero */}
          <section className="mb-6 flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="text-left">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Revenue Attribution
              </p>
              <h1 className="font-display text-[28px] font-normal leading-tight tracking-tight text-alloro-navy">
                Referral Intelligence
              </h1>
              <p className="mt-1.5 max-w-[540px] text-[13px] font-normal leading-relaxed text-slate-500">
                See which channels and doctor relationships drive referrals,
                production, and your next best growth moves.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-alloro-orange px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-alloro-orange/20 transition-all duration-200 hover:scale-[1.02] hover:brightness-110"
            >
              Update data
              <ArrowRight className="h-4 w-4" />
            </button>
          </section>

          {/* Section header — PMS Vitals */}
          <div className="flex items-center gap-4 px-1">
            <h3 className="text-[10px] font-black uppercase tracking-[0.32em] text-slate-500">
              PMS Vitals
            </h3>
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              YTD
            </span>
          </div>

          {/* Vitals row — PmsVitalsRow */}
          <HotspotZone
            id="stats-row"
            hotspot={findHotspot("stats-row")}
            isActive={activeHotspotId === "stats-row"}
            onHotspotClick={onHotspotClick}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <VitalCard
                label="Production this month"
                value={formatCurrency(latest.productionTotal)}
                change={prodChange}
                isAccent
              />
              <VitalCard
                label="Total referrals"
                value={String(latest.totalReferrals)}
                sub={`${latest.doctorReferrals} doctor · ${latest.selfReferrals} self`}
                change={refChange}
              />
              <VitalCard
                label="Unique sources"
                value={String(topSources.length)}
                sub={`${monthlyData.length} months tracked`}
              />
              <VitalCard
                label="YTD production"
                value={formatCompactCurrency(totalProduction)}
                sub={`${totalReferrals} total referrals`}
              />
            </div>
          </HotspotZone>

          {/* PmsAttentionCards — static replica */}
          <div className="grid gap-4 lg:grid-cols-3">
            <AttentionCard
              icon={Layers3}
              label="Top source"
              title="Google Business Profile"
              detail="68 referrals · 34% of tracked production."
            />
            <AttentionCard
              icon={AlertTriangle}
              label="Data coverage"
              title="6 months tracked"
              detail="Enough history for month-over-month referral patterns."
            />
            <AttentionCard
              icon={PieChart}
              label="Referral balance"
              title="31% doctor · 69% self"
              detail="Use this split to see whether growth is coming from peer referrals or patient-driven channels."
            />
          </div>

          {/* PmsExecutiveSummary — static replica */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-premium">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                  Executive Summary
                </p>
                <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-alloro-navy">
                  What the data is saying
                </h2>
              </div>
              <span className="rounded-xl bg-alloro-orange/10 p-2.5 text-alloro-orange">
                <Sparkles className="h-5 w-5" />
              </span>
            </div>
            <div className="grid gap-3">
              {executiveSummaryBullets.map((bullet) => (
                <div key={bullet} className="flex gap-3 rounded-xl bg-slate-50 p-4">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-alloro-orange" />
                  <p className="text-sm font-medium leading-6 text-slate-600">
                    {bullet}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Production chart + Referral mix grid */}
          <HotspotZone
            id="production-chart"
            hotspot={findHotspot("production-chart")}
            isActive={activeHotspotId === "production-chart"}
            onHotspotClick={onHotspotClick}
          >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
              {/* PmsProductionChart — static SVG replica */}
              <StaticProductionChart />

              {/* PmsReferralMixCard */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-premium">
                <div className="mb-6 flex items-center justify-between">
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                      Referral Mix
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-alloro-navy">
                      {latest.month}
                    </h2>
                  </div>
                  <span className="rounded-xl bg-alloro-orange/10 p-2.5 text-alloro-orange">
                    <UsersRound className="h-5 w-5" />
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-5">
                  <div className="text-left">
                    <div className="font-display text-4xl font-medium tracking-tight text-alloro-navy tabular-nums">
                      {selfPct}%
                    </div>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Self / walk-in
                    </p>
                    <p className="mt-2 text-2xl font-black text-alloro-navy tabular-nums">
                      {latest.selfReferrals}
                    </p>
                  </div>
                  <div className="border-l border-slate-100 pl-5 text-left">
                    <div className="font-display text-4xl font-medium tracking-tight text-alloro-orange tabular-nums">
                      {doctorPct}%
                    </div>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Doctor referrals
                    </p>
                    <p className="mt-2 text-2xl font-black text-alloro-navy tabular-nums">
                      {latest.doctorReferrals}
                    </p>
                  </div>
                </div>

                <svg viewBox="0 0 100 8" className="mt-6 h-2 w-full overflow-hidden rounded-full" preserveAspectRatio="none">
                  <rect width="100" height="8" rx="4" fill="#E8E4DF" />
                  <rect width={selfPct} height="8" rx="4" fill="#D8D3CC" />
                  <rect x={selfPct} width={doctorPct} height="8" rx="4" fill="#E8792B" />
                </svg>
                <div className="mt-3 flex gap-5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-slate-300" />
                    Self
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-sm bg-alloro-orange" />
                    Doctor
                  </span>
                </div>
              </section>
            </div>
          </HotspotZone>

          {/* Top Sources + Velocity grid */}
          <HotspotZone
            id="referral-sources"
            hotspot={findHotspot("referral-sources")}
            isActive={activeHotspotId === "referral-sources"}
            onHotspotClick={onHotspotClick}
          >
            <div className="grid gap-6 xl:grid-cols-2">
              {/* PmsTopSourcesCard */}
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-premium">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                      Top Sources · All Time
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-alloro-navy">
                      Ranked by production
                    </h2>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    {topSources.length} sources
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {topSources.map((source, index) => {
                    const barWidth = Math.max((source.percentage / maxSourcePct) * 100, 8);
                    return (
                      <div
                        key={source.rank}
                        className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-4 px-6 py-4 transition-colors hover:bg-slate-50"
                      >
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black ${
                            index < 3
                              ? "bg-alloro-orange text-white"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {source.rank}
                        </span>
                        <div className="min-w-0 text-left">
                          <div className="truncate text-sm font-black text-alloro-navy">
                            {source.name}
                          </div>
                          <div className="mt-1 flex items-center gap-3">
                            <svg viewBox="0 0 100 4" className="h-1 w-24 rounded-full" preserveAspectRatio="none">
                              <rect width="100" height="4" rx="2" fill="#F0ECE8" />
                              <rect width={barWidth} height="4" rx="2" fill="#E8792B" />
                            </svg>
                            <span className="text-[11px] font-semibold text-slate-400">
                              {source.percentage}% of production
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs font-bold text-alloro-navy tabular-nums">
                            {formatCurrency(source.production)}
                          </div>
                          <div className="mt-1 font-mono text-[11px] font-semibold text-slate-500 tabular-nums">
                            {source.referrals} refs
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* PmsVelocityCard */}
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-premium">
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">
                      Referral Velocity · Last 6 Months
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-alloro-navy">
                      Monthly referral pace
                    </h2>
                  </div>
                  <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-sm bg-alloro-orange" />
                      Self
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-sm bg-alloro-navy" />
                      Doctor
                    </span>
                  </div>
                </div>

                <div className="space-y-5">
                  {monthlyData.map((month) => {
                    const selfWidth = Math.max((month.selfReferrals / maxReferrals) * 100, 4);
                    const doctorWidth = Math.max((month.doctorReferrals / maxReferrals) * 100, 4);
                    return (
                      <div key={month.month} className="grid grid-cols-[4rem_minmax(0,1fr)_5rem] items-center gap-4">
                        <div className="text-right text-xs font-black uppercase text-alloro-navy">
                          {month.month}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <svg viewBox="0 0 100 10" className="h-2.5 w-full" preserveAspectRatio="none">
                              <rect width={selfWidth} height="10" rx="5" fill="#E8792B" />
                            </svg>
                            <span className="w-8 font-mono text-xs font-bold text-alloro-navy tabular-nums">
                              {month.selfReferrals}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <svg viewBox="0 0 100 7" className="h-2 w-full" preserveAspectRatio="none">
                              <rect width={doctorWidth} height="7" rx="4" fill="#1A1F36" opacity="0.78" />
                            </svg>
                            <span className="w-8 font-mono text-[11px] font-bold text-slate-500 tabular-nums">
                              {month.doctorReferrals}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-xs font-black text-alloro-navy tabular-nums">
                            {month.totalReferrals}
                          </div>
                          <div className="font-mono text-[11px] font-semibold text-green-700">
                            {formatCompactCurrency(month.productionTotal)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </HotspotZone>

          {/* Upload section — PmsIngestionCard static display */}
          <HotspotZone
            id="referral-matrix"
            hotspot={findHotspot("referral-matrix")}
            isActive={activeHotspotId === "referral-matrix"}
            onHotspotClick={onHotspotClick}
          >
            <section className="bg-white rounded-2xl border border-slate-200 shadow-premium p-10 lg:p-16 flex flex-col md:flex-row items-center justify-between gap-12 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-96 h-96 bg-alloro-orange/[0.03] rounded-full blur-3xl -mr-48 -mt-48 pointer-events-none group-hover:bg-alloro-orange/[0.06] transition-all duration-700"></div>

              <div className="space-y-8 flex-1 text-left relative z-10">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-alloro-navy text-white rounded-2xl flex items-center justify-center shadow-2xl">
                    <Upload size={24} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black uppercase tracking-[0.3em] text-alloro-orange">
                      Ledger Ingestion
                    </span>
                    <h3 className="text-3xl font-black font-heading text-alloro-navy tracking-tight mt-1">
                      Sync your practice.
                    </h3>
                  </div>
                </div>
                <p className="text-lg text-slate-500 font-medium tracking-tight leading-relaxed max-w-lg">
                  Upload your latest exports from{" "}
                  <span className="text-alloro-navy font-black">
                    Cloud9, Dolphin, or Gaidge
                  </span>{" "}
                  to refresh all intelligence models instantly.
                </p>
                <div className="flex flex-wrap items-center gap-8 pt-4">
                  <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <ShieldCheck size={16} className="text-green-500" /> 100%
                    HIPAA SECURE
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <Lock size={16} className="text-alloro-orange" /> AES-256
                    ENCRYPTED
                  </div>
                </div>
              </div>

              <div className="w-full md:w-[400px] h-[300px] border-2 border-dashed rounded-3xl flex flex-col items-center justify-center shrink-0 relative z-10 border-slate-200 bg-slate-50/50">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-premium border border-black/5 mb-5">
                  <Upload size={28} />
                </div>
                <span className="text-base font-black text-alloro-navy font-heading">
                  Drop Revenue CSV Export
                </span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-3">
                  Max Ingestion: 50MB
                </span>
                <span className="text-[9px] font-bold text-alloro-orange mt-2">
                  Click or drag to upload
                </span>
              </div>
            </section>
          </HotspotZone>
        </div>
      </div>
    </DashboardLayout>
  );
}
