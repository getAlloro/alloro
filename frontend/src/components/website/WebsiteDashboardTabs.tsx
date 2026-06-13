import {
  LayoutGrid,
  Files,
  Inbox,
  FileText,
  Menu as MenuIcon,
  Search,
  Info,
  type LucideIcon,
} from "lucide-react";
import Tooltip from "../Tooltip";

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
  | "menus"
  | "keywords";

/**
 * One-line "what is this tab" copy surfaced through the trailing (i) tooltip
 * (#20). Replaces the always-on page-vs-post blurb — owners hover to learn
 * what each tab holds. The Pages/Posts lines keep the original clarification.
 */
const TAB_HELP: Record<WebsiteDashboardView, string> = {
  overview: "Overview — traffic, leads & conversion at a glance",
  pages: "Pages — permanent sections (Home, About, Services)",
  posts: "Posts — dated updates like blog articles or news",
  menus: "Menus — the navigation links across your site",
  keywords: "Keywords — what people search to find you on Google",
  submissions: "Submissions — form entries captured from your site",
};

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
    // Order per dashboard-revamp feedback #20: Overview · Pages · Posts ·
    // Menus · Keywords · Submissions. Posts is conditional on hasPosts and
    // slots in right after Pages so the page/post pair sits together.
    { key: "overview", label: "Overview", icon: LayoutGrid },
    { key: "pages", label: "Pages", icon: Files },
    ...(hasPosts
      ? [{ key: "posts" as const, label: "Posts", icon: FileText }]
      : []),
    { key: "menus", label: "Menus", icon: MenuIcon },
    { key: "keywords", label: "Keywords", icon: Search },
    { key: "submissions", label: "Submissions", icon: Inbox },
  ];

  // Tooltip lines for the visible tabs only — drops "Posts" automatically when
  // a site has none, so the (i) never describes a tab that isn't shown.
  const tabHelp = options.map((option) => TAB_HELP[option.key]);

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
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
      <Tooltip message={tabHelp} position="bottom" align="left">
        <button
          type="button"
          aria-label="What each tab means"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-50 hover:text-alloro-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-alloro-navy/20"
        >
          <Info className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}
