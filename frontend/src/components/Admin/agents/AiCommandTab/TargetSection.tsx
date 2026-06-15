import type { TargetMode } from "../aiCommandTab.types";

export function TargetSection({ icon, label, mode, onModeChange, children }: {
  icon: React.ReactNode; label: string; mode: TargetMode; onModeChange: (mode: TargetMode) => void; children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${mode === "off" ? "border-gray-100 bg-gray-50/50 opacity-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={mode === "off" ? "text-gray-300" : "text-gray-500"}>{icon}</span>
          <span className={`text-sm font-medium ${mode === "off" ? "text-gray-400" : "text-gray-700"}`}>{label}</span>
          {mode === "all" && <span className="text-[10px] font-medium text-alloro-orange bg-alloro-orange/8 px-1.5 py-0.5 rounded">ALL</span>}
        </div>
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5">
          {(["all", "specific", "off"] as const).map((m) => (
            <button key={m} onClick={() => onModeChange(m)}
              className={`px-2.5 py-1 text-[11px] rounded font-medium transition-all ${mode === m ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>
              {m === "all" ? "All" : m === "specific" ? "Pick" : "Off"}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
