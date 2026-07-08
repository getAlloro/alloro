import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OsLinkService } from "./feature-services/OsLinkService";
import { ok, handleOsError } from "./feature-utils/osResponses";
import { osActorId } from "./feature-utils/osRequestParams";

/**
 * Admin OS — related-document links (P4 T4). Thin orchestration only (§7.3):
 * each handler parses the request, calls one OsLinkService method, and answers
 * with the §8.1 envelope via osResponses. Lifecycle: list (accepted + backlinks
 * + suggested), manual create (→ accepted), and PATCH status (accept/reject).
 */
export class AdminOsLinksController {
  /** GET /api/admin/os/documents/:id/links — the Related rail buckets. */
  static async list(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const links = await OsLinkService.getLinks(req.params.id);
      return ok(res, links);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** POST /api/admin/os/documents/:id/links — manual link, created accepted. */
  static async create(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const link = await OsLinkService.createManualLink(
        req.params.id,
        String(req.body.target_document_id),
        osActorId(req)
      );
      return ok(res, { link }, 201);
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** PATCH /api/admin/os/links/:id — accept or reject a suggestion. */
  static async updateStatus(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const status = String(req.body.status);
      const link =
        status === "accepted"
          ? await OsLinkService.acceptLink(req.params.id, osActorId(req))
          : await OsLinkService.rejectLink(req.params.id, osActorId(req));
      return ok(res, { link });
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
