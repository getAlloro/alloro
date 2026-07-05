import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import {
  OsVersionService,
  OS_DIFF_DRAFT_TOKEN,
} from "./feature-services/OsVersionService";
import { ok, handleOsError } from "./feature-utils/osResponses";
import { osActorId, firstQueryValue } from "./feature-utils/osRequestParams";
import {
  buildOsPaginationMeta,
  parseOsPagination,
} from "./feature-utils/osPagination";

/**
 * Admin OS — version history: paginated list, single version, diff (version
 * vs version, or either side vs the "draft" token), and non-destructive
 * restore (plans/07042026-alloro-os-admin-port P2 T3). Thin per §7.3.
 */
export class AdminOsVersionsController {
  /** GET /api/admin/os/documents/:id/versions */
  static async list(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const { page, limit, offset } = parseOsPagination(
        req.query.page,
        req.query.limit
      );
      const { versions, total } = await OsVersionService.listVersions(
        req.params.id,
        { limit, offset }
      );
      return ok(res, {
        versions,
        pagination: buildOsPaginationMeta(total, page, limit),
      });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** GET /api/admin/os/documents/:id/versions/diff?from=&to= */
  static async diff(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const from = firstQueryValue(req.query.from) ?? OS_DIFF_DRAFT_TOKEN;
      const to = firstQueryValue(req.query.to) ?? OS_DIFF_DRAFT_TOKEN;
      const result = await OsVersionService.diff(req.params.id, from, to);
      return ok(res, result);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** GET /api/admin/os/documents/:id/versions/:versionNo */
  static async get(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const version = await OsVersionService.getVersion(
        req.params.id,
        Number(req.params.versionNo)
      );
      return ok(res, { version });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** POST /api/admin/os/documents/:id/restore — v(N+1) with v{k}'s content. */
  static async restore(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const version = await OsVersionService.restoreVersion(
        req.params.id,
        Number(req.body.version_no),
        osActorId(req)
      );
      return ok(res, { version }, 201);
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
