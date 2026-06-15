export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    analyzing: { bg: "bg-amber-50", text: "text-amber-600", label: "Analyzing" },
    ready: { bg: "bg-gray-100", text: "text-gray-600", label: "Pending Review" },
    executing: { bg: "bg-blue-50", text: "text-blue-600", label: "Executing" },
    completed: { bg: "bg-green-50", text: "text-green-600", label: "Completed" },
    failed: { bg: "bg-red-50", text: "text-red-600", label: "Failed" },
  };
  const s = map[status] || map.ready;
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}
