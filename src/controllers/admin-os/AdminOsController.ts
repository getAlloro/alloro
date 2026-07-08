import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { OsAdminUserModel, IOsAdminUser } from "../../models/OsAdminUserModel";
import { ok, handleOsError } from "./feature-utils/osResponses";

/**
 * Admin OS — internal knowledge-base domain
 * (plans/07042026-alloro-os-admin-port, D11; reference analog §6.1
 * src/controllers/gbp-automation/). Thin orchestration only (§7.3): DB access
 * stays in Os*Model files, responses ride the §8.1 envelope via osResponses.
 * Every route is super-admin gated in routes/admin/os.ts (§11.1, D3).
 * P1 exposes ping + the people-picker user list; P2+ add the Library API.
 */

function displayName(user: IOsAdminUser): string {
  if (user.name) return user.name;
  const fromParts = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return fromParts || user.email;
}

export class AdminOsController {
  /** GET /api/admin/os/ping — liveness probe for the gated domain. */
  static async ping(_req: AuthRequest, res: Response): Promise<Response> {
    try {
      return ok(res, { pong: true, timestamp: new Date().toISOString() });
    } catch (error) {
      return handleOsError(res, error);
    }
  }

  /** GET /api/admin/os/users — internal Alloro users for owner/author pickers (D3). */
  static async listUsers(_req: AuthRequest, res: Response): Promise<Response> {
    try {
      const users = await OsAdminUserModel.listInternalUsers();
      return ok(res, {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          name: displayName(user),
        })),
      });
    } catch (error) {
      return handleOsError(res, error);
    }
  }
}
