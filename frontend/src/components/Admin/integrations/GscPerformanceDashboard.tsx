import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
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
  fetchGscPerformance,
  type GscPerformanceDashboard as GscPerformanceData,
} from "../../../api/integrations";
import {
  DimensionTable,
  MetricCard,
} from "./GscPerformanceParts";

type GscPerformanceDashboardProps = {
  projectId: string;
  integrationId: string;
};

type GscTableKey = "queries" | "pages" | "countries" | "devices";

const RANGE_OPTIONS = [
  { label: "28D", days: 28 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "12M", days: 365 },
];

function formatDate(value: string | null): string {
  if (!value) return "--";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const numberFmt = new Intl.NumberFormat("en-US");

function formatGscMetric(
  value: number,
  kind: "number" | "percent" | "position",
) {
  if (kind === "percent") return `${(value * 100).toFixed(1)}%`;
  if (kind === "position") return value > 0 ? value.toFixed(1) : "--";
  return numberFmt.format(value);
}

export function GscPerformanceDashboard({
  projectId,
  integrationId,
}: GscPerformanceDashboardProps) {
  const [rangeDays, setRangeDays] = useState(90);
  const [table, setTable] = useState<GscTableKey>("queries");
  const [data, setData] = useState<GscPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGscPerformance(projectId, integrationId, rangeDays)
      .then((response) => {
        if (!cancelled) setData(response.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load GSC data");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, integrationId, rangeDays]);

  const chartData = useMemo(
    () =>
      (data?.daily ?? []).map((point) => ({
        ...point,
        label: formatDate(point.date),
      })),
    [data],
  );
  const totals = data?.totals;
  const rowsByTable = {
    queries: data?.topQueries ?? [],
    pages: data?.topPages ?? [],
    countries: data?.topCountries ?? [],
    devices: data?.topDevices ?? [],
  };
  const rows = rowsByTable[table];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: 0.04 }}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">GSC Performance</h4>
          <p className="mt-0.5 text-xs text-gray-400">
            Latest stored report date: {formatDate(data?.latestReportDate ?? null)}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.days}
              type="button"
              onClick={() => setRangeDays(option.days)}
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
          Loading Search Console data...
        </div>
      ) : error ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-sm text-red-600">
          <AlertCircle className="mr-2 h-4 w-4" />
          {error}
        </div>
      ) : !data || data.dataDays === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-400">
          No stored GSC data for this property yet.
        </div>
      ) : (
        <div className="space-y-5">
          {data.limitations.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{data.limitations[0]}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <MetricCard label="Total clicks" value={formatGscMetric(totals?.clicks ?? 0, "number")} accent="bg-blue-500" />
            <MetricCard label="Total search appearances" value={formatGscMetric(totals?.impressions ?? 0, "number")} accent="bg-violet-500" />
            <MetricCard label="Average CTR" value={formatGscMetric(totals?.ctr ?? 0, "percent")} accent="bg-emerald-500" />
            <MetricCard label="Average position" value={formatGscMetric(totals?.position ?? 0, "position")} accent="bg-amber-500" />
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#EEF2F7" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} minTickGap={24} />
                <YAxis yAxisId="clicks" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                <YAxis yAxisId="impressions" orientation="right" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} />
                <Tooltip />
                <Line yAxisId="clicks" type="monotone" dataKey="clicks" stroke="#3B82F6" strokeWidth={2.4} dot={false} name="Clicks" />
                <Line yAxisId="impressions" type="monotone" dataKey="impressions" stroke="#7C3AED" strokeWidth={2.4} dot={false} name="Search appearances" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <div className="mb-2 flex gap-2">
              {(["queries", "pages", "countries", "devices"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTable(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    table === key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
            <DimensionTable rows={rows} emptyLabel={`No ${table} in stored GSC data yet`} />
          </div>
        </div>
      )}
    </motion.section>
  );
}
