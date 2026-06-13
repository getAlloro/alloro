/**
 * OTP Generation Service
 *
 * Generates 6-digit OTP codes and persists them via OtpCodeModel.
 * Sends OTP email via the mail service.
 */

import { OtpCodeModel } from "../../../models/OtpCodeModel";
import { sendEmail } from "../../../emails/emailService";

export function generateSixDigitCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Creates an OTP record in the database and sends it via email.
 * Returns true if the email was sent successfully.
 */
export async function createAndSendOtp(email: string): Promise<boolean> {
  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await OtpCodeModel.create({
    email,
    code,
    expires_at: expiresAt,
  });

  const result = await sendEmail({
    subject: "Your Alloro Login Code",
    body: `
      <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
        <h2 style="color: #1a1a1a;">Login Verification</h2>
        <p style="color: #4a5568; font-size: 16px;">Your login code is:</p>
        <h1 style="letter-spacing: 5px; background: #f4f4f4; padding: 10px; display: inline-block; border-radius: 5px;">${code}</h1>
        <p style="color: #718096; font-size: 14px;">This code will expire in 10 minutes.</p>
        <p style="color: #718096; font-size: 14px;">If you didn't request this code, please ignore this email.</p>
      </div>
    `,
    recipients: [email],
    // OTP codes must reach the requester in every environment, so they
    // bypass the email interceptor (user-ratified — see plan 06122026).
    allowLiveSend: true,
  });

  return result.success;
}
