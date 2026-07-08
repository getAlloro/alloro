/**
 * Hybrid search composer for the OS Library (plans/07042026-alloro-os-admin-port,
 * P4 T4). GET /search?mode= runs one or both retrieval strategies and returns
 * the two sections side by side:
 *
 *   - lexical  → OsFtsSearchService (weighted websearch_to_tsquery + ts_rank +
 *     <<…>> ts_headline snippets, archived excluded by default).
 *   - semantic → OsRetrievalService.searchPassages (cosine chunk hits with the
 *     similarity floor, indexed + non-archived only, heading_path + snippet).
 *
 * mode=hybrid (default) runs both; mode=lexical / mode=semantic runs one and
 * leaves the other section empty. Thin: it only picks strategies and packs the
 * envelope payload — the SQL lives in models (§7.4), the semantic embed rides
 * the provider seam. P5 chat reuses OsRetrievalService directly, not this.
 */

import { IOsDocumentSearchHit } from "../../../models/OsDocumentModel";
import { OsFtsSearchService } from "./OsFtsSearchService";
import { OsPassageHit, OsRetrievalService } from "./OsRetrievalService";

export type OsSearchMode = "hybrid" | "lexical" | "semantic";

export interface OsHybridSearchInput {
  query: string;
  mode: OsSearchMode;
  limit: number;
  offset: number;
}

export interface OsHybridSearchResult {
  mode: OsSearchMode;
  lexical: {
    results: IOsDocumentSearchHit[];
    total: number;
  };
  semantic: {
    results: OsPassageHit[];
  };
}

const EMPTY_LEXICAL = { results: [] as IOsDocumentSearchHit[], total: 0 };
const EMPTY_SEMANTIC = { results: [] as OsPassageHit[] };

export class OsHybridSearchService {
  static async search(
    input: OsHybridSearchInput
  ): Promise<OsHybridSearchResult> {
    const query = input.query.trim();
    if (!query) {
      return { mode: input.mode, lexical: EMPTY_LEXICAL, semantic: EMPTY_SEMANTIC };
    }

    const runLexical = input.mode === "hybrid" || input.mode === "lexical";
    const runSemantic = input.mode === "hybrid" || input.mode === "semantic";

    const [lexical, semanticResults] = await Promise.all([
      runLexical
        ? OsFtsSearchService.search({
            query,
            filters: {},
            limit: input.limit,
            offset: input.offset,
          })
        : Promise.resolve(EMPTY_LEXICAL),
      runSemantic
        ? OsRetrievalService.searchPassages(query)
        : Promise.resolve([] as OsPassageHit[]),
    ]);

    return {
      mode: input.mode,
      lexical: { results: lexical.results, total: lexical.total },
      semantic: { results: semanticResults },
    };
  }
}
