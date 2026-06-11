export type GbpReviewRange = "latest" | "last30" | "all";

export type GbpReviewRangeControlsProps = {
  count: number;
  range: GbpReviewRange;
  onRangeChange: (range: GbpReviewRange) => void;
  /**
   * Days covered by the "last30" range key (label follows). The key name is
   * legacy — the /gbp-manager page widens the window to 60 days.
   */
  recentWindowDays?: number;
};

function reviewCountLabel(count: number): string {
  return `${count} Review${count === 1 ? "" : "s"}`;
}

export function GbpReviewRangeControls({
  count,
  range,
  onRangeChange,
  recentWindowDays = 30,
}: GbpReviewRangeControlsProps) {
  const RANGE_OPTIONS: Array<{ key: GbpReviewRange; label: string }> = [
    { key: "latest", label: "Latest 10" },
    { key: "last30", label: `Last ${recentWindowDays} days` },
    { key: "all", label: "All loaded" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs font-bold text-slate-500">{reviewCountLabel(count)}</span>
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onRangeChange(option.key)}
          className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
            range === option.key
              ? "bg-slate-100 text-alloro-navy ring-1 ring-slate-200"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
