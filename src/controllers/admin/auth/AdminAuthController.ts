import { Response } from "express";
import { AuthRequest } from "../../../middleware/auth";
import { PilotSessionService } from "./services/PilotSessionService";
import logger from "../../../lib/logger";

export class AdminAuthController {
  static async createPilotSession(
    req: AuthRequest,
    res: Response
  ): Promise<Response> {
    try {
      const { userId } = req.params;

      const result = await PilotSessionService.generatePilotToken(
        userId,
        req.user?.email || "unknown"
      );

      return res.json({
        success: true,
        token: result.token,
        googleAccountId: result.googleAccountId,
        user: result.user,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "NotFoundError") {
        return res.status(404).json({ error: "User not found" });
      }

      if (error instanceof Error && error.name === "ValidationError") {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      logger.error({ err: error }, "[ADMIN PILOT] Error creating pilot session:");
      return res
        .status(500)
        .json({ error: "Failed to create pilot session token" });
    }
  }

  static async validateSuperAdmin(
    _req: AuthRequest,
    res: Response
  ): Promise<Response> {
    return res.json({ success: true, message: "Authorized" });
  }
}
