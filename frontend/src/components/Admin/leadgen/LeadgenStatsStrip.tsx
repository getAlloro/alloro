/**
 * LeadgenStatsStrip
 *
 * Four-tile headline stats row rendered above the submissions table. Uses
 * `MetricCard` from the shared DesignSystem to match the aesthetic of the
 * dashboard overview (see `DashboardOverview.tsx` for the reference layout).
 *
 * Re-fetches whenever the `from` / `to` filter on LeadgenSubmissions changes
 * — the parent passes those through via the `filters` prop.
 */

import { useEffect, useState } from "react";
import { MetricCard } from "../ui/DesignSystem";
import { getStats } from "../../api/leadgenSubmissions";
import type { LeadgenStats, ListFilters } from "../../types/leadgen";

interface Props {
  filters: Pick<ListFilters, "from" | "to">;
  refreshKey?: number;
}

/**
 * Humanize a millisecond duration into the shortest sensible label.
 *   <1 min       -> "Ns"
 *   <1 hr        -> "Xm Ys"
 *   <1 day       -> "Xh Ym"
 *   otherwise    -> "Xd Yh"
 */
function humanizeMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;

  const totalMin = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (totalMin < 60) return sec > 0 ? `${totalMin}m ${sec}s` : `${totalMin}m`;

  const totalHr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (totalHr < 24) return min > 0 ? `${totalHr}h ${min}m` : `${totalHr}h`;

  const totalDay = Math.floor(totalHr / 24);
  const hr = totalHr % 24;
  return hr > 0 ? `${totalDay}d ${hr}h` : `${totalDay}d`;
}

export default function LeadgenStatsStrip({ filters, refreshKey = 0 }: Props) {
  const [stats, setStats] = useState<LeadgenStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getStats(filters)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load stats";
          setError(msg);
          setStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.from, filters.to, refreshKey]);

  // Degrade gracefully — the admin page stays usable even if the stats
  // endpoint is unreachable (e.g. backend not yet deployed). A thin inline
  // notice matches the existing error treatment for list/funnel errors.
  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Stats unavailable: {error}
      </div>
    );
  }

  const totalSessions = stats?.total_sessions ?? 0;
  const totalConversions = stats?.total_conversions ?? 0;
  const rate = stats?.conversion_rate_pct ?? null;
  const medianMs = stats?.median_time_to_convert_ms ?? null;

  const rateLabel =
    rate === null
      ? loading
        ? "…"
        : "—"
      : `${rate.toFixed(1)}%`;

  const medianLabel = loading && medianMs === null ? "…" : humanizeMs(medianMs);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="Total Sessions"
        value={loading && !stats ? "…" : totalSessions.toLocaleString()}
      />
      <MetricCard
        label="Total Conversions"
        value={loading && !stats ? "…" : totalConversions.toLocaleString()}
      />
      <MetricCard label="Conversion Rate" value={rateLabel} />
      <MetricCard label="Median Time to Convert" value={medianLabel} />
    </div>
  );
}
