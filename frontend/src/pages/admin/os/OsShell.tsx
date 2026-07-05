import { Link, Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Library, MessageSquare, Trash2 } from "lucide-react";

/**
 * OS knowledge base shell (plans/07042026-alloro-os-admin-port, D1/D2/D13).
 * Full-width warm-paper surface under the admin top bar: Spectral page title,
 * Plus Jakarta sub-tab bar (Library · Chat) with the terracotta underline
 * motif from AdminTopBar, a quiet Trash link, and an <Outlet/> for sub-pages.
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
    <div className="min-h-[calc(100vh-104px)] bg-alloro-bg">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <header className="pt-10 pb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
            Alloro OS
          </p>
          <h1 className="mt-1 font-display text-3xl text-alloro-textDark">
            Knowledge Base
          </h1>
        </header>

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
          <Link
            to="/admin/os/trash"
            className={`ml-auto flex items-center gap-1.5 px-2 py-2.5 text-[12px] font-medium transition-colors duration-150 ${
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
    </div>
  );
}
