import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import {
  OsHybridSearchService,
  OsSearchMode,
} from "./feature-services/OsHybridSearchService";
import { ok, handleOsError } from "./feature-utils/osResponses";
import { firstQueryValue } from "./feature-utils/osRequestParams";
import {
  buildOsPaginationMeta,
  parseOsPagination,
} from "./feature-utils/osPagination";

const OS_SEARCH_MODES: ReadonlySet<string> = new Set([
  "hybrid",
  "lexical",
  "semantic",
]);
const OS_DEFAULT_SEARCH_MODE: OsSearchMode = "hybrid";

function parseMode(value: unknown): OsSearchMode {
  const mode = firstQueryValue(value);
  return mode && OS_SEARCH_MODES.has(mode)
    ? (mode as OsSearchMode)
    : OS_DEFAULT_SEARCH_MODE;
}

/**
 * Admin OS — hybrid search (P4 T4). Returns two sections: `lexical` (weighted
 * websearch_to_tsquery + ts_rank + <<…>> ts_headline snippets, with §11.6
 * pagination) and `semantic` (cosine chunk hits with heading_path + snippet).
 * mode=hybrid (default) runs both; lexical/semantic runs one. Thin
 * orchestration only (§7.3); SQL lives in models, the semantic embed rides the
 * provider seam.
 */
export class AdminOsSearchController {
  /** GET /api/admin/os/search?q=&mode=hybrid|lexical|semantic&page=&limit= */
  static async search(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { page, limit, offset } = parseOsPagination(
        req.query.page,
        req.query.limit
      );
      const result = await OsHybridSearchService.search({
        query: firstQueryValue(req.query.q) ?? "",
        mode: parseMode(req.query.mode),
        limit,
        offset,
      });
      return ok(res, {
        mode: result.mode,
        lexical: {
          results: result.lexical.results,
          pagination: buildOsPaginationMeta(result.lexical.total, page, limit),
        },
        semantic: {
          results: result.semantic.results,
        },
      });
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
