export function StatBadge({ label, count, color }: { label: string; count: number; color: string }) {
  const colors: Record<string, string> = {
    gray: "bg-gray-100 text-gray-600",
    slate: "bg-amber-50 text-amber-600",
    green: "bg-green-50 text-green-700",
    red: "bg-red-100 text-red-600",
    alloro: "bg-green-100 text-green-700",
  };
  return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${colors[color] || colors.gray}`}>{count} {label}</span>;
}
