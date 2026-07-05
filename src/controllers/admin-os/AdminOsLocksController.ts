import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OsLockService } from "./feature-services/OsLockService";
import { ok, handleOsError } from "./feature-utils/osResponses";
import { osActorId } from "./feature-utils/osRequestParams";

/**
 * Admin OS — edit locks (master spec D8: HTTP heartbeat): status, acquire,
 * heartbeat, idempotent owner-only release. Thin orchestration only (§7.3);
 * all conflict semantics live in OsLockService.
 */
export class AdminOsLocksController {
  /** GET /api/admin/os/documents/:id/locks — live lock or null. */
  static async get(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const lock = await OsLockService.getLock(req.params.id);
      return ok(res, { lock });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** POST /api/admin/os/documents/:id/locks — acquire (409 when held). */
  static async acquire(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const lock = await OsLockService.acquire(req.params.id, osActorId(req));
      return ok(res, { lock });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** POST /api/admin/os/documents/:id/locks/heartbeat — extend by one TTL. */
  static async heartbeat(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const lock = await OsLockService.heartbeat(req.params.id, osActorId(req));
      return ok(res, { lock });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** DELETE /api/admin/os/documents/:id/locks — idempotent owner release. */
  static async release(req: AuthRequest, res: Response): Promise<Response> {
    try {
      const result = await OsLockService.release(req.params.id, osActorId(req));
      return ok(res, result);
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
