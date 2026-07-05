import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OsFtsSearchService } from "./feature-services/OsFtsSearchService";
import { ok, handleOsError } from "./feature-utils/osResponses";
import {
  firstQueryValue,
  parseOsSearchFilters,
} from "./feature-utils/osRequestParams";
import {
  buildOsPaginationMeta,
  parseOsPagination,
} from "./feature-utils/osPagination";

/**
 * Admin OS — lexical search (websearch_to_tsquery + weighted rank +
 * ts_headline snippets); archived excluded unless status=archived is asked
 * for. Thin orchestration only (§7.3); SQL lives in OsDocumentModel.
 */
export class AdminOsSearchController {
  /** GET /api/admin/os/search?q=&folder_id=&category=&tag=&owner_id=&status= */
  static async search(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { page, limit, offset } = parseOsPagination(
        req.query.page,
        req.query.limit
      );
      const { results, total } = await OsFtsSearchService.search({
        query: firstQueryValue(req.query.q) ?? "",
        filters: parseOsSearchFilters(req.query),
        limit,
        offset,
      });
      return ok(res, {
        results,
        pagination: buildOsPaginationMeta(total, page, limit),
      });
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
