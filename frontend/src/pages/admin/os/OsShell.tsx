import { Link, Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Library, MessageSquare, Search, Trash2 } from "lucide-react";
import { OsCommandPalette } from "../../../components/Admin/os/search/OsCommandPalette";
import { openOsCommandPalette } from "../../../hooks/queries/useOsCommandPalette";

/**
 * OS knowledge base shell (plans/07042026-alloro-os-admin-port, D1/D2/D13).
 * Full-width warm-paper surface under the admin top bar: Spectral page title,
 * Plus Jakarta sub-tab bar (Library · Chat) with the terracotta underline
 * motif from AdminTopBar, a quiet Trash link, and an <Outlet/> for sub-pages.
 * The ⌘K command palette (P4) mounts here — scoped to /admin/os routes because
 * OsShell only renders on them — with a click-to-open search pill in the nav.
 */

const SUB_TABS = [
  { to: "/admin/os", label: "Library", icon: Library },
  { to: "/admin/os/chat", label: "Chat", icon: MessageSquare },
] as const;

function isSubTabActive(pathname: string, to: string): boolean {
  if (to === "/admin/os") {
    // Library owns the index and the document routes.
    return pathname === "/admin/os" || pathname.startsWith("/admin/os/doc");
  }
  return pathname.startsWith(to);
}

export default function OsShell() {
  const location = useLocation();
  const isTrash = location.pathname.startsWith("/admin/os/trash");

  return (
    <div className="min-h-[calc(100vh-104px)] bg-gray-50">
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-7 sm:px-6 lg:px-8">
        <nav
          aria-label="OS sections"
          className="flex items-center border-b border-gray-200"
        >
          {SUB_TABS.map((tab) => {
            const active = isSubTabActive(location.pathname, tab.to);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-[13px] transition-colors duration-150 ${
                  active ? "text-[#D66853]" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
                <span className={active ? "font-semibold" : "font-medium"}>
                  {tab.label}
                </span>
                {active && (
                  <motion.div
                    layoutId="os-subtab-underline"
                    className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-full bg-[#D66853]"
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  />
                )}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={openOsCommandPalette}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-gray-200 bg-alloro-surface px-2.5 py-1.5 text-[12px] font-medium text-gray-400 transition-colors duration-150 hover:text-gray-700"
            aria-label="Search the knowledge base"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span className="hidden sm:inline">Search</span>
            <kbd className="font-mono text-[10px] text-gray-300">⌘K</kbd>
          </button>
          <Link
            to="/admin/os/trash"
            className={`flex items-center gap-1.5 px-2 py-2.5 text-[12px] font-medium transition-colors duration-150 ${
              isTrash ? "text-gray-800" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            Trash
          </Link>
        </nav>

        <main className="pb-16">
          <Outlet />
        </main>
      </div>

      {/* ⌘K palette — scoped to OS routes (mounted only in this shell). */}
      <OsCommandPalette />
    </div>
  );
}
