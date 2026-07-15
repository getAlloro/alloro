import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, BarChart3, Inbox, Search } from "lucide-react";
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
import { useWebsiteGscPerformance } from "../../../hooks/queries/useWebsiteGscPerformance";

export type WebsiteOverviewTab =
  | "editor"
  | "submissions"
  | "posts"
  | "menus"
  | "pages"
  | "keywords";

export type WebsiteOverviewProps = {
  pageCount: number;
  templateId: string | null;
  onOpenTab: (tab: WebsiteOverviewTab) => void;
};

const numberFmt = new Intl.NumberFormat("en-US");
const fmt = (n: number) => numberFmt.format(Math.round(n));

/**
 * Eyebrow time-window label for the overview cards. The cards plot the trimmed
 * monthly series (leading no-data months dropped, capped at 12 by
 * computeWebsiteMetrics), so the real span is usually shorter than the
 * 12-month fetch window — a practice live for 3 months shows 3 points, not 12.
 * Label the number of months actually on the chart, not the nominal window.
 * Falls back to the full window when there's nothing to plot (the card shows
 * its empty state in that case, so the suffix is moot).
 */
function monthsRangeLabel(monthsShown: number): string {
  const n = Math.min(Math.max(monthsShown, 0), 12);
  return n > 0 ? `Last ${n} mo` : "Last 12 mo";
}

const GSC_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
/** "2026-06-10" → "Jun 10" (timezone-safe; no Date construction). */
function gscDayLabel(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${GSC_MONTHS[Number(month) - 1] ?? ""} ${Number(day)}`;
}

// Column-dot / line colors for the hero funnel: visitors (orange) → leads
// (green) → conversion (navy). Visitors must match TrendSparkline's hardcoded
// primary; leads is passed as the chart's secondary line color. Leads is GREEN
// (#14 — it read as black/navy before). Conversion is no longer plotted as a
// line (#14 — removed from the chart to avoid the early-month pace artifact);
// its color is only the column dot now, so it takes navy to stay distinct from
// the green leads line/column.
const FUNNEL_COLORS = {
  visitors: "var(--color-alloro-orange)",
  leads: "#4F8A5B",
  conversion: "var(--color-alloro-navy)",
} as const;

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
  const gscQuery = useWebsiteGscPerformance(90, !isWizardActive);

  const gscDash = gscQuery.data?.dashboard ?? null;
  const gscConnected = !!gscQuery.data?.hasIntegration;
  const gscHasData = !!gscDash && gscDash.dataDays > 0;
  const gscTotals = gscDash?.totals;
  const gscTopQueries = (gscDash?.topQueries ?? []).slice(0, 3);
  const gscSeries = useMemo(
    () =>
      (gscDash?.daily ?? []).map((p) => ({
        label: gscDayLabel(p.date),
        clicks: p.clicks,
        impressions: p.impressions,
      })),
    [gscDash],
  );

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
  const funnelPoint = funnelHover !== null ? m.funnelSeries[funnelHover] : null;
  const trafficPoint = trafficHover !== null ? m.visitorSeries[trafficHover] : null;
  const leadsPoint = leadsHover !== null ? m.leadSeriesCompact[leadsHover] : null;
  // #16: the leads modal graph is the LAST 3 MONTHS (the owner asked for a
  // tighter, recent window rather than a 12-month line). Slice the monthly
  // series and label the real span of what's shown — never a nominal range
  // that doesn't match the chart.
  const leadsModalSeries = useMemo(
    () => m.leadSeries.slice(-3),
    [m.leadSeries],
  );
  const trafficModalPoint =
    trafficModalHover !== null ? m.visitorDaily[trafficModalHover] : null;
  const leadsModalPoint =
    leadsModalHover !== null ? leadsModalSeries[leadsModalHover] : null;
  const [gscHover, setGscHover] = useState<number | null>(null);
  const gscPoint = gscHover !== null ? gscSeries[gscHover] ?? null : null;

  // Item 2 (Rev 1): the bottom cards headline the AGGREGATE over the months they
  // plot, so the eyebrow + headline sub-text share one window label per card.
  // `…Lower` is the lowercase variant for the inline "visitors · last 3 mo".
  const trafficWindowLabel = monthsRangeLabel(m.visitorSeries.length);
  const trafficWindowLabelLower = trafficWindowLabel.toLowerCase();
  const leadsWindowLabel = monthsRangeLabel(m.leadSeriesCompact.length);
  const leadsWindowLabelLower = leadsWindowLabel.toLowerCase();

  // #15/#16: honest chart-title spans — describe what the chart actually plots
  // (its real first→last point), not a nominal "last 12 months". Traffic uses
  // the daily series; leads uses the 3-month slice above.
  const trafficDailySpan = (() => {
    const pts = m.visitorDaily;
    if (pts.length === 0) return "Daily visitors";
    const first = pts[0]?.label;
    const last = pts[pts.length - 1]?.label;
    return first && last ? `Daily visitors · ${first} – ${last}` : "Daily visitors";
  })();
  const leadsMonthlySpan = (() => {
    if (leadsModalSeries.length === 0) return "Verified leads";
    const first = leadsModalSeries[0]?.label;
    const last = leadsModalSeries[leadsModalSeries.length - 1]?.label;
    return first && last && first !== last
      ? `Verified leads · ${first} – ${last}`
      : `Verified leads · ${last ?? ""}`.trim();
  })();

  const leadWord = m.monthLeads === 1 ? "lead" : "leads";
  // FIX 5.1: relief-first, never "turned N visitors into 0 leads". Lead with what
  // is working (people are reaching the site) and name the Bookable step as the
  // most fixable one. Does NOT claim Alloro auto-optimizes the site — that system
  // is unbuilt (task #25); it honestly names the fixable step, not a done action.
  const insight = m.hasAnalytics
    ? m.monthLeads > 0
      ? `${fmt(m.monthVisitors)} people reached your site this month and ${m.monthLeads} asked to book. Across your funnel, the visit-to-booking step is where the most is slipping through.`
      : `${fmt(m.monthVisitors)} people reached your site this month, so the top of your funnel is working. The drop-off is at the booking step, where those visits aren't turning into requests yet.`
    : `${m.monthLeads} ${leadWord} came in through your website forms this month. Connect web analytics to see how many visitors that took.`;
  const insightHighlights = m.hasAnalytics
    ? m.monthLeads > 0
      ? [`${fmt(m.monthVisitors)} people`, `${m.monthLeads} asked to book`]
      : [`${fmt(m.monthVisitors)} people`, "booking step"]
    : [`${m.monthLeads} ${leadWord}`];

  // #14: the headline conversion is the LAST FULL MONTH's settled rate, not the
  // month-to-date pace (early in a month MTD produced absurd headline numbers
  // like "1,066%"). A settled full-month figure is honest and stable. When
  // there's no prior full month of analytics yet, fall back to the leads count.
  const hasSettledConversion = m.hasAnalytics && m.prevConversionRate > 0;
  const score = (
    <div className="flex flex-col items-center text-center">
      <span className="font-display text-[52px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
        {hasSettledConversion ? formatConversion(m.prevConversionRate) : m.monthLeads}
      </span>
      <span className="mt-2 text-[11px] font-semibold text-[color:var(--color-pm-text-secondary)]">
        {hasSettledConversion ? "last full month" : "leads this month"}
      </span>
      {hasSettledConversion && (
        <span className="mt-2 max-w-[210px] text-[10px] font-medium leading-snug text-[color:var(--color-pm-text-secondary)]/70">
          A settled full-month figure — not affected by partial early-month data.
        </span>
      )}
    </div>
  );

  // #14/#17: the funnel shows the two funnel STAGES — visitors → leads — over
  // the monthly series. Conversion is intentionally NOT a funnel column or a
  // chart line here (it lived as an early-month MTD artifact); it now appears
  // only as the settled headline card above. This also resolves the "monthly
  // vs this month" duplication (#17) — the trio reads as one consistent frame.
  const funnelCols = [
    {
      key: "visitors",
      label: "Visitors",
      color: FUNNEL_COLORS.visitors,
      value: funnelPoint
        ? fmt(funnelPoint.visitors)
        : m.hasAnalytics
          ? fmt(m.monthVisitors)
          : "—",
    },
    {
      key: "leads",
      label: (
        <>
          Leads{" "}
          <span className="font-medium normal-case tracking-normal opacity-60">
            (form submissions)
          </span>
        </>
      ),
      color: FUNNEL_COLORS.leads,
      value: String(funnelPoint ? funnelPoint.leads : m.monthLeads),
    },
  ];

  const estimateSummary = (
    <div className="flex h-full flex-col justify-between gap-4">
      <div className="grid grid-cols-2 gap-3">
        {funnelCols.map((col) => (
          <div key={col.key}>
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: col.color }}
              />
              <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--color-pm-text-secondary)]">
                {col.label}
              </span>
            </div>
            <div className="mt-1.5 font-display text-[28px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
              {col.value}
            </div>
          </div>
        ))}
      </div>
      {m.hasAnalytics && (
        <div className="-mx-1">
          <TrendSparkline
            data={m.funnelSeries}
            valueKey="visitorsN"
            secondaryKey="leadsN"
            secondaryColor={FUNNEL_COLORS.leads}
            labelKey="monthName"
            height={110}
            showArea={false}
            onActiveIndexChange={setFunnelHover}
          />
        </div>
      )}
      {m.hasAnalytics && (
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--color-pm-text-secondary)]">
          {funnelPoint ? funnelPoint.monthName : "Monthly · visitors and leads"}
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
        className="pm-light mx-auto w-full max-w-[960px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
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
      className="pm-light mx-auto w-full max-w-[960px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
      data-wizard-target="website-overview"
    >
      <MeaningHero
        insight={insight}
        insightHighlights={insightHighlights}
        score={score}
        scoreLabel="Last month's conversion rate"
        scoreTooltip="Verified leads ÷ visitors for the last full calendar month. A retroactive, settled figure — it doesn't move with partial early-month data."
        estimateSummary={estimateSummary}
        actions={actions}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <OverviewCard
          eyebrow={`Traffic · ${trafficWindowLabel}`}
          infoTip="Visitors to your website — unique people, each counted once. The headline totals the displayed window; the chart shows monthly visitors. Hover a month for that month's number and its change against the previous month."
          onOpen={m.hasAnalytics ? () => setModal("traffic") : undefined}
          openLabel="Traffic detail"
        >
          {m.hasAnalytics ? (
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[32px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
                  {trafficPoint ? fmt(trafficPoint.visitors) : fmt(m.windowVisitors)}
                </span>
                <span className="text-xs font-medium text-[color:var(--color-pm-text-secondary)]">
                  {trafficPoint ? `visitors · ${trafficPoint.label}` : `visitors · ${trafficWindowLabelLower}`}
                </span>
                {trafficPoint && <HoverTrend deltaPct={trafficPoint.deltaPct} />}
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-pm-text-secondary)]">
                {trafficPoint
                  ? `${fmt(trafficPoint.sessions)} sessions · ${fmt(trafficPoint.pageviews)} page views`
                  : `${fmt(m.windowSessions)} sessions · ${fmt(m.windowPageviews)} page views`}
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
          eyebrow={`Leads (form submissions) · ${leadsWindowLabel}`}
          infoTip="Verified form submissions from your website. The headline totals the displayed window; hover a month for that month's count and its change against the previous month."
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
                  {leadsPoint ? leadsPoint.leads : m.windowLeads}
                </span>
                <span className="text-xs font-medium text-[color:var(--color-pm-text-secondary)]">
                  {leadsPoint ? `leads · ${leadsPoint.label}` : `leads · ${leadsWindowLabelLower}`}
                </span>
                {leadsPoint && <HoverTrend deltaPct={leadsPoint.deltaPct} />}
              </div>
              <div className="mt-4">
                <TrendSparkline
                  data={m.leadSeriesCompact}
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

      <OverviewCard
        eyebrow="Search keywords · Last 90 days"
        infoTip="Clicks and search appearances from Google Search Console over the last 90 days. Search appearances are how many times your site showed up in Google Search results. Hover the chart for a single day. The Keywords tab has the full trend, range selector, and top pages."
        onOpen={() => onOpenTab("keywords")}
        openLabel="Keyword detail"
      >
        {gscQuery.isLoading ? (
          <div className="h-[150px] animate-pulse rounded-[10px] bg-neutral-100" />
        ) : gscConnected && gscHasData ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-display text-[32px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
                  {fmt(gscPoint ? gscPoint.clicks : gscTotals?.clicks ?? 0)}
                </span>
                <span className="text-xs font-medium text-[color:var(--color-pm-text-secondary)]">
                  {/* #18: name the source — these are Google Search clicks. */}
                  {gscPoint ? `clicks · ${gscPoint.label}` : "clicks from Google Search"}
                </span>
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-pm-text-secondary)]">
                {/* #18: avg position removed — it contradicted Local Rankings. */}
                {gscPoint
                  ? `${fmt(gscPoint.impressions)} search appearances that day`
                  : `${fmt(gscTotals?.impressions ?? 0)} search appearances`}
              </div>
              <div className="mt-4">
                <TrendSparkline
                  data={gscSeries}
                  valueKey="clicks"
                  labelKey="label"
                  height={120}
                  onActiveIndexChange={setGscHover}
                />
              </div>
            </div>
            <div>
              <div className="font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
                Top queries
              </div>
              <ul className="mt-3 space-y-2">
                {gscTopQueries.map((q) => (
                  <li
                    key={q.key}
                    className="flex items-center justify-between gap-3 text-[13px]"
                  >
                    <span
                      className="truncate font-medium text-alloro-navy"
                      title={q.key}
                    >
                      {q.key}
                    </span>
                    <span className="shrink-0 tabular-nums text-[color:var(--color-pm-text-secondary)]">
                      {fmt(q.clicks)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <OverviewCardEmptyState
            icon={<Search size={20} />}
            title={
              gscConnected
                ? "Collecting search data"
                : "Search Console not connected"
            }
            hint={
              gscConnected
                ? "Keyword performance appears within a few days of connecting."
                : "Connect Search Console to see the keywords bringing you traffic."
            }
          />
        )}
      </OverviewCard>

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
                ? trafficModalPoint.noData
                  ? `No data · ${trafficModalPoint.label}`
                  : `${trafficModalPoint.label}: ${fmt(trafficModalPoint.visitors ?? 0)} visitors`
                : trafficDailySpan}
            </div>
            <TrendSparkline
              data={m.visitorDaily}
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
        title="Leads & Conversion"
        eyebrow="Form submissions"
        onClose={() => setModal(null)}
      >
        <div className="space-y-5">
          {/* #16: All time sits next to Last month; Conversion is the previous
              full month (retroactive), matching the headline framing. */}
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
              label="All time"
              value={fmt(stats?.allCount ?? 0)}
              tip="Total verified leads ever received from your website forms."
            />
            <ModalStat
              label="Conversion"
              sub="last month"
              value={
                m.hasAnalytics && m.prevConversionRate > 0
                  ? formatConversion(m.prevConversionRate)
                  : "—"
              }
              tip="Verified leads ÷ visitors for the last full month — a settled, retroactive figure."
            />
          </div>
          <div className="rounded-[14px] border border-line-soft bg-white p-4 shadow-premium">
            <div className="mb-3 font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
              {leadsModalPoint
                ? `Verified leads · ${leadsModalPoint.label}: ${leadsModalPoint.leads}`
                : leadsMonthlySpan}
            </div>
            <TrendSparkline
              data={leadsModalSeries}
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

/**
 * Item 2 (Rev 1): hover-only month-over-month trend for the bottom cards. Shows
 * the colored ▲/▼ percent (TrendPill) followed by "against last month". Renders
 * nothing when the delta isn't meaningful (null) so a tiny prior month doesn't
 * produce a misleading swing.
 */
function HoverTrend({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null || !Number.isFinite(deltaPct)) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <TrendPill deltaPct={deltaPct} />
      <span className="text-[11px] font-medium text-[color:var(--color-pm-text-secondary)]">
        against last month
      </span>
    </span>
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
