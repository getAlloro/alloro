import {
  LayoutGrid,
  Files,
  Inbox,
  FileText,
  Menu as MenuIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Website dashboard pill tabs — matches the Local Rankings segmented control
 * (RankingsDashboardViewTabs): dark active pill, light inactive, icon + label.
 * Editor is intentionally NOT a tab; pages are edited via the Pages tab.
 */
export type WebsiteDashboardView =
  | "overview"
  | "pages"
  | "submissions"
  | "posts"
  | "menus";

export type WebsiteDashboardTabsProps = {
  activeView: WebsiteDashboardView;
  hasPosts: boolean;
  onViewChange: (view: WebsiteDashboardView) => void;
};

export function WebsiteDashboardTabs({
  activeView,
  hasPosts,
  onViewChange,
}: WebsiteDashboardTabsProps) {
  const options: Array<{
    key: WebsiteDashboardView;
    label: string;
    icon: LucideIcon;
  }> = [
    { key: "overview", label: "Overview", icon: LayoutGrid },
    { key: "pages", label: "Pages", icon: Files },
    { key: "submissions", label: "Submissions", icon: Inbox },
    ...(hasPosts
      ? [{ key: "posts" as const, label: "Posts", icon: FileText }]
      : []),
    { key: "menus", label: "Menus", icon: MenuIcon },
  ];

  return (
    <div className="inline-flex flex-wrap rounded-[12px] border border-line-soft bg-white p-1 shadow-premium">
      {options.map(({ key, label, icon: Icon }) => {
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
