import type { GscDimensionRow } from "../../../api/integrations";

const numberFmt = new Intl.NumberFormat("en-US");

function formatGscMetric(
  value: number,
  kind: "number" | "percent" | "position",
) {
  if (kind === "percent") return `${(value * 100).toFixed(1)}%`;
  if (kind === "position") return value > 0 ? value.toFixed(1) : "--";
  return numberFmt.format(value);
}

export function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-gray-400">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
        {value}
      </div>
    </div>
  );
}

export function DimensionTable({
  rows,
  emptyLabel,
}: {
  rows: GscDimensionRow[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">{emptyLabel}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase text-gray-400">
            <th className="py-2 pr-3">Item</th>
            <th className="px-3 py-2 text-right">Clicks</th>
            <th className="px-3 py-2 text-right">Search appearances</th>
            <th className="px-3 py-2 text-right">CTR</th>
            <th className="py-2 pl-3 text-right">Position</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.key} className="text-gray-700">
              <td className="max-w-[520px] truncate py-2 pr-3 font-medium text-gray-900">
                {row.key}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatGscMetric(row.clicks, "number")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatGscMetric(row.impressions, "number")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatGscMetric(row.ctr, "percent")}
              </td>
              <td className="py-2 pl-3 text-right tabular-nums">
                {formatGscMetric(row.position, "position")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
