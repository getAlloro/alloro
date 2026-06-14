import jwt from "jsonwebtoken";
import { SESSION_TOKEN_TTL } from "../../../auth-otp/feature-services/service.jwt-management";
import { getJwtSecret } from "../../../../config/jwt";
import { UserModel } from "../../../../models/UserModel";
import { GoogleConnectionModel } from "../../../../models/GoogleConnectionModel";
import { OrganizationUserModel } from "../../../../models/OrganizationUserModel";

export interface PilotSessionResult {
  token: string;
  googleAccountId: number | null;
  user: {
    id: number;
    email: string;
    name: string | null;
  };
}

export class PilotSessionService {
  static async generatePilotToken(
    userId: string,
    adminEmail: string
  ): Promise<PilotSessionResult> {
    const userIdNum = parseInt(userId);
    if (isNaN(userIdNum)) {
      const error = new Error("Invalid user ID");
      error.name = "ValidationError";
      throw error;
    }

    const targetUser = await UserModel.findById(userIdNum);

    if (!targetUser) {
      const error = new Error("User not found");
      error.name = "NotFoundError";
      throw error;
    }

    // user_id was dropped from google_connections — look up via organization_users
    const orgUser = await OrganizationUserModel.findByUserId(userIdNum);
    const googleAccount = orgUser
      ? await GoogleConnectionModel.findOneByOrganization(orgUser.organization_id)
      : undefined;

    const pilotToken = jwt.sign(
      {
        userId: targetUser.id,
        email: targetUser.email,
        isPilot: true,
      },
      getJwtSecret(),
      { expiresIn: SESSION_TOKEN_TTL }
    );

    console.log(
      `[ADMIN PILOT] Super Admin ${adminEmail} started pilot session for user ${targetUser.email}`
    );

    return {
      token: pilotToken,
      googleAccountId: googleAccount?.id || null,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
      },
    };
  }
}
