import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import {
  LineChart, Line, XAxis, Tooltip, ResponsiveContainer, Area,
} from "recharts";
import type { PmVelocityData } from "../../types/pm";
import { fetchVelocity } from "../../api/pm";
import { logger } from "../../lib/logger";

const RANGES = ["7d", "4w", "3m"] as const;
type Range = typeof RANGES[number];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const completed = payload.find((p: any) => p.dataKey === "completed")?.value ?? 0;
  const overdue = payload.find((p: any) => p.dataKey === "overdue")?.value ?? 0;

  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "var(--color-pm-bg-tertiary)", border: "1px solid var(--color-pm-border)", boxShadow: "var(--pm-shadow-elevated)" }}>
      <p className="text-[12px] font-semibold mb-1" style={{ color: "var(--color-pm-text-primary)" }}>{label}</p>
      <div className="flex items-center gap-1.5 text-[12px]">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#D66853" }} />
        <span style={{ color: "var(--color-pm-text-secondary)" }}>{completed} completed</span>
      </div>
      <div className="flex items-center gap-1.5 text-[12px]">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#C43333" }} />
        <span style={{ color: "var(--color-pm-text-secondary)" }}>{overdue} overdue</span>
      </div>
    </div>
  );
}

export function VelocityChart() {
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<PmVelocityData | null>(null);
  const [chartKey, setChartKey] = useState(0);

  useEffect(() => {
    fetchVelocity(range).then(setData).catch((err) => logger.error(err));
    setChartKey((k) => k + 1);
  }, [range]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: 0.2 }}
      className="rounded-xl p-5"
      style={{ backgroundColor: "var(--color-pm-bg-secondary)", boxShadow: "var(--pm-shadow-card)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: "rgba(61,139,64,0.08)" }}>
            <TrendingUp className="h-5 w-5" strokeWidth={1.5} style={{ color: "#3D8B40" }} />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--color-pm-text-secondary)" }}>Velocity</span>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="rounded px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150"
              style={{
                backgroundColor: range === r ? "rgba(214,104,83,0.14)" : "transparent",
                color: range === r ? "#D66853" : "var(--color-pm-text-muted)",
              }}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      {data && (
        <div className="flex items-baseline gap-1.5 mb-4">
          <span className="text-[24px] font-bold" style={{ color: "var(--color-pm-text-primary)", fontVariantNumeric: "tabular-nums" }}>{data.completed_total}</span>
          <span className="text-[14px]" style={{ color: "var(--color-pm-text-secondary)" }}>completed</span>
          <span className="text-[14px] mx-1" style={{ color: "var(--color-pm-text-muted)" }}>·</span>
          <span className="text-[24px] font-bold" style={{ color: data.overdue_total > 0 ? "#C43333" : "var(--color-pm-text-muted)", fontVariantNumeric: "tabular-nums" }}>{data.overdue_total}</span>
          <span className="text-[14px]" style={{ color: "var(--color-pm-text-secondary)" }}>overdue</span>
        </div>
      )}

      {/* Chart */}
      <div style={{ height: 120 }}>
        {data && data.data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart key={chartKey} data={data.data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D66853" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#D66853" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "var(--color-pm-text-muted)" }}
                dy={8}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-pm-border)", strokeDasharray: "4 4" }} />
              <Area dataKey="completed" stroke="none" fill="url(#completedFill)" animationDuration={800} />
              <Line
                dataKey="completed"
                type="monotone"
                stroke="#D66853"
                strokeWidth={2}
                dot={{ r: 3, fill: "#D66853", stroke: "var(--color-pm-bg-secondary)", strokeWidth: 2 }}
                activeDot={{ r: 4 }}
                animationDuration={800}
              />
              <Line
                dataKey="overdue"
                type="monotone"
                stroke="rgba(196,51,51,0.5)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={{ r: 2, fill: "rgba(196,51,51,0.5)" }}
                animationDuration={800}
                animationBegin={200}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-[12px]" style={{ color: "var(--color-pm-text-muted)" }}>No data yet</div>
        )}
      </div>
    </motion.div>
  );
}
