import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OsCategoryService } from "./feature-services/OsCategoryService";
import { ok, handleOsError } from "./feature-utils/osResponses";
import { osActorId } from "./feature-utils/osRequestParams";

/**
 * Admin OS — taxonomy (categories): merged registry list + idempotent create
 * (plans/07042026-alloro-os-admin-port P2 T3). Thin orchestration only (§7.3).
 */
export class AdminOsTaxonomyController {
  /** GET /api/admin/os/categories — persisted registry ∪ document categories. */
  static async listCategories(
    _req: AuthRequest,
    res: Response
  ): Promise<Response> {
    try {
      const categories = await OsCategoryService.listCategories();
      return ok(res, { categories });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** POST /api/admin/os/categories — 201 when new, 200 when it already existed. */
  static async createCategory(
    req: AuthRequest,
    res: Response
  ): Promise<Response> {
    try {
      const result = await OsCategoryService.createCategory(
        String(req.body.name),
        osActorId(req)
      );
      return ok(res, result, result.created ? 201 : 200);
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
