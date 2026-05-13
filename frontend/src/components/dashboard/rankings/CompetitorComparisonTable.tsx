import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpDown } from "lucide-react";
import {
  formatComparisonValue,
  formatMapsEstimate,
  type ComparisonRow,
  type ComparisonSortKey,
} from "./competitorComparison";

export type CompetitorComparisonTableProps = {
  rows: ComparisonRow[];
  sortKey: ComparisonSortKey;
  onSort: (sortKey: ComparisonSortKey) => void;
};

const TABLE_COLUMNS: Array<{
  heading: string;
  sortKey?: ComparisonSortKey;
}> = [
  { heading: "Practice" },
  { heading: "Maps", sortKey: "mapsPosition" },
  { heading: "Reviews", sortKey: "reviewCount" },
  { heading: "Velocity", sortKey: "reviewVelocity" },
  { heading: "Rating", sortKey: "starRating" },
  { heading: "Health", sortKey: "practiceHealth" },
];

export function CompetitorComparisonTable({
  rows,
  sortKey,
  onSort,
}: CompetitorComparisonTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[860px] w-full border-collapse">
        <thead>
          <tr className="border-b border-line-soft bg-alloro-navy/[0.025]">
            {TABLE_COLUMNS.map((column) => (
              <ComparisonHeaderCell
                key={column.heading}
                heading={column.heading}
                sortKey={column.sortKey}
                activeSortKey={sortKey}
                onSort={onSort}
              />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          <AnimatePresence initial={false}>
            {rows.map((row, index) => (
              <ComparisonTableRow key={row.id} row={row} index={index} />
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}

function ComparisonHeaderCell({
  heading,
  sortKey,
  activeSortKey,
  onSort,
}: {
  heading: string;
  sortKey?: ComparisonSortKey;
  activeSortKey: ComparisonSortKey;
  onSort: (sortKey: ComparisonSortKey) => void;
}) {
  const isActive = sortKey === activeSortKey;

  return (
    <th className="px-4 py-3 text-left">
      {sortKey ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={`inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] transition-colors focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 ${
            isActive
              ? "text-alloro-orange"
              : "text-alloro-navy/40 hover:text-alloro-navy"
          }`}
        >
          {heading}
          <ArrowUpDown size={11} />
        </button>
      ) : (
        <span className="font-mono-display text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-navy/40">
          {heading}
        </span>
      )}
    </th>
  );
}

function ComparisonTableRow({
  row,
  index,
}: {
  row: ComparisonRow;
  index: number;
}) {
  return (
    <motion.tr
      layout
      className={row.isYou ? "bg-alloro-orange/[0.055]" : "bg-white"}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ delay: Math.min(index * 0.025, 0.18), duration: 0.18 }}
    >
      <td className="px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-black text-alloro-navy">
            {row.name}
          </span>
          {row.isYou && (
            <span className="rounded-md bg-alloro-orange px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white">
              You
            </span>
          )}
        </div>
        {(row.address || row.category) && (
          <div
            className="mt-0.5 max-w-[360px] truncate text-[11px] font-semibold text-alloro-navy/40"
            title={row.address || row.category || undefined}
          >
            {row.address || row.category}
          </div>
        )}
      </td>
      <MetricCell value={formatMapsEstimate(row)} />
      <MetricCell value={formatComparisonValue(row, "reviewCount")} />
      <MetricCell value={formatComparisonValue(row, "reviewVelocity")} />
      <MetricCell value={formatComparisonValue(row, "starRating")} />
      <MetricCell value={formatComparisonValue(row, "practiceHealth")} />
    </motion.tr>
  );
}

function MetricCell({ value }: { value: string }) {
  return (
    <td className="px-4 py-3.5 text-[13px] font-bold tabular-nums text-alloro-navy/75">
      {value}
    </td>
  );
}
