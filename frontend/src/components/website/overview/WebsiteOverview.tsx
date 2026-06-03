import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ArrowRight, BarChart3, Inbox } from "lucide-react";
import { apiGet } from "../../../api";
import { InfoTip } from "../../dashboard/shared/InfoTip";
import {
  fetchWebsiteAnalytics,
  type WebsiteAnalytics,
} from "../../../api/websiteAnalytics";
import { useFormSubmissionsTimeseries } from "../../../hooks/queries/useFormSubmissionsTimeseries";
import type { TimeseriesPoint } from "../../../api/formSubmissionsTimeseries";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../../contexts/OnboardingWizardContext";
import { MeaningHero } from "../../dashboard/shared/MeaningHero";
import { DetailsModal } from "../../dashboard/shared/DetailsModal";
import { TrendSparkline } from "../../dashboard/shared/TrendSparkline";
import { OverviewCard, OverviewCardEmptyState, TrendPill } from "./OverviewCard";
import { computeWebsiteMetrics, formatConversion } from "./websiteMetrics";

export type WebsiteOverviewTab =
  | "editor"
  | "submissions"
  | "posts"
  | "menus"
  | "pages";

export type WebsiteOverviewProps = {
  pageCount: number;
  templateId: string | null;
  onOpenTab: (tab: WebsiteOverviewTab) => void;
};

const numberFmt = new Intl.NumberFormat("en-US");
const fmt = (n: number) => numberFmt.format(Math.round(n));

interface ListResponse {
  success: boolean;
  data?: unknown[];
}
async function fetchCount(path: string): Promise<number> {
  const r = (await apiGet({ path })) as ListResponse;
  return r?.data?.length ?? 0;
}

interface FormStats {
  allCount: number;
  unreadCount: number;
  verifiedCount: number;
  flaggedCount: number;
}
async function fetchFormStats(): Promise<FormStats> {
  const r = (await apiGet({
    path: "/user/website/form-submissions/stats",
  })) as Partial<FormStats> & { success: boolean };
  return {
    allCount: r.allCount ?? r.verifiedCount ?? 0,
    unreadCount: r.unreadCount ?? 0,
    verifiedCount: r.verifiedCount ?? 0,
    flaggedCount: r.flaggedCount ?? 0,
  };
}

function durationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function WebsiteOverview({
  pageCount,
  templateId,
  onOpenTab,
}: WebsiteOverviewProps) {
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const [modal, setModal] = useState<"traffic" | "leads" | null>(null);

  const analyticsQuery = useQuery<WebsiteAnalytics>({
    queryKey: ["websiteAnalytics", 365],
    queryFn: () => fetchWebsiteAnalytics(365),
    enabled: !isWizardActive,
    staleTime: 5 * 60 * 1000,
  });
  const series = useFormSubmissionsTimeseries("12m");
  const statsQuery = useQuery<FormStats>({
    queryKey: ["formSubmissionsStats"],
    queryFn: fetchFormStats,
    enabled: !isWizardActive,
    staleTime: 5 * 60 * 1000,
  });
  const postsQuery = useQuery<number>({
    queryKey: ["websiteOverviewPostsCount"],
    queryFn: () => fetchCount("/user/website/posts"),
    enabled: !isWizardActive && !!templateId,
    staleTime: 5 * 60 * 1000,
  });
  const menusQuery = useQuery<number>({
    queryKey: ["websiteOverviewMenusCount"],
    queryFn: () => fetchCount("/user/website/menus"),
    enabled: !isWizardActive,
    staleTime: 5 * 60 * 1000,
  });

  const demoCard = wizardDemoData?.websiteCardData as
    | Record<string, unknown>
    | undefined;
  const analytics = isWizardActive
    ? (demoCard?.analytics as WebsiteAnalytics | undefined)
    : analyticsQuery.data;
  const timeseries: TimeseriesPoint[] = isWizardActive
    ? ((demoCard?.timeseries as TimeseriesPoint[]) ?? [])
    : series.data ?? [];
  const stats = isWizardActive
    ? (demoCard?.stats as FormStats | undefined)
    : statsQuery.data;

  const postsCount = isWizardActive ? 6 : postsQuery.data ?? 0;
  const menusCount = isWizardActive ? 2 : menusQuery.data ?? 0;
  const loading = isWizardActive
    ? false
    : analyticsQuery.isLoading || series.isLoading;

  const m = useMemo(
    () => computeWebsiteMetrics(analytics, timeseries, new Date()),
    [analytics, timeseries],
  );

  // Hovering a sparkline point updates the matching headline (no floating chip).
  const [funnelHover, setFunnelHover] = useState<number | null>(null);
  const [trafficHover, setTrafficHover] = useState<number | null>(null);
  const [leadsHover, setLeadsHover] = useState<number | null>(null);
  const [trafficModalHover, setTrafficModalHover] = useState<number | null>(null);
  const [leadsModalHover, setLeadsModalHover] = useState<number | null>(null);
  const funnelPoint = funnelHover !== null ? m.visitorSeries[funnelHover] : null;
  const trafficPoint = trafficHover !== null ? m.visitorSeries[trafficHover] : null;
  const leadsPoint = leadsHover !== null ? m.leadSeries[leadsHover] : null;
  const trafficModalPoint =
    trafficModalHover !== null ? m.visitorSeries[trafficModalHover] : null;
  const leadsModalPoint =
    leadsModalHover !== null ? m.leadSeries[leadsModalHover] : null;

  const leadWord = m.monthLeads === 1 ? "lead" : "leads";
  const insight = m.hasAnalytics
    ? `Your website turned ${fmt(m.monthVisitors)} visitors into ${m.monthLeads} ${leadWord} this month — a ${formatConversion(m.conversionRate)} conversion rate.`
    : `${m.monthLeads} ${leadWord} came in through your website forms this month. Connect web analytics to see how many visitors that took.`;
  const insightHighlights = m.hasAnalytics
    ? [
        `${fmt(m.monthVisitors)} visitors`,
        `${m.monthLeads} ${leadWord}`,
        `${formatConversion(m.conversionRate)} conversion rate`,
      ]
    : [`${m.monthLeads} ${leadWord}`];

  const score = (
    <div className="flex flex-col items-center">
      <span className="font-display text-[52px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
        {m.hasAnalytics ? formatConversion(m.conversionRate) : m.monthLeads}
      </span>
      <span className="mt-2 text-[11px] font-semibold text-[color:var(--color-pm-text-secondary)]">
        {m.hasAnalytics ? "of visitors this month" : "leads this month"}
      </span>
    </div>
  );

  const estimateSummary = (
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-mono-display text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--color-pm-text-secondary)]">
            Visitors
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-display text-[30px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
              {funnelPoint
                ? fmt(funnelPoint.visitors)
                : m.hasAnalytics
                  ? fmt(m.monthVisitors)
                  : "—"}
            </span>
            {funnelPoint ? (
              <span className="text-[10px] font-semibold text-[color:var(--color-pm-text-secondary)]">
                {funnelPoint.label}
              </span>
            ) : (
              <TrendPill deltaPct={m.visitorsDeltaPct} />
            )}
          </div>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-alloro-navy/25" />
        <div className="text-right">
          <div className="font-mono-display text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--color-pm-text-secondary)]">
            Leads
          </div>
          <div className="mt-1.5 flex items-baseline justify-end gap-2">
            <span className="font-display text-[30px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
              {funnelPoint
                ? m.leadsByMonth[funnelPoint.month] ?? 0
                : m.monthLeads}
            </span>
            {funnelPoint ? (
              <span className="text-[10px] font-semibold text-[color:var(--color-pm-text-secondary)]">
                {funnelPoint.monthName}
              </span>
            ) : (
              <TrendPill deltaPct={m.leadsPaceDeltaPct} />
            )}
          </div>
        </div>
      </div>
      {m.hasAnalytics && (
        <div className="-mx-1">
          <TrendSparkline
            data={m.visitorSeries}
            valueKey="visitors"
            labelKey="label"
            height={84}
            showLabels={false}
            onActiveIndexChange={setFunnelHover}
          />
        </div>
      )}
      {m.hasAnalytics && (
        <div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-alloro-navy/10">
            <div
              className="h-full rounded-full bg-alloro-orange"
              style={{ width: `${Math.min(100, Math.max(3, m.conversionRate * 100))}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] font-medium text-[color:var(--color-pm-text-secondary)]">
            {formatConversion(m.conversionRate)} of visitors became leads
          </div>
        </div>
      )}
    </div>
  );

  const ctaCls =
    "inline-flex min-h-[40px] w-full items-center justify-between gap-2 rounded-[10px] border border-[#EDE5C0] bg-white px-3 py-2 text-left text-[10px] font-black uppercase tracking-[0.1em] text-alloro-navy/70 transition-colors hover:border-alloro-orange/25 hover:bg-alloro-orange/10 hover:text-alloro-orange disabled:opacity-40 disabled:hover:border-[#EDE5C0] disabled:hover:bg-white disabled:hover:text-alloro-navy/70";
  const actions = (
    <div className="grid grid-cols-1 gap-2">
      <button
        type="button"
        onClick={() => setModal("traffic")}
        disabled={!m.hasAnalytics}
        className={ctaCls}
      >
        Traffic detail <ChevronRight size={14} />
      </button>
      <button type="button" onClick={() => setModal("leads")} className={ctaCls}>
        Leads detail <ChevronRight size={14} />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div
        className="pm-light mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
        data-wizard-target="website-overview"
      >
        <div className="h-[260px] animate-pulse rounded-[16px] bg-neutral-100" />
        <div className="grid gap-5 md:grid-cols-2">
          <div className="h-[220px] animate-pulse rounded-[14px] bg-neutral-100" />
          <div className="h-[220px] animate-pulse rounded-[14px] bg-neutral-100" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="pm-light mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
      data-wizard-target="website-overview"
    >
      <MeaningHero
        insight={insight}
        insightHighlights={insightHighlights}
        score={score}
        scoreLabel="Conversion rate"
        scoreTooltip="Share of unique visitors who submitted a form on your site this month."
        estimateSummary={estimateSummary}
        actions={actions}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <OverviewCard
          eyebrow="Traffic · Last 12 mo"
          infoTip="Unique visitors to your website. The headline is this month to date; the chart shows monthly visitors."
          onOpen={m.hasAnalytics ? () => setModal("traffic") : undefined}
          openLabel="Traffic detail"
        >
          {m.hasAnalytics ? (
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[32px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
                  {trafficPoint ? fmt(trafficPoint.visitors) : fmt(m.monthVisitors)}
                </span>
                <span className="text-xs font-medium text-[color:var(--color-pm-text-secondary)]">
                  {trafficPoint ? `visitors · ${trafficPoint.label}` : "visitors"}
                </span>
                {!trafficPoint && <TrendPill deltaPct={m.visitorsDeltaPct} />}
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-pm-text-secondary)]">
                {trafficPoint
                  ? `${fmt(trafficPoint.sessions)} sessions · ${fmt(trafficPoint.pageviews)} page views`
                  : `${fmt(m.monthSessions)} sessions · ${fmt(m.monthPageviews)} page views`}
              </div>
              <div className="mt-4">
                <TrendSparkline
                  data={m.visitorSeries}
                  valueKey="visitors"
                  labelKey="label"
                  height={140}
                  onActiveIndexChange={setTrafficHover}
                />
              </div>
            </div>
          ) : (
            <OverviewCardEmptyState
              icon={<BarChart3 size={20} />}
              title="Analytics not connected"
              hint="Connect web analytics to track visitors and conversion."
            />
          )}
        </OverviewCard>

        <OverviewCard
          eyebrow="Leads · Last 12 mo"
          infoTip="Verified form submissions from your website."
          onOpen={() => setModal("leads")}
          openLabel="Leads detail"
        >
          {timeseries.length === 0 && m.monthLeads === 0 ? (
            <OverviewCardEmptyState
              icon={<Inbox size={20} />}
              title="No leads yet"
              hint="Verified leads from your website forms will appear here."
            />
          ) : (
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[32px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
                  {leadsPoint ? leadsPoint.leads : m.monthLeads}
                </span>
                <span className="text-xs font-medium text-[color:var(--color-pm-text-secondary)]">
                  {leadsPoint ? `leads · ${leadsPoint.label}` : "leads this month"}
                </span>
                {!leadsPoint && <TrendPill deltaPct={m.leadsPaceDeltaPct} />}
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-pm-text-secondary)]">
                {m.hasAnalytics
                  ? `${formatConversion(m.conversionRate)} of visitors converted`
                  : `${fmt(stats?.allCount ?? 0)} all-time`}
              </div>
              <div className="mt-4">
                <TrendSparkline
                  data={m.leadSeries}
                  valueKey="leads"
                  labelKey="label"
                  height={140}
                  onActiveIndexChange={setLeadsHover}
                />
              </div>
            </div>
          )}
        </OverviewCard>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[14px] border border-line-soft bg-white px-5 py-4 shadow-premium">
        <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
          Manage
        </span>
        <StripLink
          label={`${pageCount} ${pageCount === 1 ? "page" : "pages"}`}
          onClick={() => onOpenTab("pages")}
        />
        {templateId && (
          <StripLink
            label={`${postsCount} ${postsCount === 1 ? "post" : "posts"}`}
            onClick={() => onOpenTab("posts")}
          />
        )}
        <StripLink
          label={`${menusCount} ${menusCount === 1 ? "menu" : "menus"}`}
          onClick={() => onOpenTab("menus")}
        />
      </div>

      <DetailsModal
        open={modal === "traffic"}
        title="Traffic & engagement"
        eyebrow="Website analytics"
        onClose={() => setModal(null)}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ModalStat
              label="Visitors"
              value={fmt(m.totals?.users ?? 0)}
              tip="Unique people who visited your site (each person counted once)."
            />
            <ModalStat
              label="Visits"
              sub="sessions"
              value={fmt(m.totals?.sessions ?? 0)}
              tip="Total visits, including repeat visits by the same person."
            />
            <ModalStat
              label="Page views"
              value={fmt(m.totals?.pageviews ?? 0)}
              tip="Total number of pages opened across all visits."
            />
            <ModalStat
              label="Left right away"
              sub="bounce rate"
              value={`${Math.round((m.totals?.bounceRate ?? 0) * 100)}%`}
              tip="Share of visits where someone viewed just one page and then left."
            />
            <ModalStat
              label="Pages per visit"
              sub="pages/session"
              value={(m.totals?.pagesPerSession ?? 0).toFixed(1)}
              tip="Average number of pages someone views in a single visit."
            />
            <ModalStat
              label="Time on site"
              sub="avg. visit"
              value={durationLabel(m.totals?.sessionDuration ?? 0)}
              tip="Average time a visitor spends on your site per visit."
            />
          </div>
          <div className="rounded-[14px] border border-line-soft bg-white p-4 shadow-premium">
            <div className="mb-3 font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
              {trafficModalPoint
                ? `Monthly visitors · ${trafficModalPoint.label}: ${fmt(trafficModalPoint.visitors)}`
                : "Monthly visitors · last 12 months"}
            </div>
            <TrendSparkline
              data={m.visitorSeries}
              valueKey="visitors"
              labelKey="label"
              height={220}
              onActiveIndexChange={setTrafficModalHover}
            />
          </div>
        </div>
      </DetailsModal>

      <DetailsModal
        open={modal === "leads"}
        title="Leads & conversion"
        eyebrow="Form submissions"
        onClose={() => setModal(null)}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ModalStat
              label="This month"
              value={String(m.monthLeads)}
              tip="Verified leads received so far this month."
            />
            <ModalStat
              label="Last month"
              value={String(m.prevMonthLeads)}
              tip="Verified leads in the previous full month."
            />
            <ModalStat
              label="Conversion"
              sub="rate"
              value={m.hasAnalytics ? formatConversion(m.conversionRate) : "—"}
              tip="Share of unique visitors who submitted a form this month."
            />
            <ModalStat
              label="All time"
              value={fmt(stats?.allCount ?? 0)}
              tip="Total verified leads ever received from your website forms."
            />
          </div>
          <div className="rounded-[14px] border border-line-soft bg-white p-4 shadow-premium">
            <div className="mb-3 font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
              {leadsModalPoint
                ? `Verified leads · ${leadsModalPoint.label}: ${leadsModalPoint.leads}`
                : "Verified leads · last 12 months"}
            </div>
            <TrendSparkline
              data={m.leadSeries}
              valueKey="leads"
              labelKey="label"
              height={220}
              onActiveIndexChange={setLeadsModalHover}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setModal(null);
              onOpenTab("submissions");
            }}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-alloro-navy px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-navy/90"
          >
            View all submissions <ChevronRight size={14} />
          </button>
        </div>
      </DetailsModal>
    </div>
  );
}

function StripLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[13px] font-semibold text-alloro-navy/70 transition-colors hover:text-alloro-orange"
    >
      {label}
      <ChevronRight size={13} />
    </button>
  );
}

function ModalStat({
  label,
  sub,
  value,
  tip,
}: {
  label: string;
  sub?: string;
  value: string;
  tip?: string;
}) {
  return (
    <div className="rounded-[12px] border border-line-soft bg-white p-3">
      <div className="flex items-center gap-1">
        <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--color-pm-text-secondary)]">
          {label}
        </span>
        {sub ? (
          <span className="text-[10px] font-medium lowercase text-[color:var(--color-pm-text-secondary)]/60">
            ({sub})
          </span>
        ) : null}
        {tip ? <InfoTip content={tip} align="left" /> : null}
      </div>
      <div className="mt-1 font-display text-xl font-medium text-alloro-navy tabular-nums">
        {value}
      </div>
    </div>
  );
}
