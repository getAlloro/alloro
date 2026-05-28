import { BarChart3, Sparkles, type LucideIcon } from "lucide-react";

export type RankingsDashboardView = "overview" | "engage";

export type RankingsDashboardViewTabsProps = {
  activeView: RankingsDashboardView;
  onViewChange: (view: RankingsDashboardView) => void;
};

const VIEW_OPTIONS: Array<{
  key: RankingsDashboardView;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "engage", label: "Reviews & Posts", icon: Sparkles },
];

export function RankingsDashboardViewTabs({
  activeView,
  onViewChange,
}: RankingsDashboardViewTabsProps) {
  return (
    <div className="inline-flex rounded-[12px] border border-line-soft bg-white p-1 shadow-premium">
      {VIEW_OPTIONS.map(({ key, label, icon: Icon }) => {
        const isActive = activeView === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onViewChange(key)}
            className={`inline-flex items-center justify-center gap-2 rounded-[9px] px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-alloro-navy/20 ${
              isActive
                ? "bg-alloro-navy text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-alloro-navy"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
