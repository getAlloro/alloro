import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Globe,
  Clock,
  CheckCircle,
  FileText,
  Loader2,
  Star,
  Code,
  Layout,
  Image,
  Inbox,
  Newspaper,
  Menu,
  ArrowRightLeft,
  Archive,
  Wrench,
  DollarSign,
  Plug,
} from "lucide-react";
import type { WebsiteProjectWithPages } from "../../../api/websites";
import { AdminPageHeader } from "../../../components/ui/DesignSystem";
import {
  WEBSITE_DETAIL_TABS,
  formatDate,
  getStatusStyles,
  formatStatus,
  isProcessingStatus,
  type WebsiteDetailTab,
} from "../websiteDetail.utils";

/**
 * Header block for WebsiteDetail.
 * Moved verbatim from WebsiteDetail's return body — identical JSX, classNames,
 * strings, and gating. The header-action node clusters and locals the markup
 * read are passed through as props. The tab bar lives in WebsiteDetailTabBar
 * so the parent's Status Card keeps its original render position between them.
 */
export function WebsiteDetailHeader({
  embedded,
  backPath,
  backLabel,
  website,
  gbpData,
  headerActionPills,
  headerActionIcons,
}: {
  embedded: boolean;
  backPath: string;
  backLabel: string;
  website: WebsiteProjectWithPages;
  gbpData: Record<string, string | number | null> | null;
  headerActionPills: ReactNode;
  headerActionIcons: ReactNode;
}) {
  return (
    <>
      {/* Back link */}
      {!embedded && (
        <Link
          to={backPath}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}

      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {headerActionPills}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {headerActionIcons}
          </div>
        </div>
      ) : (
        <AdminPageHeader
          icon={<Globe className="w-6 h-6" />}
          title={
            website.display_name ||
            (gbpData?.name ? String(gbpData.name) : website.generated_hostname)
          }
          description={
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                <Globe className="h-3 w-3" />
                {website.generated_hostname}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                <Clock className="h-3 w-3" />
                Created {formatDate(website.created_at)}
              </span>
              {website.updated_at !== website.created_at && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                  <Clock className="h-3 w-3" />
                  Updated {formatDate(website.updated_at)}
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyles(website.status)}`}
              >
                {website.status === "LIVE" && (
                  <CheckCircle className="h-3 w-3" />
                )}
                {isProcessingStatus(website.status) && (
                  <Loader2 className="h-3 w-3 animate-spin" />
                )}
                {formatStatus(website.status)}
              </span>
            </div>
          }
          actionButtons={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {headerActionPills}
              {headerActionIcons}
            </div>
          }
        />
      )}
    </>
  );
}

/**
 * Tab bar for WebsiteDetail.
 * Moved verbatim from WebsiteDetail's return body — identical JSX, classNames,
 * animation props, strings, and gating.
 */
export function WebsiteDetailTabBar({
  embedded,
  hideTabBar,
  detailTab,
  setDetailTab,
}: {
  embedded: boolean;
  hideTabBar: boolean;
  detailTab: WebsiteDetailTab;
  setDetailTab: (tab: WebsiteDetailTab) => void;
}) {
  return (
    <>
      {/* Tab bar: Pages | Layouts | Code Manager | Media | Form Submissions */}
      {!hideTabBar && (
        <div
          className={
            embedded
              ? "mb-4 flex items-center gap-7 overflow-x-auto border-b border-gray-200 px-1"
              : "flex items-stretch gap-1 p-1.5 bg-gray-100 rounded-xl mb-4"
          }
        >
          {WEBSITE_DETAIL_TABS.map((tab) => {
          const isActive = detailTab === tab;
          const tabConfig: Record<string, { label: string; icon: React.ReactNode }> = {
            "pages": { label: "Pages", icon: <FileText className="w-3.5 h-3.5" /> },
            "layouts": { label: "Layouts", icon: <Layout className="w-3.5 h-3.5" /> },
            "code-manager": { label: "Code Manager", icon: <Code className="w-3.5 h-3.5" /> },
            "media": { label: "Media", icon: <Image className="w-3.5 h-3.5" /> },
            "form-submissions": { label: "Forms", icon: <Inbox className="w-3.5 h-3.5" /> },
            "posts": { label: "Posts", icon: <Newspaper className="w-3.5 h-3.5" /> },
            "menus": { label: "Menus", icon: <Menu className="w-3.5 h-3.5" /> },
            "reviews": { label: "Reviews", icon: <Star className="w-3.5 h-3.5" /> },
            "redirects": { label: "Redirects", icon: <ArrowRightLeft className="w-3.5 h-3.5" /> },
            "integrations": { label: "Integrations", icon: <Plug className="w-3.5 h-3.5" /> },
            "backups": { label: "Backups", icon: <Archive className="w-3.5 h-3.5" /> },
            "advanced-tools": { label: "Advanced Tools", icon: <Wrench className="w-3.5 h-3.5" /> },
            "costs": { label: "Costs", icon: <DollarSign className="w-3.5 h-3.5" /> },
          };
          const config = tabConfig[tab] || { label: tab, icon: null };
          return (
            <motion.button
              key={tab}
              onClick={() => setDetailTab(tab)}
              className={
                embedded
                  ? `group relative flex shrink-0 items-center gap-2 pb-3 pt-1 text-sm font-semibold transition-colors ${
                      isActive
                        ? "text-gray-900"
                        : "text-gray-500 hover:text-gray-700"
                    }`
                  : `group relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "text-gray-900"
                        : "text-gray-500 hover:text-gray-700"
                    }`
              }
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isActive && !embedded && (
                <motion.div
                  className="absolute inset-0 bg-white rounded-lg shadow-sm"
                  layoutId="websiteDetailTab"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              {isActive && embedded && (
                <motion.span
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-alloro-orange"
                  layoutId="websiteDetailEmbeddedTab"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {config.icon}
                {config.label}
              </span>
            </motion.button>
          );
        })}
        </div>
      )}
    </>
  );
}
