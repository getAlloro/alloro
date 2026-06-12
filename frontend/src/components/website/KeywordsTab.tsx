import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Hourglass, ArrowRight } from "lucide-react";
import { TrendSparkline } from "../dashboard/shared/TrendSparkline";
import { InfoTip } from "../dashboard/shared/InfoTip";
import { useWebsiteGscPerformance } from "../../hooks/queries/useWebsiteGscPerformance";
import type { GscDimensionRow } from "../../api/websiteGscPerformance";

/**
 * Keywords tab — owner-facing Google Search Console performance.
 *
 * Trimmed for clients (per spec): totals (clicks, impressions, avg position),
 * clicks + impressions trend, and top queries / top pages. Countries, devices,
 * and per-dimension CTR are intentionally omitted. Reads the org-scoped GSC
 * endpoint via `useWebsiteGscPerformance`; renders not-connected and
 * collecting-data empty states. Built fresh — does not import admin GSC UI.
 *
 * Clicks and impressions live on very different scales, so they render as two
 * separate sparklines rather than one shared-axis chart (which would flatten
 * clicks to near-zero).
 *
 * Spec: plans/06112026-client-dashboard-gsc-keywords/spec.html (T3).
 */

const RANGES = [
  { days: 28, label: "28D" },
  { days: 90, label: "3M" },
  { days: 180, label: "6M" },
  { days: 365, label: "12M" },
] as const;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const numberFmt = new Intl.NumberFormat("en-US");
const fmt = (n: number) => numberFmt.format(Math.round(n));
const fmtPosition = (n: number) => (n > 0 ? n.toFixed(1) : "—");

/** "2026-06-11" → "Jun 11" without constructing a Date (timezone-safe). */
function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${MONTHS[Number(month) - 1] ?? ""} ${Number(day)}`;
}

/** Full page URL → readable path (host stripped), with the raw URL as title. */
function prettyPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

function StatTile({
  label,
  value,
  hint,
  infoTip,
}: {
  label: string;
  value: string;
  hint?: string;
  infoTip?: string;
}) {
  return (
    <div className="rounded-[14px] border border-line-soft bg-white p-5 shadow-premium">
      <div className="flex items-center gap-1.5">
        <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
          {label}
        </span>
        {infoTip ? <InfoTip content={infoTip} placement="bottom" /> : null}
      </div>
      <div className="mt-2 font-display text-[32px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11px] text-[color:var(--color-pm-text-secondary)]">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function KeywordTable({
  title,
  caption,
  rows,
  column,
}: {
  title: string;
  caption: string;
  rows: GscDimensionRow[];
  column: "query" | "page";
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line-soft bg-white shadow-premium">
      <div className="flex items-baseline justify-between gap-2 border-b border-line-soft px-5 py-4">
        <h3 className="font-mono-display text-[11px] font-bold uppercase tracking-[0.16em] text-alloro-navy">
          {title}
        </h3>
        <span className="text-[11px] font-medium text-[color:var(--color-pm-text-secondary)]">
          {caption}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-[color:var(--color-pm-text-secondary)]">
          No {column === "query" ? "queries" : "pages"} in this range yet.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--color-pm-text-secondary)]">
              <th className="px-5 py-2.5 font-bold">
                {column === "query" ? "Query" : "Page"}
              </th>
              <th className="px-3 py-2.5 text-right font-bold">Clicks</th>
              <th className="px-3 py-2.5 text-right font-bold">Impr.</th>
              <th className="px-5 py-2.5 text-right font-bold">Avg pos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className="border-t border-line-soft hover:bg-[#FCFAED]"
              >
                <td
                  className="max-w-[420px] truncate px-5 py-2.5 font-medium text-alloro-navy"
                  title={row.key}
                >
                  {column === "page" ? prettyPath(row.key) : row.key}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-alloro-navy">
                  {fmt(row.clicks)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--color-pm-text-secondary)]">
                  {fmt(row.impressions)}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums text-[color:var(--color-pm-text-secondary)]">
                  {fmtPosition(row.position)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TrendCard({
  title,
  data,
  valueKey,
}: {
  title: string;
  data: Array<Record<string, unknown>>;
  valueKey: string;
}) {
  return (
    <div className="rounded-[14px] border border-line-soft bg-white p-5 shadow-premium">
      <div className="mb-3 font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--color-pm-text-secondary)]">
        {title}
      </div>
      <TrendSparkline data={data} valueKey={valueKey} labelKey="label" height={150} />
    </div>
  );
}

const shellCls =
  "pm-light mx-auto w-full max-w-[960px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10";

export function KeywordsTab() {
  const navigate = useNavigate();
  const [rangeDays, setRangeDays] = useState<number>(90);
  const query = useWebsiteGscPerformance(rangeDays);

  const series = useMemo(
    () =>
      (query.data?.dashboard?.daily ?? []).map((point) => ({
        label: shortDate(point.date),
        clicks: point.clicks,
        impressions: point.impressions,
      })),
    [query.data],
  );

  if (query.isLoading) {
    return (
      <div className={shellCls}>
        <div className="h-[120px] animate-pulse rounded-[14px] bg-neutral-100" />
        <div className="grid gap-5 md:grid-cols-2">
          <div className="h-[220px] animate-pulse rounded-[14px] bg-neutral-100" />
          <div className="h-[220px] animate-pulse rounded-[14px] bg-neutral-100" />
        </div>
      </div>
    );
  }

  // Not connected → send the owner to Integrations to connect GSC.
  if (query.isError || !query.data?.hasIntegration) {
    return (
      <div className={shellCls}>
        <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-line-soft bg-white px-6 py-14 text-center shadow-premium">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF7F2] text-alloro-orange">
            <Search size={22} />
          </div>
          <h2 className="font-display text-[22px] font-medium text-alloro-navy">
            See what people search to find you
          </h2>
          <p className="mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-[color:var(--color-pm-text-secondary)]">
            Connect Google Search Console to track the keywords, clicks, and
            search rankings bringing visitors to your website.
          </p>
          <button
            type="button"
            onClick={() => navigate("/settings/integrations")}
            className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-alloro-navy px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-orange focus:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/40"
          >
            Connect Search Console
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  const dashboard = query.data.dashboard;
  const totals = dashboard?.totals;

  // Connected, but the daily harvest hasn't produced rows yet (fresh property).
  if (!dashboard || dashboard.dataDays === 0) {
    return (
      <div className={shellCls}>
        <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-line-soft bg-white px-6 py-14 text-center shadow-premium">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF7F2] text-alloro-orange">
            <Hourglass size={22} />
          </div>
          <h2 className="font-display text-[22px] font-medium text-alloro-navy">
            Collecting your search data
          </h2>
          <p className="mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-[color:var(--color-pm-text-secondary)]">
            Search Console is connected. Performance data lands within a few days
            of connecting and updates daily — check back soon.
          </p>
        </div>
      </div>
    );
  }

  const rangeLabel =
    dashboard.fromDate && dashboard.toDate
      ? `${shortDate(dashboard.fromDate)} – ${shortDate(dashboard.toDate)}`
      : `Last ${dashboard.dataDays} days`;

  return (
    <div className={shellCls}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[26px] font-medium leading-none tracking-tight text-alloro-navy">
            Search keywords
          </h2>
          <p className="mt-1.5 text-[12px] text-[color:var(--color-pm-text-secondary)]">
            Google Search Console · {rangeLabel}
          </p>
        </div>
        <div className="inline-flex rounded-[10px] border border-line-soft bg-white p-1 shadow-premium">
          {RANGES.map((r) => {
            const active = r.days === rangeDays;
            return (
              <button
                key={r.days}
                type="button"
                onClick={() => setRangeDays(r.days)}
                className={`rounded-[7px] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors focus:outline-none ${
                  active
                    ? "bg-alloro-navy text-white"
                    : "text-slate-500 hover:bg-slate-50 hover:text-alloro-navy"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <StatTile label="Clicks" value={fmt(totals?.clicks ?? 0)} hint="Visits from Google search" />
        <StatTile
          label="Impressions"
          value={fmt(totals?.impressions ?? 0)}
          hint="Times you appeared in search"
        />
        <StatTile
          label="Avg position"
          value={fmtPosition(totals?.position ?? 0)}
          hint="Average search rank"
          infoTip="Your average position in Google results. Lower is better — position 1 is the top."
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <TrendCard title="Clicks · daily" data={series} valueKey="clicks" />
        <TrendCard title="Impressions · daily" data={series} valueKey="impressions" />
      </div>

      <KeywordTable
        title="Top queries"
        caption="What people searched"
        rows={dashboard.topQueries}
        column="query"
      />

      <KeywordTable
        title="Top pages"
        caption="Where they landed"
        rows={dashboard.topPages}
        column="page"
      />

      {dashboard.limitations.length > 0 ? (
        <p className="text-[11px] leading-relaxed text-[color:var(--color-pm-text-secondary)]">
          {dashboard.limitations.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
