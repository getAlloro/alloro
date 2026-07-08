import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminOsSearch, type OsHybridSearchData } from "../../api/admin-os";
import { QUERY_KEYS } from "../../lib/queryClient";

/**
 * ⌘K command-palette state + data for the OS surface (plans/07042026-alloro-os-
 * admin-port P4 T5; recreation of alloro-os useCommandPalette). Three concerns,
 * one hook so the palette component stays a pure view:
 *
 *   1. open/close — a window keydown listener toggles the palette on Cmd/Ctrl+K.
 *      It is registered ONLY while this hook is mounted, and the effect's cleanup
 *      removes it — the palette mounts inside OsShell, which renders only on
 *      /admin/os routes, so the shortcut never leaks onto other admin surfaces
 *      (proven by the unmount test).
 *   2. debounced hybrid search — the raw input is debounced before it drives the
 *      React Query request, so keystrokes don't fan out into requests.
 *   3. recent documents — the last 5 opened docs, persisted in localStorage, so
 *      an empty query still offers somewhere to go (§15.1 stays for server state;
 *      this is a client-only recents list, appropriate for localStorage).
 */

const OS_PALETTE_DEBOUNCE_MS = 180;
const OS_RECENT_DOCS_KEY = "os:recent-docs";
const OS_RECENT_DOCS_MAX = 5;
/** Cap palette result rows so the bounded surface never grows unbounded. */
const OS_PALETTE_RESULT_LIMIT = 8;
/** The search-pill in OsShell dispatches this to open the palette by click. */
export const OS_PALETTE_OPEN_EVENT = "os:command-palette-open";

/** Fire the open event — used by the OsShell search pill (no prop drilling). */
export function openOsCommandPalette(): void {
  window.dispatchEvent(new Event(OS_PALETTE_OPEN_EVENT));
}

export type OsRecentDoc = {
  id: string;
  title: string;
};

function readRecentDocs(): OsRecentDoc[] {
  try {
    const raw = localStorage.getItem(OS_RECENT_DOCS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is OsRecentDoc =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as OsRecentDoc).id === "string" &&
          typeof (item as OsRecentDoc).title === "string",
      )
      .slice(0, OS_RECENT_DOCS_MAX);
  } catch {
    return [];
  }
}

/** Push a document to the front of the recents list (deduped, capped at 5). */
export function rememberOsRecentDoc(doc: OsRecentDoc): void {
  try {
    const next = [
      doc,
      ...readRecentDocs().filter((item) => item.id !== doc.id),
    ].slice(0, OS_RECENT_DOCS_MAX);
    localStorage.setItem(OS_RECENT_DOCS_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode / quota) — recents are optional.
  }
}

export interface UseOsCommandPalette {
  open: boolean;
  close: () => void;
  query: string;
  setQuery: (value: string) => void;
  debouncedQuery: string;
  isSearching: boolean;
  data: OsHybridSearchData | undefined;
  recentDocs: OsRecentDoc[];
}

export function useOsCommandPalette(): UseOsCommandPalette {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recentDocs, setRecentDocs] = useState<OsRecentDoc[]>([]);

  // Global toggle listener + the pill's open event — both registered on mount,
  // both removed on unmount (proven by the unmount test).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OS_PALETTE_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OS_PALETTE_OPEN_EVENT, onOpen);
    };
  }, []);

  // Refresh the recents list each time the palette opens (cheap, always current).
  useEffect(() => {
    if (open) setRecentDocs(readRecentDocs());
  }, [open]);

  // Reset the query when the palette closes so it reopens clean.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  // Debounce the raw input before it drives the request.
  useEffect(() => {
    const handle = window.setTimeout(
      () => setDebouncedQuery(query.trim()),
      OS_PALETTE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(handle);
  }, [query]);

  const trimmed = debouncedQuery;
  const searchQuery = useQuery<OsHybridSearchData>({
    queryKey: QUERY_KEYS.adminOsSearch(trimmed, { mode: "hybrid", palette: true }),
    queryFn: () =>
      adminOsSearch(trimmed, { mode: "hybrid", limit: OS_PALETTE_RESULT_LIMIT }),
    enabled: open && trimmed.length > 0,
    staleTime: 10_000,
  });

  const close = useCallback(() => setOpen(false), []);

  return useMemo(
    () => ({
      open,
      close,
      query,
      setQuery,
      debouncedQuery: trimmed,
      isSearching: searchQuery.isFetching,
      data: searchQuery.data,
      recentDocs,
    }),
    [open, close, query, trimmed, searchQuery.isFetching, searchQuery.data, recentDocs],
  );
}
