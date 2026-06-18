import type { SourceComparisonRow, SourceMoveStatus } from "./compareMonths.utils";
import { PmsEyebrow } from "./primitives";

/**
 * CompareSourceList — per-source referral comparison between two months.
 * Rows arrive most-changed first; the list is capped with a "+N more" footer.
 */

const STATUS_STYLE: Record<SourceMoveStatus, { label: string; className: string }> = {
  up: { label: "Up", className: "text-emerald-600" },
  down: { label: "Down", className: "text-red-600" },
  new: { label: "New", className: "text-emerald-600" },
  gone: { label: "Gone", className: "text-red-500" },
  same: { label: "Flat", className: "text-ink-muted" },
};

const MAX_VISIBLE = 8;

function SourceRow({ row }: { row: SourceComparisonRow }) {
  const status = STATUS_STYLE[row.status];
  return (
    <div className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.7fr] items-center gap-2 px-5 py-3">
      <span className="truncate text-sm font-medium text-alloro-navy" title={row.name}>
        {row.name}
      </span>
      <span className="text-right text-sm tabular-nums text-alloro-navy">
        {row.referralsA}
      </span>
      <span className="text-right text-sm tabular-nums text-alloro-navy/70">
        {row.referralsB}
      </span>
      <span className={`text-right text-xs font-semibold ${status.className}`}>
        {status.label}
      </span>
    </div>
  );
}

export function CompareSourceList({
  rows,
  labelA,
  labelB,
}: {
  rows: SourceComparisonRow[];
  labelA: string;
  labelB: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-[14px] border border-line-soft bg-white p-5 shadow-premium">
        <PmsEyebrow>Source comparison</PmsEyebrow>
        <p className="mt-2 text-sm text-ink-muted">
          No per-source breakdown is available for these two months.
        </p>
      </div>
    );
  }

  const visible = rows.slice(0, MAX_VISIBLE);
  const remaining = rows.length - visible.length;

  return (
    <div className="rounded-[14px] border border-line-soft bg-white shadow-premium">
      <div className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.7fr] items-center gap-2 border-b border-line-soft px-5 py-3">
        <PmsEyebrow>Source</PmsEyebrow>
        <PmsEyebrow className="text-right">{labelA}</PmsEyebrow>
        <PmsEyebrow className="text-right">{labelB}</PmsEyebrow>
        <PmsEyebrow className="text-right">Move</PmsEyebrow>
      </div>
      <div className="divide-y divide-line-soft">
        {visible.map((row) => (
          <SourceRow key={row.name} row={row} />
        ))}
      </div>
      {remaining > 0 && (
        <p className="px-5 py-3 text-xs text-ink-muted">
          +{remaining} more source{remaining === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}
