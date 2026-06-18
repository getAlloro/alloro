import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  getSkillAnalytics,
  type SkillAnalytics,
} from "../../../../api/minds";

export function AnalyticsSection({
  mindId,
  skillId,
  initial,
}: {
  mindId: string;
  skillId: string;
  initial: SkillAnalytics | null;
}) {
  const [data, setData] = useState<SkillAnalytics | null>(initial);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (!initial) {
      (async () => {
        setLoading(true);
        const a = await getSkillAnalytics(mindId, skillId);
        setData(a);
        setLoading(false);
      })();
    }
  }, [mindId, skillId, initial]);

  if (loading || !data) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Fill 7-day chart with zeros for missing days
  const chartData = (() => {
    const map = new Map(data.dailyCounts.map((d) => [d.date, d.count]));
    const days: { date: string; count: number; label: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });
      days.push({ date: key, count: map.get(key) || 0, label: dayLabel });
    }
    return days;
  })();

  const maxCount = Math.max(...chartData.map((d) => d.count), 1);

  return (
    <div>
      {/* Big numbers */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl bg-alloro-navy p-6 text-center">
          <p className="text-3xl font-bold text-white">{data.totalCalls}</p>
          <p className="text-xs text-gray-300 mt-1 font-medium uppercase tracking-wider">
            Total Work Points
          </p>
        </div>
        <div className="rounded-2xl bg-alloro-orange p-6 text-center">
          <p className="text-3xl font-bold text-white">{data.callsToday}</p>
          <p className="text-xs text-orange-100 mt-1 font-medium uppercase tracking-wider">
            Work Points Today
          </p>
        </div>
      </div>

      {/* 7-day chart */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-4">
          7-Day Trend
        </h4>
        <div className="flex items-end gap-2 h-32">
          {chartData.map((d) => (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-[10px] font-medium text-gray-500">
                {d.count > 0 ? d.count : ""}
              </span>
              <div
                className="w-full rounded-t-lg bg-alloro-orange/80 transition-all duration-300"
                style={{
                  height: `${Math.max((d.count / maxCount) * 100, 4)}%`,
                  minHeight: d.count > 0 ? "8px" : "4px",
                  opacity: d.count > 0 ? 1 : 0.2,
                }}
              />
              <span className="text-[10px] text-gray-400">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
