import { useState, useRef, useEffect } from "react";
import { Search, FileText, ChevronDown, Check } from "lucide-react";
import type { TemplatePage } from "../../api/templates";

interface TemplatePageSelectProps {
  pages: TemplatePage[];
  value: string | null;
  onChange: (pageId: string) => void;
  loading?: boolean;
}

/**
 * Combobox-style search select for template pages. Replaces the long scrolling
 * list with a compact trigger that opens a filterable dropdown.
 */
export default function TemplatePageSelect({
  pages,
  value,
  onChange,
  loading,
}: TemplatePageSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = pages.find((p) => p.id === value) || null;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    } else {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? pages.filter((p) => p.name.toLowerCase().includes(normalizedQuery))
    : pages;

  if (loading) {
    return (
      <div className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-400">
        Loading pages...
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
        No template pages found.
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-left hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
      >
        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
        <span className={`flex-1 truncate ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {selected ? selected.name : "Select a template page..."}
        </span>
        {selected?.sections && selected.sections.length > 0 && (
          <span className="text-xs text-gray-400 shrink-0">
            {selected.sections.length} section
            {selected.sections.length !== 1 ? "s" : ""}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="relative border-b border-gray-100">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages..."
              className="w-full pl-9 pr-3 py-2 text-sm border-0 focus:outline-none focus:ring-0"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400 italic">
                No pages match "{query}".
              </div>
            ) : (
              filtered.map((page) => {
                const active = page.id === value;
                return (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => {
                      onChange(page.id);
                      setOpen(false);
                    }}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition ${
                      active
                        ? "bg-orange-50 text-gray-900"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <FileText
                      className={`w-3.5 h-3.5 shrink-0 ${
                        active ? "text-alloro-orange" : "text-gray-400"
                      }`}
                    />
                    <span className="flex-1 truncate">{page.name}</span>
                    {page.sections && page.sections.length > 0 && (
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {page.sections.length}
                      </span>
                    )}
                    {active && (
                      <Check className="w-3.5 h-3.5 text-alloro-orange shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
