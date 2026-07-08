/**
 * Lexical full-text search over the OS Library — websearch_to_tsquery +
 * weighted ts_rank + ts_headline snippets, filters, archived excluded by
 * default (widened only when the caller explicitly filters status=archived).
 * The SQL itself lives in OsDocumentModel (§7.4/§10.2); this service owns the
 * filter semantics and pagination.
 */

import {
  IOsDocumentSearchFilters,
  IOsDocumentSearchHit,
  OsDocumentModel,
} from "../../../models/OsDocumentModel";

export interface OsSearchInput {
  query: string;
  filters: IOsDocumentSearchFilters;
  limit: number;
  offset: number;
}

export class OsFtsSearchService {
  static async search(
    input: OsSearchInput
  ): Promise<{ results: IOsDocumentSearchHit[]; total: number }> {
    const query = input.query.trim();
    if (!query) return { results: [], total: 0 };

    const filters: IOsDocumentSearchFilters = {
      ...input.filters,
      // Trash rows only surface when explicitly asked for.
      includeArchived: input.filters.status === "archived",
    };
    const [results, total] = await Promise.all([
      OsDocumentModel.searchFullText(query, filters, {
        limit: input.limit,
        offset: input.offset,
      }),
      OsDocumentModel.countFullTextMatches(query, filters),
    ]);
    return { results, total };
  }
}
