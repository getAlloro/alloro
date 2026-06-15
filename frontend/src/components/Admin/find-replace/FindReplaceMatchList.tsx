import { useMemo } from "react";
import { Link2 } from "lucide-react";
import { matchKey, type FindMatch } from "./findReplaceEngine";

export type FindReplaceMatchListProps = {
  matches: FindMatch[];
  /** Status of the row that was scanned for each page ("draft" | "published"). */
  scannedStatusByPageId: Record<string, string>;
  selectedKeys: Set<string>;
  onToggleMatch: (key: string) => void;
  onTogglePage: (pageId: string, selectAll: boolean) => void;
};

type PageGroup = {
  pageId: string;
  pagePath: string;
  matches: FindMatch[];
};

const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
      status === "draft"
        ? "bg-amber-50 text-amber-700 border border-amber-200"
        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
    }`}
  >
    {status}
  </span>
);

export default function FindReplaceMatchList({
  matches,
  scannedStatusByPageId,
  selectedKeys,
  onToggleMatch,
  onTogglePage,
}: FindReplaceMatchListProps) {
  const groups = useMemo<PageGroup[]>(() => {
    const byPage = new Map<string, PageGroup>();
    matches.forEach((match) => {
      const group = byPage.get(match.pageId) ?? {
        pageId: match.pageId,
        pagePath: match.pagePath,
        matches: [],
      };
      group.matches.push(match);
      byPage.set(match.pageId, group);
    });
    return Array.from(byPage.values()).sort((a, b) =>
      a.pagePath.localeCompare(b.pagePath),
    );
  }, [matches]);

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const selectedCount = group.matches.filter((m) =>
          selectedKeys.has(matchKey(m)),
        ).length;
        const allSelected = selectedCount === group.matches.length;
        return (
          <div
            key={group.pageId}
            className="rounded-lg border border-gray-200 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 border-b border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onTogglePage(group.pageId, !allSelected)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange/40"
                  aria-label={`Select all matches on ${group.pagePath}`}
                />
                <span className="text-sm font-semibold text-gray-800 truncate">
                  {group.pagePath}
                </span>
              </label>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge
                  status={scannedStatusByPageId[group.pageId] ?? "published"}
                />
                <span className="text-xs text-gray-500">
                  {selectedCount}/{group.matches.length} selected
                </span>
              </div>
            </div>
            <ul className="divide-y divide-gray-100">
              {group.matches.map((match) => {
                const key = matchKey(match);
                return (
                  <li key={key}>
                    <label className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(key)}
                        onChange={() => onToggleMatch(key)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange/40"
                        aria-label={`Toggle match "${match.matchText}"`}
                      />
                      <span className="min-w-0 text-xs text-gray-600 break-words">
                        {match.kind === "href" && (
                          <span className="inline-flex items-center gap-1 mr-1.5 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-semibold align-middle">
                            <Link2 className="h-2.5 w-2.5" />
                            link
                          </span>
                        )}
                        {match.contextBefore}
                        <mark className="bg-orange-100 text-alloro-orange font-semibold rounded-sm px-0.5">
                          {match.matchText}
                        </mark>
                        {match.contextAfter}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
