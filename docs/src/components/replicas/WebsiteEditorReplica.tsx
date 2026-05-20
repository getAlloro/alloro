/**
 * WebsiteEditorReplica — visual replica of the DFYWebsite page editor.
 *
 * Source of truth: frontend/src/pages/DFYWebsite.tsx
 *
 * Interactive: top-bar tabs switch between Editor / Submissions / Posts / Menus
 * views; viewport toggle switches desktop / mobile preview. Sub-views faithfully
 * mirror the real 2-column layouts (sidebar + main content).
 */
import { useEffect, useState } from "react";
import {
  Pencil,
  Inbox,
  FileText,
  Menu as MenuIcon,
  Monitor,
  Smartphone,
  Link as LinkIcon,
  ExternalLink,
  ChevronDown,
  Undo2,
  Redo2,
  Save,
  Mail,
  MailOpen,
  SlidersHorizontal,
  CheckCircle2,
  ShieldAlert,
  Plus,
  Tag,
  FolderTree,
  Trash2,
  GripVertical,
  CornerDownRight,
} from "lucide-react";
import { clsx } from "clsx";
import type { ReplicaProps } from "../../types/docs";
import { DashboardLayout } from "./DashboardLayout";
import { HotspotZone } from "../HotspotZone";

type ViewTab = "editor" | "submissions" | "posts" | "menus";

const tabs: { key: ViewTab; icon: typeof Pencil; label: string }[] = [
  { key: "editor", icon: Pencil, label: "Editor" },
  { key: "submissions", icon: Inbox, label: "Submissions" },
  { key: "posts", icon: FileText, label: "Posts" },
  { key: "menus", icon: MenuIcon, label: "Menus" },
];

/* ── Fixture data ───────────────────────────────────────────── */

const formCatalog = [
  { name: "Contact Form", formKey: "contact", submissions: 3, unread: 1, lastSeen: "2 days ago", isCustom: false },
  { name: "Appointment Request", formKey: "appointment", submissions: 12, unread: 0, lastSeen: "1 day ago", isCustom: false },
  { name: "Emergency Contact", formKey: "emergency-contact", submissions: 1, unread: 1, lastSeen: "3h ago", isCustom: true },
];

const contactSubmissions = [
  { id: "1", isRead: false, isFlagged: false, formName: "Contact Form", preview: "Hi, I'd like to schedule a cleaning . sarah.m@email.com", time: "3h ago" },
  { id: "2", isRead: true, isFlagged: false, formName: "Contact Form", preview: "Can you let me know about holiday hours? . james.r@email.com", time: "2 days" },
  { id: "3", isRead: true, isFlagged: true, formName: "Contact Form", preview: "Buy cheap products online!! . spam@example.net", time: "4 days" },
];

const postTypes = [
  { name: "Blog Posts", slug: "blog", count: 3 },
  { name: "Services", slug: "services", count: 6 },
  { name: "Team Members", slug: "team", count: 4 },
];

const blogPosts = [
  { id: "1", title: "5 Tips for a Healthy Smile", slug: "/blog/5-tips-healthy-smile", status: "published" as const, categories: ["Oral Health"], tags: ["tips", "hygiene"], seoScore: 87 },
  { id: "2", title: "What to Expect at Your First Visit", slug: "/blog/first-visit", status: "published" as const, categories: ["Patient Info"], tags: ["new patients"], seoScore: 92 },
  { id: "3", title: "Summer Hours Announcement", slug: "/blog/summer-hours", status: "draft" as const, categories: ["News"], tags: ["hours"], seoScore: 45 },
];

const menusList = [
  { name: "Main Navigation", slug: "main-nav", count: 4 },
  { name: "Footer Links", slug: "footer", count: 5 },
];

const mainNavItems = [
  { id: "1", label: "Home", url: "/", target: "_self" as const, depth: 0 },
  { id: "2", label: "Services", url: "/services", target: "_self" as const, depth: 0 },
  { id: "3", label: "General Dentistry", url: "/services/general", target: "_self" as const, depth: 1 },
  { id: "4", label: "Cosmetic", url: "/services/cosmetic", target: "_self" as const, depth: 1 },
  { id: "5", label: "About Us", url: "/about", target: "_self" as const, depth: 0 },
  { id: "6", label: "Contact", url: "/contact", target: "_blank" as const, depth: 0 },
];

/* ── Hotspot → tab mapping (for auto-switching on step click) ── */

const hotspotTab: Record<string, ViewTab> = {
  "view-tabs": "editor",
  "preview-frame": "editor",
  "editor-sidebar": "editor",
  "toolbar-actions": "editor",
  "submissions-forms": "submissions",
  "submissions-list": "submissions",
  "posts-types": "posts",
  "posts-list": "posts",
  "menus-list": "menus",
  "menus-items": "menus",
};

/* ── Component ──────────────────────────────────────────────── */

export function WebsiteEditorReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  const [activeView, setActiveView] = useState<ViewTab>("editor");
  const [viewportMode, setViewportMode] = useState<"desktop" | "mobile">("desktop");
  const [activeFormIdx, setActiveFormIdx] = useState(0);
  const [activePostTypeIdx, setActivePostTypeIdx] = useState(0);
  const [activeMenuIdx, setActiveMenuIdx] = useState(0);

  // Auto-switch tab when the user clicks a step whose hotspot lives on another tab.
  useEffect(() => {
    if (activeHotspotId) {
      const tab = hotspotTab[activeHotspotId];
      if (tab && tab !== activeView) setActiveView(tab);
    }
  }, [activeHotspotId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safe: state is initialised to 0 and arrays are non-empty constants.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const activeForm = formCatalog[activeFormIdx]!;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const activeMenu = menusList[activeMenuIdx]!;

  return (
    <DashboardLayout
      activeItem="website"
      contentClassName="flex flex-col !p-0"
    >
      {/* ── Top Bar ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-5 py-1 flex items-center shrink-0">
        {/* Left: page selector + tabs + viewport — single hotspot zone */}
        <HotspotZone
          id="view-tabs"
          hotspot={findHotspot("view-tabs")}
          isActive={activeHotspotId === "view-tabs"}
          onHotspotClick={onHotspotClick}
        >
          <div className="flex items-center gap-1">
            {/* Page selector */}
            <div className="flex items-center gap-2 shrink-0 mr-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
                <Pencil className="h-3 w-3" />
                Editing Page:
              </div>
              <div className="flex items-center gap-1.5 pl-2 pr-1.5 py-0.5 rounded-md text-sm font-semibold text-gray-800 cursor-pointer hover:bg-gray-50">
                <span className="truncate max-w-[120px]">Home</span>
                <ChevronDown size={11} className="text-gray-400 shrink-0" />
              </div>
            </div>

            <div className="w-px h-5 bg-gray-200 mx-1" />

            {/* View tabs */}
            <nav className="flex items-center shrink-0">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeView === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveView(tab.key)}
                    className={clsx(
                      "relative px-3 py-2.5 text-xs font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors",
                      isActive
                        ? "text-alloro-orange"
                        : "text-gray-500 hover:text-gray-700",
                    )}
                  >
                    <Icon size={13} />
                    {tab.label}
                    {isActive && (
                      <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-alloro-orange rounded-full" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Viewport toggle + undo/redo — editor tab only */}
            {activeView === "editor" && (
              <>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewportMode("desktop")}
                    className={clsx(
                      "p-1 rounded-md transition-colors",
                      viewportMode === "desktop"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-400 hover:text-gray-600",
                    )}
                  >
                    <Monitor size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewportMode("mobile")}
                    className={clsx(
                      "p-1 rounded-md transition-colors",
                      viewportMode === "mobile"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-400 hover:text-gray-600",
                    )}
                  >
                    <Smartphone size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-0.5 ml-0.5">
                  <div className="p-1 rounded-lg text-gray-400 opacity-30 cursor-not-allowed">
                    <Undo2 size={12} />
                  </div>
                  <div className="p-1 rounded-lg text-gray-400 opacity-30 cursor-not-allowed">
                    <Redo2 size={12} />
                  </div>
                </div>
              </>
            )}
          </div>
        </HotspotZone>

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Right toolbar actions */}
        <HotspotZone
          id="toolbar-actions"
          hotspot={findHotspot("toolbar-actions")}
          isActive={activeHotspotId === "toolbar-actions"}
          onHotspotClick={onHotspotClick}
        >
          <div className="flex items-center gap-2 shrink-0">
            {activeView === "editor" && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-alloro-orange text-white shadow-sm shadow-alloro-orange/20">
                <Save className="w-3 h-3" />
                Save &amp; Publish
              </div>
            )}
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              <span>3/50 edits</span>
              <span>12% storage</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-alloro-orange/10 text-alloro-orange">
              <LinkIcon className="w-2.5 h-2.5" />
              Connect Domain
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 shrink-0">
              <ExternalLink className="w-2.5 h-2.5" />
              View Live
            </div>
          </div>
        </HotspotZone>
      </div>

      {/* ── Editor View ─────────────────────────────────────── */}
      {activeView === "editor" && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Preview pane */}
          <div className="flex-1 min-w-0 flex flex-col relative">
            <HotspotZone
              id="preview-frame"
              hotspot={findHotspot("preview-frame")}
              isActive={activeHotspotId === "preview-frame"}
              onHotspotClick={onHotspotClick}
            >
              <div className="overflow-hidden bg-gray-100 relative h-full min-h-[560px]">
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={
                    viewportMode === "desktop"
                      ? {
                          transform: "scale(0.7)",
                          transformOrigin: "top left",
                          width: "143%",
                          height: "143%",
                        }
                      : {
                          width: 375,
                          margin: "12px auto",
                          borderRadius: 16,
                          border: "1px solid #e5e7eb",
                          overflow: "hidden",
                          position: "relative",
                          height: "calc(100% - 24px)",
                        }
                  }
                >
                  <div className="bg-white min-h-full">
                    {/* Nav bar */}
                    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-8 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-alloro-orange/40" />
                        <div className="h-3.5 w-28 rounded bg-gray-300" />
                      </div>
                      {viewportMode === "desktop" && (
                        <div className="flex items-center gap-6">
                          <div className="h-2.5 w-14 rounded bg-gray-300" />
                          <div className="h-2.5 w-14 rounded bg-gray-300" />
                          <div className="h-2.5 w-14 rounded bg-gray-300" />
                          <div className="h-2.5 w-14 rounded bg-gray-300" />
                          <div className="h-8 w-28 rounded-lg bg-alloro-orange/30" />
                        </div>
                      )}
                      {viewportMode === "mobile" && (
                        <div className="p-2">
                          <MenuIcon size={18} className="text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Hero */}
                    <div className="bg-gradient-to-br from-gray-100 to-gray-50 px-8 sm:px-12 py-14">
                      <div className="h-5 w-64 rounded bg-gray-400/50" />
                      <div className="mt-3 h-3 w-80 rounded bg-gray-300/70" />
                      <div className="mt-2 h-3 w-64 rounded bg-gray-300/50" />
                      <div className="mt-6 h-10 w-36 rounded-lg bg-alloro-orange/30" />
                    </div>

                    {/* Services */}
                    <div className="bg-white px-8 sm:px-12 py-10">
                      <div className="mb-5 h-3.5 w-36 rounded bg-gray-400/40" />
                      <div className={clsx("grid gap-5", viewportMode === "desktop" ? "grid-cols-3" : "grid-cols-1")}>
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="rounded-xl border border-gray-200 bg-gray-50/80 p-5">
                            <div className="h-10 w-10 rounded-lg bg-alloro-orange/15" />
                            <div className="mt-3 h-3 w-28 rounded bg-gray-300" />
                            <div className="mt-2 h-2 w-full rounded bg-gray-200" />
                            <div className="mt-1.5 h-2 w-4/5 rounded bg-gray-200" />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Testimonials */}
                    <div className="bg-gray-50 px-8 sm:px-12 py-10 border-t border-gray-200">
                      <div className="mb-5 h-3.5 w-32 rounded bg-gray-400/40" />
                      <div className={clsx("grid gap-5", viewportMode === "desktop" ? "grid-cols-2" : "grid-cols-1")}>
                        {[1, 2].map((i) => (
                          <div key={i} className="rounded-xl bg-white border border-gray-200 p-5">
                            <div className="flex items-center gap-3 mb-3">
                              <div className="h-8 w-8 rounded-full bg-gray-300" />
                              <div>
                                <div className="h-2.5 w-20 rounded bg-gray-300" />
                                <div className="mt-1 h-2 w-14 rounded bg-gray-200" />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <div className="h-2 w-full rounded bg-gray-200" />
                              <div className="h-2 w-3/4 rounded bg-gray-200" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* About / CTA banner */}
                    <div className="bg-white px-8 sm:px-12 py-10 border-t border-gray-200">
                      <div className={clsx("flex gap-8", viewportMode === "desktop" ? "flex-row items-center" : "flex-col")}>
                        <div className="flex-1">
                          <div className="h-4 w-44 rounded bg-gray-400/40" />
                          <div className="mt-3 space-y-2">
                            <div className="h-2.5 w-full rounded bg-gray-200" />
                            <div className="h-2.5 w-11/12 rounded bg-gray-200" />
                            <div className="h-2.5 w-4/5 rounded bg-gray-200" />
                          </div>
                          <div className="mt-5 h-9 w-32 rounded-lg bg-alloro-orange/25" />
                        </div>
                        <div className={clsx("rounded-xl bg-gray-200/60", viewportMode === "desktop" ? "w-64 h-44" : "w-full h-40")} />
                      </div>
                    </div>

                    {/* Contact / Map strip */}
                    <div className="bg-gray-50 px-8 sm:px-12 py-8 border-t border-gray-200">
                      <div className={clsx("grid gap-6", viewportMode === "desktop" ? "grid-cols-3" : "grid-cols-1")}>
                        {[
                          { w: "w-24", lines: 2 },
                          { w: "w-28", lines: 3 },
                          { w: "w-20", lines: 2 },
                        ].map((col, i) => (
                          <div key={i}>
                            <div className={`h-3 ${col.w} rounded bg-gray-400/40 mb-3`} />
                            {Array.from({ length: col.lines }).map((_, j) => (
                              <div key={j} className="h-2 w-full rounded bg-gray-200 mt-1.5" />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="bg-gray-800 px-8 sm:px-12 py-8">
                      <div className="flex items-center justify-between">
                        <div className="h-3 w-24 rounded bg-gray-600" />
                        <div className="flex gap-4">
                          <div className="h-2 w-10 rounded bg-gray-600" />
                          <div className="h-2 w-10 rounded bg-gray-600" />
                          <div className="h-2 w-10 rounded bg-gray-600" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {viewportMode === "desktop" && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[10px] px-3 py-1 rounded-full backdrop-blur-sm">
                    Preview scaled to fit — use View Live for full size
                  </div>
                )}
              </div>
            </HotspotZone>
          </div>

          {/* Editor Sidebar */}
          <div className="w-[340px] shrink-0 flex flex-col border-l border-gray-200 bg-white">
            <HotspotZone
              id="editor-sidebar"
              hotspot={findHotspot("editor-sidebar")}
              isActive={activeHotspotId === "editor-sidebar"}
              onHotspotClick={onHotspotClick}
            >
              <div className="flex flex-col h-full">
                <div className="px-4 pt-3 pb-0 border-b border-gray-200">
                  <div className="flex items-center gap-4">
                    <div className="pb-2 text-xs font-semibold uppercase tracking-wider border-b-2 text-alloro-orange border-alloro-orange">
                      Chat
                    </div>
                    <div className="pb-2 text-xs font-semibold uppercase tracking-wider border-b-2 text-gray-400 border-transparent">
                      History
                    </div>
                  </div>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                  <p className="text-sm font-medium text-alloro-navy">
                    Click on a section or component to start editing.
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Hover to preview selectable elements.
                  </p>
                </div>
              </div>
            </HotspotZone>
          </div>
        </div>
      )}

      {/* ── Submissions View ────────────────────────────────── */}
      {activeView === "submissions" && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Forms sidebar */}
          <div className="w-[300px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            <HotspotZone
              id="submissions-forms"
              hotspot={findHotspot("submissions-forms")}
              isActive={activeHotspotId === "submissions-forms"}
              onHotspotClick={onHotspotClick}
            >
              <div className="p-4">
                {/* Sidebar header */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-7 w-7 rounded-lg bg-alloro-orange/10 flex items-center justify-center">
                    <SlidersHorizontal size={13} className="text-alloro-orange" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-alloro-navy">Forms</h3>
                    <p className="text-[10px] text-gray-400">{formCatalog.length} detected</p>
                  </div>
                </div>

                {/* Form cards */}
                <div className="space-y-2">
                  {formCatalog.map((form, idx) => (
                    <button
                      key={form.formKey}
                      type="button"
                      onClick={() => setActiveFormIdx(idx)}
                      className={clsx(
                        "w-full text-left p-3 rounded-xl border transition-all",
                        activeFormIdx === idx
                          ? "border-alloro-orange bg-white shadow-sm"
                          : "border-gray-200 bg-gray-50/50 hover:border-gray-300",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {form.unread > 0 && (
                          <div className="w-2 h-2 rounded-full bg-alloro-orange mt-1 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-alloro-navy truncate">{form.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">{form.formKey}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-gray-400">
                            <span>{form.submissions} submissions</span>
                            <span className="text-gray-300">&middot;</span>
                            <span>{form.lastSeen}</span>
                          </div>
                        </div>
                        <span className={clsx(
                          "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0",
                          form.isCustom ? "bg-alloro-orange/10 text-alloro-orange" : "bg-gray-100 text-gray-400",
                        )}>
                          {form.isCustom ? "Custom" : "Default"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </HotspotZone>
          </div>

          {/* Submissions main area */}
          <div className="flex-1 min-w-0 overflow-y-auto bg-white">
            <HotspotZone
              id="submissions-list"
              hotspot={findHotspot("submissions-list")}
              isActive={activeHotspotId === "submissions-list"}
              onHotspotClick={onHotspotClick}
            >
              <div className="p-5">
                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-9 w-9 rounded-lg bg-alloro-orange/10 flex items-center justify-center">
                    <Inbox size={16} className="text-alloro-orange" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-sm font-bold text-alloro-navy">{activeForm.name}</h2>
                    <p className="text-[10px] text-gray-400 font-mono">{activeForm.formKey}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                      {activeForm.submissions} total
                    </span>
                    {activeForm.unread > 0 && (
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-alloro-orange text-white">
                        {activeForm.unread} new
                      </span>
                    )}
                    <button type="button" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    </button>
                  </div>
                </div>

                {/* Filter sub-tabs */}
                <div className="flex items-center gap-1 mb-4 border-b border-gray-200 pb-2">
                  {[
                    { label: "All", icon: Inbox, count: 3, active: true },
                    { label: "Verified", icon: CheckCircle2, count: 2, active: false },
                    { label: "Flagged", icon: ShieldAlert, count: 1, active: false },
                  ].map((tab) => {
                    const TabIcon = tab.icon;
                    return (
                      <div
                        key={tab.label}
                        className={clsx(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                          tab.active ? "bg-alloro-orange/10 text-alloro-orange" : "text-gray-400 hover:text-gray-600",
                        )}
                      >
                        <TabIcon size={12} />
                        {tab.label}
                        <span className={clsx(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                          tab.active ? "bg-alloro-orange/20 text-alloro-orange" : "bg-gray-100 text-gray-400",
                        )}>
                          {tab.count}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex-1" />
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer hover:text-gray-600">
                    <CheckCircle2 size={11} />
                    Mark all as read
                  </div>
                </div>

                {/* Submission rows */}
                <div className="divide-y divide-gray-100">
                  {contactSubmissions.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-3 py-3 hover:bg-gray-50/50 -mx-2 px-2 rounded-lg transition-colors">
                      {/* Status icon */}
                      <div className="shrink-0">
                        {sub.isFlagged ? (
                          <ShieldAlert size={16} className="text-amber-500" />
                        ) : sub.isRead ? (
                          <MailOpen size={16} className="text-gray-300" />
                        ) : (
                          <Mail size={16} className="text-alloro-orange" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            "text-xs truncate",
                            sub.isRead ? "text-gray-600" : "font-semibold text-alloro-navy",
                          )}>
                            {sub.formName}
                          </span>
                          {sub.isFlagged && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">flagged</span>
                          )}
                          {!sub.isRead && !sub.isFlagged && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-alloro-orange text-white">new</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">
                          {sub.preview}
                        </p>
                      </div>

                      {/* Time */}
                      <span className="text-[10px] text-gray-400 shrink-0">{sub.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </HotspotZone>
          </div>
        </div>
      )}

      {/* ── Posts View ───────────────────────────────────────── */}
      {activeView === "posts" && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Post types sidebar */}
          <div className="w-[30%] min-w-[220px] max-w-[320px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            <HotspotZone
              id="posts-types"
              hotspot={findHotspot("posts-types")}
              isActive={activeHotspotId === "posts-types"}
              onHotspotClick={onHotspotClick}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-alloro-navy">Post Types</h3>
                  <button type="button" className="flex items-center gap-1 text-[11px] font-semibold text-alloro-orange hover:text-alloro-orange/80">
                    <Plus size={12} />
                    New
                  </button>
                </div>
                <div className="space-y-1">
                  {postTypes.map((pt, idx) => (
                    <button
                      key={pt.slug}
                      type="button"
                      onClick={() => setActivePostTypeIdx(idx)}
                      className={clsx(
                        "w-full text-left px-3 py-2.5 rounded-lg transition-all",
                        activePostTypeIdx === idx
                          ? "bg-alloro-orange/5 border-l-2 border-alloro-orange"
                          : "hover:bg-gray-50",
                      )}
                    >
                      <p className="text-xs font-semibold text-alloro-navy">{pt.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
                        <span className="font-mono">/{pt.slug}</span>
                        <span className="text-gray-300">&middot;</span>
                        <span>{pt.count} posts</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </HotspotZone>
          </div>

          {/* Posts main area */}
          <div className="flex-1 min-w-0 overflow-y-auto bg-white">
            <HotspotZone
              id="posts-list"
              hotspot={findHotspot("posts-list")}
              isActive={activeHotspotId === "posts-list"}
              onHotspotClick={onHotspotClick}
            >
              <div className="p-5">
                {/* Filter bar */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 font-medium">All Status</span>
                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 font-medium">Category</span>
                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 font-medium">Tag</span>
                  </div>
                  <div className="flex-1" />
                  <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-alloro-orange text-white">
                    <Plus size={12} />
                    Create
                  </button>
                </div>

                {/* Post cards */}
                <div className="space-y-3">
                  {blogPosts.map((post) => (
                    <div key={post.id} className="p-4 rounded-xl border border-gray-200 hover:border-alloro-orange/20 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-alloro-navy truncate">{post.title}</h3>
                            <span className={clsx(
                              "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0",
                              post.status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700",
                            )}>
                              {post.status}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 shrink-0">
                              Blog
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-400 font-mono mt-1">{post.slug}</p>
                          <div className="flex items-center gap-3 mt-2">
                            {post.categories.map((cat) => (
                              <span key={cat} className="flex items-center gap-1 text-[10px] text-gray-500">
                                <FolderTree size={10} />
                                {cat}
                              </span>
                            ))}
                            {post.tags.map((tag) => (
                              <span key={tag} className="flex items-center gap-1 text-[10px] text-gray-500">
                                <Tag size={10} />
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 ml-3 shrink-0">
                          {/* SEO score */}
                          <div className="flex items-center gap-1.5">
                            <div className="w-8 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                              <div
                                className={clsx(
                                  "h-full rounded-full",
                                  post.seoScore >= 80 ? "bg-green-500" : post.seoScore >= 60 ? "bg-yellow-500" : "bg-red-500",
                                )}
                                style={{ width: `${post.seoScore}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400">{post.seoScore}</span>
                          </div>
                          <button type="button" className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <Pencil size={12} />
                          </button>
                          <button type="button" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </HotspotZone>
          </div>
        </div>
      )}

      {/* ── Menus View ──────────────────────────────────────── */}
      {activeView === "menus" && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Menus sidebar */}
          <div className="w-[30%] min-w-[220px] max-w-[320px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            <HotspotZone
              id="menus-list"
              hotspot={findHotspot("menus-list")}
              isActive={activeHotspotId === "menus-list"}
              onHotspotClick={onHotspotClick}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-alloro-navy">Menus</h3>
                    <p className="text-[10px] text-gray-400">{menusList.length} menus</p>
                  </div>
                  <button type="button" className="flex items-center gap-1 text-[11px] font-semibold text-alloro-orange hover:text-alloro-orange/80">
                    <Plus size={12} />
                    New
                  </button>
                </div>
                <div className="space-y-1">
                  {menusList.map((menu, idx) => (
                    <button
                      key={menu.slug}
                      type="button"
                      onClick={() => setActiveMenuIdx(idx)}
                      className={clsx(
                        "w-full text-left px-3 py-2.5 rounded-lg transition-all group",
                        activeMenuIdx === idx
                          ? "bg-alloro-orange/5 border-l-2 border-alloro-orange"
                          : "hover:bg-gray-50",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-alloro-navy truncate">{menu.name}</p>
                        <Trash2 size={11} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
                        <span className="font-mono">/{menu.slug}</span>
                        <span className="text-gray-300">&middot;</span>
                        <span>{menu.count} items</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </HotspotZone>
          </div>

          {/* Menu items main area */}
          <div className="flex-1 min-w-0 overflow-y-auto bg-white">
            <HotspotZone
              id="menus-items"
              hotspot={findHotspot("menus-items")}
              isActive={activeHotspotId === "menus-items"}
              onHotspotClick={onHotspotClick}
            >
              <div className="p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-alloro-navy">{activeMenu.name}</h2>
                      <button type="button" className="p-1 rounded text-gray-400 hover:text-gray-600">
                        <Pencil size={11} />
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {"{{ menu id='"}{activeMenu.slug}{"' }}"}
                    </p>
                  </div>
                  <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-alloro-orange text-white">
                    <Plus size={12} />
                    Add Item
                  </button>
                </div>

                {/* Menu items */}
                <div className="mt-4 divide-y divide-gray-100">
                  {mainNavItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 py-2.5 px-3 hover:bg-gray-50 transition-colors group"
                      style={{ paddingLeft: 12 + item.depth * 24 }}
                    >
                      <GripVertical size={14} className="text-gray-300 shrink-0 cursor-grab" />
                      {item.depth > 0 && (
                        <CornerDownRight size={12} className="text-gray-300 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-alloro-navy">{item.label}</span>
                        <span className="text-[10px] text-gray-400 ml-2 truncate">{item.url}</span>
                      </div>
                      {item.target === "_blank" && (
                        <ExternalLink size={10} className="text-gray-400 shrink-0" />
                      )}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button type="button" className="p-1 rounded text-gray-400 hover:text-blue-600"><Pencil size={11} /></button>
                        <button type="button" className="p-1 rounded text-gray-400 hover:text-red-600"><Trash2 size={11} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </HotspotZone>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
