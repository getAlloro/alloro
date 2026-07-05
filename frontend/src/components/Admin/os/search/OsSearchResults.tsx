import { FileText, TextQuote, Clock } from "lucide-react";
import type { OsHybridSearchData } from "../../../../api/admin-os";
import type { OsRecentDoc } from "../../../../hooks/queries/useOsCommandPalette";
import { renderOsSnippet } from "./osSnippet";

/**
 * Palette result body (plans/07042026-alloro-os-admin-port P4 T5). Two result
 * sections — Documents (lexical FTS hits) and Passages (semantic chunk hits,
 * with the heading path + a <<…>> snippet) — plus a Recent section when the
 * query is empty. Rows are keyboard-navigable: the parent owns the flat item
 * list + selected index; this view only paints and maps a click to onSelect.
 */

/** A navigable palette row. Every result resolves to one document id to open. */
export type OsPaletteItem = {
  key: string;
  documentId: string;
  title: string;
  subtitle: string | null;
};

/** Flatten a hybrid response + recents into the ordered, navigable item list. */
export function buildOsPaletteItems(
  data: OsHybridSearchData | undefined,
  recentDocs: OsRecentDoc[],
  hasQuery: boolean,
): OsPaletteItem[] {
  if (!hasQuery) {
    return recentDocs.map((doc) => ({
      key: `recent:${doc.id}`,
      documentId: doc.id,
      title: doc.title,
      subtitle: null,
    }));
  }
  if (!data) return [];
  const documents: OsPaletteItem[] = data.lexical.results.map((hit) => ({
    key: `doc:${hit.id}`,
    documentId: hit.id,
    title: hit.title,
    subtitle: hit.category,
  }));
  const passages: OsPaletteItem[] = data.semantic.results.map((hit) => ({
    key: `passage:${hit.document_id}:${hit.chunk_index}`,
    documentId: hit.document_id,
    title: hit.title,
    subtitle: hit.heading_path,
  }));
  return [...documents, ...passages];
}

type SectionMeta = {
  label: string;
  icon: typeof FileText;
  start: number;
  items: Array<{ item: OsPaletteItem; snippet?: string }>;
};

export function OsSearchResults({
  data,
  recentDocs,
  hasQuery,
  isSearching,
  selectedIndex,
  onSelect,
  onHover,
}: {
  data: OsHybridSearchData | undefined;
  recentDocs: OsRecentDoc[];
  hasQuery: boolean;
  isSearching: boolean;
  selectedIndex: number;
  onSelect: (item: OsPaletteItem) => void;
  onHover: (index: number) => void;
}) {
  const sections: SectionMeta[] = [];

  if (!hasQuery) {
    if (recentDocs.length > 0) {
      sections.push({
        label: "Recent",
        icon: Clock,
        start: 0,
        items: recentDocs.map((doc) => ({
          item: {
            key: `recent:${doc.id}`,
            documentId: doc.id,
            title: doc.title,
            subtitle: null,
          },
        })),
      });
    }
  } else if (data) {
    let offset = 0;
    if (data.lexical.results.length > 0) {
      sections.push({
        label: "Documents",
        icon: FileText,
        start: offset,
        items: data.lexical.results.map((hit) => ({
          item: {
            key: `doc:${hit.id}`,
            documentId: hit.id,
            title: hit.title,
            subtitle: hit.category,
          },
          snippet: hit.snippet,
        })),
      });
      offset += data.lexical.results.length;
    }
    if (data.semantic.results.length > 0) {
      sections.push({
        label: "Passages",
        icon: TextQuote,
        start: offset,
        items: data.semantic.results.map((hit) => ({
          item: {
            key: `passage:${hit.document_id}:${hit.chunk_index}`,
            documentId: hit.document_id,
            title: hit.title,
            subtitle: hit.heading_path,
          },
          snippet: hit.snippet,
        })),
      });
      offset += data.semantic.results.length;
    }
  }

  const isEmpty = sections.every((section) => section.items.length === 0);

  if (isEmpty) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-gray-400">
          {hasQuery
            ? isSearching
              ? "Searching…"
              : "No matches"
            : "Type to search the knowledge base"}
        </p>
      </div>
    );
  }

  return (
    <div className="max-h-[52vh] overflow-y-auto py-2">
      {sections.map((section) => (
        <div key={section.label} className="mb-1">
          <div className="flex items-center gap-1.5 px-4 pb-1 pt-2">
            <section.icon className="h-3 w-3 text-gray-400" strokeWidth={1.75} />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400">
              {section.label}
            </span>
          </div>
          <ul>
            {section.items.map((row, localIndex) => {
              const index = section.start + localIndex;
              const isSelected = index === selectedIndex;
              return (
                <li key={row.item.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(row.item)}
                    onMouseMove={() => onHover(index)}
                    className={`flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left transition-colors ${
                      isSelected ? "bg-alloro-bg" : "bg-transparent"
                    }`}
                  >
                    <span className="min-w-0 truncate font-display text-[15px] text-alloro-textDark">
                      {row.item.title}
                    </span>
                    {row.item.subtitle ? (
                      <span className="font-mono text-[11px] text-gray-400">
                        {row.item.subtitle}
                      </span>
                    ) : null}
                    {row.snippet ? (
                      <span className="line-clamp-1 text-[12px] text-gray-500">
                        {renderOsSnippet(row.snippet)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
