import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import {
  LineChart, Line, XAxis, Tooltip, ResponsiveContainer, Area, CartesianGrid,
} from "recharts";
import type { ChartDataResponse } from "../../types/pm";
import { getChartData } from "../../api/pm";
import { NoActivity } from "./EmptyStates";
import { logger } from "../../lib/logger";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatLabel(iso: string): string {
  // iso format: YYYY-MM-DD
  const [, m, d] = iso.split("-");
  const mi = parseInt(m, 10) - 1;
  return `${MONTH_NAMES[mi] ?? ""} ${parseInt(d, 10)}`;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { date?: string } }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  const count = point?.value ?? 0;
  const iso = point?.payload?.date ?? "";
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{
        backgroundColor: "var(--color-pm-bg-tertiary)",
        border: "1px solid var(--color-pm-border)",
        boxShadow: "var(--pm-shadow-elevated)",
      }}
    >
      <p
        className="text-[12px] font-semibold mb-1"
        style={{ color: "var(--color-pm-text-primary)" }}
      >
        {formatLabel(iso)}
      </p>
      <div className="flex items-center gap-1.5 text-[12px]">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#D66853" }} />
        <span style={{ color: "var(--color-pm-text-secondary)" }}>
          {count} completed
        </span>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-full w-full animate-pulse flex items-end gap-1.5 px-2 pb-4">
      {[...Array(14)].map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: `${20 + ((i * 13) % 60)}%`,
            backgroundColor: "var(--color-pm-bg-hover)",
          }}
        />
      ))}
    </div>
  );
}

export function TasksOverTimeChart() {
  const [data, setData] = useState<ChartDataResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chartKey, setChartKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getChartData()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setChartKey((k) => k + 1);
        }
      })
      .catch((err) => logger.error(err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const daily = data?.daily_completions ?? [];
  const total = daily.reduce((s, d) => s + d.count, 0);
  const allZero = daily.length > 0 && total === 0;

  const chartData = daily.map((d) => ({
    ...d,
    label: formatLabel(d.date),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
      className="rounded-xl p-5"
      style={{
        backgroundColor: "var(--color-pm-bg-secondary)",
        boxShadow: "var(--pm-shadow-card)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: "rgba(214,104,83,0.08)" }}
          >
            <Activity
              className="h-5 w-5"
              strokeWidth={1.5}
              style={{ color: "#D66853" }}
            />
          </div>
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.05em]"
            style={{ color: "var(--color-pm-text-secondary)" }}
          >
            Tasks over time
          </span>
        </div>
        <span
          className="text-[11px] font-medium"
          style={{ color: "var(--color-pm-text-muted)" }}
        >
          Last 14 days
        </span>
      </div>

      {/* Summary */}
      {data && !allZero && (
        <div className="flex items-baseline gap-1.5 mb-4">
          <span
            className="text-[24px] font-bold"
            style={{
              color: "var(--color-pm-text-primary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {total}
          </span>
          <span
            className="text-[14px]"
            style={{ color: "var(--color-pm-text-secondary)" }}
          >
            completed
          </span>
        </div>
      )}

      {/* Chart / states */}
      <div style={{ height: 140 }}>
        {isLoading ? (
          <ChartSkeleton />
        ) : allZero ? (
          <NoActivity message="No completions in the last 14 days" />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              key={chartKey}
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
            >
              <defs>
                <linearGradient id="completionsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D66853" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#D66853" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--color-pm-border-subtle)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--color-pm-text-muted)" }}
                dy={8}
                interval={Math.floor(chartData.length / 7)}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: "var(--color-pm-border)", strokeDasharray: "4 4" }}
              />
              <Area
                dataKey="count"
                stroke="none"
                fill="url(#completionsFill)"
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <Line
                dataKey="count"
                type="monotone"
                stroke="#D66853"
                strokeWidth={2}
                dot={{
                  r: 3,
                  fill: "#D66853",
                  stroke: "var(--color-pm-bg-secondary)",
                  strokeWidth: 2,
                }}
                activeDot={{ r: 4 }}
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div
            className="flex items-center justify-center h-full text-[12px]"
            style={{ color: "var(--color-pm-text-muted)" }}
          >
            No data yet
          </div>
        )}
      </div>
    </motion.div>
  );
}
