import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { getPageBySlug } from "../data/pages";

interface TopBarProps {
  onMenuClick?: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const location = useLocation();
  const slug = location.pathname.replace("/docs/", "");
  const page = getPageBySlug(slug);

  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-alloro-border px-6 lg:px-10 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg text-alloro-navy hover:bg-alloro-cream transition-colors"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        {page ? (
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-alloro-slate">
              {page.category}
            </span>
            <span className="text-alloro-border">/</span>
            <span className="text-sm font-semibold text-alloro-navy">{page.title}</span>
          </div>
        ) : (
          <span className="text-sm font-semibold text-alloro-navy">Alloro Documentation</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="px-2.5 py-1 bg-alloro-orange-light text-alloro-orange text-[11px] font-bold rounded-full">
          v0.0.82
        </span>
      </div>
    </header>
  );
}
