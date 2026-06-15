export function Delta({
  delta,
  lowerIsBetter = false,
  suffix = "",
}: {
  delta: number | null | undefined;
  lowerIsBetter?: boolean;
  suffix?: string;
}) {
  if (delta === 0 || delta === null || delta === undefined) {
    return (
      <span className="text-[10px] font-bold text-alloro-navy/30 tabular-nums">—</span>
    );
  }
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const arrow = improved ? "▲" : "▼";
  const color = improved ? "#22c55e" : "#ef4444";
  const bg = improved ? "var(--color-success-soft)" : "var(--color-danger-soft)";
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums"
      style={{ color, background: bg }}
    >
      <span style={{ fontSize: 9 }}>{arrow}</span>
      {Math.abs(delta)}
      {suffix}
    </span>
  );
}
