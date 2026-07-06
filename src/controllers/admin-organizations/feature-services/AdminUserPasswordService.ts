/**
 * Admin User Password Service
 *
 * Admin-driven temporary-password set for a user: generate a CSPRNG password,
 * hash + persist it, ensure the account is email-verified, and optionally send
 * a notification email (best-effort — email failure does not fail the set).
 *
 * Guard failures throw AdminOrgError with the exact status + body. All DB
 * access stays in models/.
 */

import bcrypt from "bcrypt";
import { UserModel } from "../../../models/UserModel";
import { sendEmail } from "../../../emails/emailService";
import * as tempPasswordGenerator from "../feature-utils/tempPasswordGenerator";
import * as adminEmailTemplates from "../feature-utils/adminEmailTemplates";
import { AdminOrgError } from "../feature-utils/AdminOrgError";
import logger from "../../../lib/logger";

const BCRYPT_SALT_ROUNDS = 12;

export interface SetUserPasswordResult {
  success: true;
  temporaryPassword: string;
  message: string;
}

/**
 * Set a temporary password for a user and optionally email it to them.
 *
 * @param userId      target user id (already parsed/validated by the caller)
 * @param notifyUser  whether to send the password notification email
 * @param adminEmail  the acting admin's email (for the audit log line)
 */
export async function setTemporaryPassword(
  userId: number,
  notifyUser: boolean,
  adminEmail?: string
): Promise<SetUserPasswordResult> {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AdminOrgError(404, { error: "User not found" });
  }

  const tempPassword = tempPasswordGenerator.generate();
  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_SALT_ROUNDS);

  await UserModel.updatePasswordHash(userId, passwordHash);

  // Ensure email is verified so user can log in
  if (!user.email_verified) {
    await UserModel.setEmailVerified(userId);
  }

  if (notifyUser) {
    const appUrl =
      process.env.NODE_ENV === "production"
        ? "https://app.getalloro.com"
        : "http://localhost:5173";

    const emailResult = await sendEmail({
      category: "account",
      subject: "Your Alloro password has been set",
      body: adminEmailTemplates.setPasswordEmail({
        userName: user.name,
        tempPassword,
        appUrl,
      }),
      recipients: [user.email],
    });

    if (!emailResult.success) {
      logger.error(
        { err: emailResult.error },
        `[Admin] Failed to send password notification to ${user.email}:`
      );
    }
  }

  logger.info(
    `[Admin] Temporary password set for user ${userId} (${user.email}) by admin ${adminEmail}`
  );

  return {
    success: true,
    temporaryPassword: tempPassword,
    message: notifyUser
      ? `Password set and notification sent to ${user.email}`
      : `Password set for ${user.email}`,
  };
}
