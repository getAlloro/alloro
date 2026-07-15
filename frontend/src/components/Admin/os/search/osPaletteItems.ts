import type { OsHybridSearchData } from "../../../../api/admin-os";
import type { OsRecentDoc } from "../../../../hooks/queries/useOsCommandPalette";

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
