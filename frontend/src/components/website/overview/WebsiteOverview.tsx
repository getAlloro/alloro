import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, BarChart3, Inbox } from "lucide-react";
import { apiGet } from "../../../api";
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
    queryKey: ["websiteAnalytics", 90],
    queryFn: () => fetchWebsiteAnalytics(90),
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
        {m.hasAnalytics
          ? m.conversionDeltaPp !== null
            ? `vs ${formatConversion(m.prevConversionRate)} last month`
            : "this month"
          : "leads this month"}
      </span>
    </div>
  );

  const estimateSummary = (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
          Visitors
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-2xl font-medium tracking-tight text-alloro-navy tabular-nums">
            {m.hasAnalytics ? fmt(m.monthVisitors) : "—"}
          </span>
          <TrendPill deltaPct={m.visitorsDeltaPct} />
        </div>
        <div className="mt-0.5 text-[11px] text-[color:var(--color-pm-text-secondary)]">
          this month
        </div>
      </div>
      <div>
        <div className="font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
          Leads
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-2xl font-medium tracking-tight text-alloro-navy tabular-nums">
            {m.monthLeads}
          </span>
          <TrendPill deltaPct={m.leadsPaceDeltaPct} />
        </div>
        <div className="mt-0.5 text-[11px] text-[color:var(--color-pm-text-secondary)]">
          on pace vs last month
        </div>
      </div>
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
          eyebrow="Traffic · This month"
          infoTip="Unique visitors to your website, month to date."
          onOpen={m.hasAnalytics ? () => setModal("traffic") : undefined}
          openLabel="Traffic detail"
        >
          {m.hasAnalytics ? (
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[32px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
                  {fmt(m.monthVisitors)}
                </span>
                <span className="text-xs font-medium text-[color:var(--color-pm-text-secondary)]">
                  visitors
                </span>
                <TrendPill deltaPct={m.visitorsDeltaPct} />
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-pm-text-secondary)]">
                {fmt(m.monthSessions)} sessions · {fmt(m.monthPageviews)} page views
              </div>
              <div className="mt-4">
                <TrendSparkline
                  data={m.visitorSeries}
                  valueKey="visitors"
                  labelKey="label"
                  height={140}
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
                  {m.monthLeads}
                </span>
                <span className="text-xs font-medium text-[color:var(--color-pm-text-secondary)]">
                  leads this month
                </span>
                <TrendPill deltaPct={m.leadsPaceDeltaPct} />
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
            <ModalStat label="Visitors" value={fmt(m.totals?.users ?? 0)} />
            <ModalStat label="Sessions" value={fmt(m.totals?.sessions ?? 0)} />
            <ModalStat label="Page views" value={fmt(m.totals?.pageviews ?? 0)} />
            <ModalStat
              label="Bounce rate"
              value={`${Math.round((m.totals?.bounceRate ?? 0) * 100)}%`}
            />
            <ModalStat
              label="Pages / session"
              value={(m.totals?.pagesPerSession ?? 0).toFixed(1)}
            />
            <ModalStat
              label="Avg. visit"
              value={durationLabel(m.totals?.sessionDuration ?? 0)}
            />
          </div>
          <div className="rounded-[14px] border border-line-soft bg-white p-4 shadow-premium">
            <div className="mb-3 font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
              Daily visitors · last {m.rangeDays} days
            </div>
            <TrendSparkline
              data={m.visitorSeries}
              valueKey="visitors"
              labelKey="label"
              height={220}
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
            <ModalStat label="This month" value={String(m.monthLeads)} />
            <ModalStat label="Last month" value={String(m.prevMonthLeads)} />
            <ModalStat
              label="Conversion"
              value={m.hasAnalytics ? formatConversion(m.conversionRate) : "—"}
            />
            <ModalStat label="All time" value={fmt(stats?.allCount ?? 0)} />
          </div>
          <div className="rounded-[14px] border border-line-soft bg-white p-4 shadow-premium">
            <div className="mb-3 font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
              Verified leads · last 12 months
            </div>
            <TrendSparkline
              data={m.leadSeries}
              valueKey="leads"
              labelKey="label"
              height={220}
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

function ModalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-line-soft bg-white p-3">
      <div className="font-mono-display text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--color-pm-text-secondary)]">
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-medium text-alloro-navy tabular-nums">
        {value}
      </div>
    </div>
  );
}
