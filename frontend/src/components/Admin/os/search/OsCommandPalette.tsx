import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  rememberOsRecentDoc,
  useOsCommandPalette,
} from "../../../../hooks/queries/useOsCommandPalette";
import { OsSearchResults } from "./OsSearchResults";
import {
  buildOsPaletteItems,
  type OsPaletteItem,
} from "./osPaletteItems";

/**
 * ⌘K command palette for the OS surface (plans/07042026-alloro-os-admin-port
 * P4 T5; recreation of alloro-os CommandPalette against the Alloro light design
 * — D13: warm paper page, white bounded surface, 12px radius, Spectral titles,
 * mono meta, #D66853 accent only on the active row). All state + data come from
 * useOsCommandPalette; this component is the bounded view with keyboard nav
 * (↑ ↓ Enter Esc) and prefers-reduced-motion-aware entrance.
 *
 * Mounted once inside OsShell, which renders only on /admin/os routes — so the
 * global ⌘K listener is scoped to the OS surface and torn down on unmount.
 */

/** 12px radius per D13 (bounded object → white surface). */
const OS_PALETTE_RADIUS = "rounded-xl";

export function OsCommandPalette() {
  const {
    open,
    close,
    query,
    setQuery,
    debouncedQuery,
    isSearching,
    data,
    recentDocs,
  } = useOsCommandPalette();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const hasQuery = debouncedQuery.length > 0;
  const items = useMemo<OsPaletteItem[]>(
    () => buildOsPaletteItems(data, recentDocs, hasQuery),
    [data, recentDocs, hasQuery],
  );

  // Focus the input on open; reset the highlight whenever the result set moves.
  useEffect(() => {
    if (open) {
      const handle = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(handle);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length, hasQuery]);

  const openDocument = (item: OsPaletteItem) => {
    rememberOsRecentDoc({ id: item.documentId, title: item.title });
    close();
    navigate(`/admin/os/doc/${item.documentId}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[selectedIndex];
      if (item) openDocument(item);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          {/* Backdrop — click to dismiss. */}
          <button
            type="button"
            aria-label="Close search"
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default bg-black/20"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search the knowledge base"
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.14 }}
            className={`relative w-full max-w-[560px] overflow-hidden border border-gray-200 bg-alloro-surface shadow-2xl ${OS_PALETTE_RADIUS}`}
          >
            <div className="flex items-center gap-2.5 border-b border-gray-100 px-4">
              <Search className="h-4 w-4 shrink-0 text-gray-400" strokeWidth={1.75} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search documents and passages…"
                className="w-full bg-transparent py-3.5 font-sans text-[15px] text-alloro-textDark placeholder:text-gray-400 focus:outline-none"
                aria-label="Search query"
              />
              {isSearching ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-300">
                  …
                </span>
              ) : null}
            </div>

            <OsSearchResults
              data={data}
              recentDocs={recentDocs}
              hasQuery={hasQuery}
              isSearching={isSearching}
              selectedIndex={selectedIndex}
              onSelect={openDocument}
              onHover={setSelectedIndex}
            />

            <div className="flex items-center gap-3 border-t border-gray-100 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
              <span>↑↓ Navigate</span>
              <span>↵ Open</span>
              <span>esc Close</span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
