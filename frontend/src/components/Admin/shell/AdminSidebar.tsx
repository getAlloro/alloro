import type { ComponentType } from "react";
import { useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import {
  CheckSquare,
  Cpu,
  LineChart,
  FileText,
  Database,
  Bot,
  Brain,
  TrendingUp,
  Briefcase,
  Globe,
  FileCode,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Clock,
  Inbox,
  Mail,
  Radar,
  UserCheck,
  Blocks,
} from "lucide-react";
import { useSidebar } from "./SidebarContext";

export type AdminNavKey =
  | "mission-control"
  | "apps"
  | "action-items"
  | "agent-outputs"
  | "ai-pms-automation"
  | "ai-data-insights"
  | "practice-ranking"
  | "minds"
  | "leadgen-submissions"
  | "app-logs"
  | "email-logs"
  | "organization-management"
  | "websites"
  | "templates"
  | "schedules"
  | "settings";

interface NavItem {
  key: AdminNavKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const AGENTS_GROUP_ITEMS: NavItem[] = [
  { key: "agent-outputs", label: "Agent Outputs", icon: Database },
  { key: "ai-pms-automation", label: "AI PMS Automation", icon: Cpu },
  { key: "ai-data-insights", label: "Agent Enhancements", icon: LineChart },
  { key: "practice-ranking", label: "Practice Ranking", icon: TrendingUp },
  { key: "minds", label: "Minds", icon: Brain },
];

const LEADGEN_ITEMS: NavItem[] = [
  { key: "leadgen-submissions", label: "Leadgen Submissions", icon: Inbox },
];

const DONE_FOR_YOU_ITEMS: NavItem[] = [
  { key: "websites", label: "Websites", icon: Globe },
  { key: "templates", label: "Templates", icon: FileCode },
];

const TOP_ITEMS: NavItem[] = [
  { key: "mission-control", label: "Mission Control", icon: Radar },
  { key: "apps", label: "Apps", icon: Blocks },
  { key: "action-items", label: "Action Items Hub", icon: CheckSquare },
];

const BOTTOM_ITEMS: NavItem[] = [
  { key: "app-logs", label: "App Logs", icon: FileText },
  { key: "email-logs", label: "Email Logs", icon: Mail },
  { key: "schedules", label: "Schedules", icon: Clock },
  { key: "settings", label: "Settings", icon: Settings },
];

interface AdminSidebarProps {
  topOffset?: string;
}

export function AdminSidebar({ topOffset }: AdminSidebarProps = {}) {
  const location = useLocation();
  const { collapsed, toggleCollapsed } = useSidebar();
  const [hoveredItem, setHoveredItem] = useState<AdminNavKey | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const itemRefs = useRef<Map<AdminNavKey, HTMLDivElement>>(new Map());

  const isActivePath = (key: AdminNavKey) => {
    const pathParts = location.pathname.split("/");
    return pathParts.includes(key);
  };

  const handleMouseEnter = (key: AdminNavKey, event: React.MouseEvent<HTMLDivElement>) => {
    if (!collapsed) return;

    const linkElement = event.currentTarget.querySelector('a');
    if (!linkElement) return;

    const rect = linkElement.getBoundingClientRect();
    setTooltipPosition({
      top: rect.top + rect.height / 2 - 15,
      left: rect.right + 15,
    });
    setHoveredItem(key);
  };

  const handleMouseLeave = () => {
    setHoveredItem(null);
    setTooltipPosition(null);
  };

  const renderNavLink = (item: NavItem, indented = false) => {
    const isActive = isActivePath(item.key);

    return (
      <div
        key={item.key}
        ref={(el) => {
          if (el) itemRefs.current.set(item.key, el);
          else itemRefs.current.delete(item.key);
        }}
        onMouseEnter={(e) => handleMouseEnter(item.key, e)}
        onMouseLeave={handleMouseLeave}
      >
        <Link
          to={`/admin/${item.key}`}
          className={`flex w-full items-center rounded-xl text-left text-sm font-semibold transition-all ${
            collapsed ? "justify-center px-1.5 py-1.5" : `py-2.5 ${indented ? "gap-3 pl-8 pr-3" : "gap-3 px-3"}`
          } ${
            isActive
              ? "bg-alloro-orange/10 text-alloro-orange border border-alloro-orange/20"
              : "text-gray-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          <item.icon
            className={`shrink-0 ${collapsed ? "h-4.5 w-4.5" : "h-4 w-4"} ${isActive ? "text-alloro-orange" : "text-gray-400"}`}
          />
          {!collapsed && <span>{item.label}</span>}
        </Link>

        {/* Tooltip rendered via portal */}
        {collapsed && hoveredItem === item.key && tooltipPosition && createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, x: -10, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed z-[9999] pointer-events-none"
              style={{
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                transform: 'translateY(-50%)',
              }}
            >
              <div className="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap shadow-lg">
                {item.label}
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
      </div>
    );
  };

  return (
    <motion.aside
      initial={false}
      animate={{
        width: collapsed ? 56 : 288,
        height: collapsed ? "auto" : `calc(100vh - ${topOffset || "4rem"})`,
      }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 z-40 flex flex-col p-2"
      style={{
        top: collapsed ? "50%" : (topOffset || "4rem"),
        transform: collapsed ? "translateY(-50%)" : undefined,
      }}
    >
      <div className="flex flex-col h-full bg-[#212D40] rounded-2xl border border-gray-700 shadow-lg overflow-hidden admin-sidebar-scroll">
        <nav className={`space-y-0.5 overflow-y-auto admin-sidebar-scroll ${
          collapsed ? "px-1.5 py-2" : "flex-1 space-y-1 px-2 py-4"
        }`}>
          {/* Top items — always visible */}
          {TOP_ITEMS.map((item) => renderNavLink(item))}

          {/* Agents Group */}
          <div className={collapsed ? "pt-1" : "pt-4"}>
            {!collapsed ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                <Bot className="h-3.5 w-3.5" />
                <span>Agents</span>
              </div>
            ) : (
              <div className="flex justify-center py-1">
                <div className="w-5 border-t border-gray-600/50" />
              </div>
            )}
            <div className={`${collapsed ? "space-y-0.5 mt-0.5" : "space-y-1 mt-1"}`}>
              {AGENTS_GROUP_ITEMS.map((item) => renderNavLink(item, !collapsed))}
            </div>
          </div>

          {/* Leadgen Group */}
          <div className={collapsed ? "pt-1" : "pt-4"}>
            {!collapsed ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                <UserCheck className="h-3.5 w-3.5" />
                <span>Leadgen</span>
              </div>
            ) : (
              <div className="flex justify-center py-1">
                <div className="w-5 border-t border-gray-600/50" />
              </div>
            )}
            <div className={`${collapsed ? "space-y-0.5 mt-0.5" : "space-y-1 mt-1"}`}>
              {LEADGEN_ITEMS.map((item) => renderNavLink(item, !collapsed))}
            </div>
          </div>

          {/* Done For You Group */}
          <div className={collapsed ? "pt-1" : "pt-4"}>
            {!collapsed ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                <Briefcase className="h-3.5 w-3.5" />
                <span>Done For You</span>
              </div>
            ) : (
              <div className="flex justify-center py-1">
                <div className="w-5 border-t border-gray-600/50" />
              </div>
            )}
            <div className={`${collapsed ? "space-y-0.5 mt-0.5" : "space-y-1 mt-1"}`}>
              {DONE_FOR_YOU_ITEMS.map((item) => renderNavLink(item, !collapsed))}
            </div>
          </div>

          {/* Bottom items */}
          <div className={`${collapsed ? "pt-1 space-y-0.5" : "pt-4 space-y-1"}`}>
            {BOTTOM_ITEMS.map((item) => renderNavLink(item))}
          </div>
        </nav>

        {/* Footer with collapse toggle */}
        <div className={`border-t border-gray-700 bg-[#1a2433] ${collapsed ? "px-1.5 py-1.5" : "px-3 py-3"}`}>
          <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
            {!collapsed && (
              <p className="text-xs text-gray-500 font-medium pl-1">Admin Panel v1.0</p>
            )}
            <button
              onClick={toggleCollapsed}
              className={`rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/10 transition-colors ${
                collapsed ? "p-1" : "p-1.5"
              }`}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4.5 w-4.5" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}
