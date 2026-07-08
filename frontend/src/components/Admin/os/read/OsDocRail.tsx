import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useAdminOsDocuments } from "../../../../hooks/queries/useAdminOsDocuments";
import { OsStatusDot } from "../shared/OsStatusDot";

/**
 * Left document rail on the read view (P3 T3): filter box + document list
 * with the active entry highlighted. Hidden below xl (the page collapses to
 * the reading column).
 */

const OS_RAIL_PAGE_SIZE = 100;

export function OsDocRail({ activeDocumentId }: { activeDocumentId: string }) {
  const [filterText, setFilterText] = useState("");
  const documentsQuery = useAdminOsDocuments({ limit: OS_RAIL_PAGE_SIZE });

  const documents = useMemo(() => {
    const all = documentsQuery.data?.documents ?? [];
    const needle = filterText.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((doc) => doc.title.toLowerCase().includes(needle));
  }, [documentsQuery.data, filterText]);

  return (
    <aside className="sticky top-24 hidden max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:flex">
      <div className="relative pb-2">
        <Search
          className="pointer-events-none absolute left-2.5 top-[9px] h-3.5 w-3.5 text-gray-400"
          strokeWidth={1.5}
        />
        <input
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          placeholder="Filter documents"
          aria-label="Filter documents"
          className="w-full rounded-lg border border-line-medium bg-alloro-surface py-1.5 pl-8 pr-2 text-[12px] text-gray-700 outline-none transition-colors duration-150 focus:border-alloro-orange"
        />
      </div>
      <nav
        aria-label="Documents"
        className="min-h-0 flex-1 overflow-y-auto pr-1"
      >
        {documentsQuery.isLoading && (
          <p className="px-2 py-3 font-mono text-[11px] text-gray-400">
            Loading…
          </p>
        )}
        <ul className="space-y-0.5">
          {documents.map((doc) => {
            const isActive = doc.id === activeDocumentId;
            return (
              <li key={doc.id}>
                <Link
                  to={`/admin/os/doc/${doc.id}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-[9px] px-2 py-1.5 text-[13px] transition-colors duration-150 ${
                    isActive
                      ? "bg-accent-soft font-semibold text-alloro-orange"
                      : "text-gray-600 hover:bg-gray-100/70 hover:text-gray-900"
                  }`}
                >
                  <OsStatusDot status={doc.status} />
                  <span className="min-w-0 truncate">
                    {doc.title || "Untitled"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {!documentsQuery.isLoading && documents.length === 0 && (
          <p className="px-2 py-3 text-[12px] text-gray-400">
            No matching documents.
          </p>
        )}
      </nav>
    </aside>
  );
}
