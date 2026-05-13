import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchRybbitPerformance,
  type RybbitDashboard,
  type RybbitRawRow,
} from "../../../api/integrations";
import { MetricCard } from "./GscPerformanceParts";

type RybbitPerformanceDashboardProps = {
  projectId: string;
  integrationId: string;
};

const RANGE_OPTIONS = [
  { label: "28D", days: 28 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "12M", days: 365 },
];

const ROWS_PAGE_SIZE = 10;
const numberFmt = new Intl.NumberFormat("en-US");

function formatDate(value: string | null): string {
  if (!value) return "--";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatNumber(value: number): string {
  return numberFmt.format(Math.round(value));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "--";
  if (value < 60) return `${Math.round(value)}s`;
  return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
}

function RawRowsTable({ rows }: { rows: RybbitRawRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        No stored daily rows for this Rybbit site yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase text-gray-400">
            <th className="py-2 pr-3">Report date</th>
            <th className="px-3 py-2 text-right">Sessions</th>
            <th className="px-3 py-2 text-right">Pageviews</th>
            <th className="px-3 py-2 text-right">Users</th>
            <th className="px-3 py-2 text-right">Bounce</th>
            <th className="py-2 pl-3 text-right">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id} className="text-gray-700">
              <td className="py-2 pr-3 font-medium text-gray-900">
                {formatDate(row.date)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatNumber(row.sessions)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatNumber(row.pageviews)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatNumber(row.users)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatPercent(row.bounceRate)}
              </td>
              <td className="py-2 pl-3 text-right tabular-nums">
                {formatDuration(row.sessionDuration)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RybbitPerformanceDashboard({
  projectId,
  integrationId,
}: RybbitPerformanceDashboardProps) {
  const [rangeDays, setRangeDays] = useState(90);
  const [rowsOffset, setRowsOffset] = useState(0);
  const [data, setData] = useState<RybbitDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchRybbitPerformance(projectId, integrationId, {
      rangeDays,
      limit: ROWS_PAGE_SIZE,
      offset: rowsOffset,
    })
      .then((response) => {
        if (!cancelled) setData(response.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Rybbit data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, integrationId, rangeDays, rowsOffset]);

  const chartData = useMemo(
    () =>
      (data?.daily ?? []).map((point) => ({
        ...point,
        label: formatDate(point.date),
      })),
    [data],
  );
  const totals = data?.totals;
  const currentPage = Math.floor(rowsOffset / ROWS_PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil((data?.rowsTotal ?? 0) / ROWS_PAGE_SIZE));

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.04 }}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Rybbit Analytics</h4>
          <p className="mt-0.5 text-xs text-gray-400">
            Latest stored report date: {formatDate(data?.latestReportDate ?? null)}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.days}
              type="button"
              onClick={() => {
                setRangeDays(option.days);
                setRowsOffset(0);
              }}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                rangeDays === option.days
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading Rybbit analytics...
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-sm text-red-600">
          <AlertCircle className="mr-2 h-4 w-4" />
          {error}
        </div>
      ) : !data || data.dataDays === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-400">
          No stored Rybbit analytics for this site yet.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <MetricCard label="Sessions" value={formatNumber(totals?.sessions ?? 0)} accent="bg-purple-500" />
            <MetricCard label="Pageviews" value={formatNumber(totals?.pageviews ?? 0)} accent="bg-blue-500" />
            <MetricCard label="Users" value={formatNumber(totals?.users ?? 0)} accent="bg-emerald-500" />
            <MetricCard label="Bounce rate" value={formatPercent(totals?.bounceRate ?? 0)} accent="bg-amber-500" />
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#EEF2F7" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} minTickGap={24} />
                <YAxis yAxisId="sessions" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                <YAxis yAxisId="pageviews" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                <Tooltip />
                <Line yAxisId="sessions" type="monotone" dataKey="sessions" stroke="#8B5CF6" strokeWidth={2.4} dot={false} name="Sessions" />
                <Line yAxisId="pageviews" type="monotone" dataKey="pageviews" stroke="#3B82F6" strokeWidth={2.4} dot={false} name="Pageviews" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Daily rows
              </h5>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <button
                  type="button"
                  onClick={() => setRowsOffset(Math.max(0, rowsOffset - ROWS_PAGE_SIZE))}
                  disabled={rowsOffset === 0}
                  className="rounded-md border border-gray-200 p-1 text-gray-500 transition hover:bg-gray-50 disabled:opacity-40"
                  aria-label="Previous Rybbit rows page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                Page {currentPage} of {totalPages}
                <button
                  type="button"
                  onClick={() => setRowsOffset(rowsOffset + ROWS_PAGE_SIZE)}
                  disabled={currentPage >= totalPages}
                  className="rounded-md border border-gray-200 p-1 text-gray-500 transition hover:bg-gray-50 disabled:opacity-40"
                  aria-label="Next Rybbit rows page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <RawRowsTable rows={data.rows} />
          </div>
        </div>
      )}
    </motion.section>
  );
}
