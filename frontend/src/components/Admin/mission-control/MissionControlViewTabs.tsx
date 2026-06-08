import { Activity, LayoutGrid } from "lucide-react";

export type MissionControlView = "overview" | "telemetry";

export type MissionControlViewTabsProps = {
  activeView: MissionControlView;
  onChange: (view: MissionControlView) => void;
};

const TABS: Array<{
  value: MissionControlView;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { value: "overview", label: "Overview", icon: LayoutGrid },
  { value: "telemetry", label: "Telemetry", icon: Activity },
];

export function MissionControlViewTabs({
  activeView,
  onChange,
}: MissionControlViewTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeView === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-black uppercase tracking-wider transition-all ${
              isActive
                ? "bg-alloro-navy text-white shadow-sm"
                : "text-gray-500 hover:bg-gray-50 hover:text-alloro-navy"
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
