/**
 * Admin Email Templates
 *
 * Pure HTML builders for admin-triggered organization/user emails.
 * No I/O — returns markup strings only.
 */

/**
 * Build the body for the "password has been set" notification email.
 * Preserves the exact markup from the original setUserPassword handler.
 */
export function setPasswordEmail(params: {
  userName?: string | null;
  tempPassword: string;
  appUrl: string;
}): string {
  const { userName, tempPassword, appUrl } = params;
  return `
          <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: #1a1a1a;">Hello${userName ? `, ${userName}` : ""}!</h2>
            <p style="color: #4a5568; font-size: 16px;">
              Alloro has set a temporary password for your account. You can now sign in using your email and the password below.
            </p>
            <div style="background: #f7f7f7; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="color: #718096; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 1px;">Your temporary password</p>
              <p style="font-size: 20px; font-weight: bold; letter-spacing: 2px; margin: 0; color: #1a1a1a; font-family: monospace;">${tempPassword}</p>
            </div>
            <p style="color: #4a5568; font-size: 16px;">
              We recommend changing your password as soon as possible. You can do this from your
              <a href="${appUrl}/settings" style="color: #F97316; text-decoration: underline;">Account Settings</a>.
            </p>
            <p style="color: #718096; font-size: 14px; margin-top: 24px;">
              If you have any questions, please contact our team.
            </p>
          </div>
        `;
}
