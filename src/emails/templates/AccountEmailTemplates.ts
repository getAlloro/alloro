/**
 * Account Email Templates
 *
 * Pure HTML builders for invitations, authentication codes, and temporary
 * passwords. Delivery orchestration remains with the existing controllers and
 * services.
 */

import {
  BRAND_COLORS,
  EMAIL_FONT_STACKS,
  createButton,
  createCodeCard,
  escapeHtml,
  wrapInBaseTemplate,
} from "./base";

const HEADING_STYLE = `margin: 0 0 20px; color: ${BRAND_COLORS.navy}; font-family: ${EMAIL_FONT_STACKS.display}; font-size: 32px; font-weight: 700; line-height: 1.15;`;
const BODY_STYLE = `margin: 0 0 18px; color: ${BRAND_COLORS.darkGray}; font-family: ${EMAIL_FONT_STACKS.body}; font-size: 16px; line-height: 1.7;`;
const SUPPORTING_STYLE = `margin: 0 0 14px; color: ${BRAND_COLORS.mediumGray}; font-family: ${EMAIL_FONT_STACKS.body}; font-size: 14px; line-height: 1.65;`;

export interface InvitationEmailParams {
  organizationName: string;
  role: string;
  signupUrl: string;
}

export interface AccountCodeEmailParams {
  code: string;
}

export interface TemporaryPasswordEmailParams {
  userName?: string | null;
  tempPassword: string;
  appUrl: string;
}

export function buildInvitationEmail({
  organizationName,
  role,
  signupUrl,
}: InvitationEmailParams): string {
  const safeOrganizationName = escapeHtml(organizationName);
  const safeRole = escapeHtml(role);

  return wrapInBaseTemplate(
    `
      <h1 style="${HEADING_STYLE}">You've been invited to Alloro</h1>
      <p style="${BODY_STYLE}">
        You've been invited to join <strong>${safeOrganizationName}</strong> on Alloro with the role of <strong>${safeRole}</strong>.
      </p>
      <p style="${BODY_STYLE}">
        Alloro helps you track and optimize your online presence with data-driven insights.
      </p>
      <div style="margin: 28px 0;">
        ${createButton("Create Your Account", signupUrl)}
      </div>
      <p style="${SUPPORTING_STYLE}">
        Click the button above to create your account and join <strong>${safeOrganizationName}</strong>.
      </p>
      <p style="${SUPPORTING_STYLE}">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
      <p style="margin: 28px 0 0; padding-top: 20px; border-top: 1px solid ${BRAND_COLORS.border}; color: ${BRAND_COLORS.mediumGray}; font-family: ${EMAIL_FONT_STACKS.body}; font-size: 12px; line-height: 1.6;">
        This invitation was sent by Alloro on behalf of ${safeOrganizationName}.
      </p>
    `,
    { preheader: `You've been invited to join ${organizationName} on Alloro` },
  );
}

export function buildVerificationCodeEmail({
  code,
}: AccountCodeEmailParams): string {
  return wrapInBaseTemplate(
    `
      <h1 style="${HEADING_STYLE}">Verify your email</h1>
      <p style="${BODY_STYLE}">Enter this code to verify your Alloro account:</p>
      ${createCodeCard("Verification code", code)}
      <p style="${SUPPORTING_STYLE}">This code will expire in 10 minutes.</p>
      <p style="${SUPPORTING_STYLE}">If you didn't create an account, please ignore this email.</p>
    `,
    { preheader: "Verify your Alloro account" },
  );
}

export function buildPasswordResetEmail({
  code,
}: AccountCodeEmailParams): string {
  return wrapInBaseTemplate(
    `
      <h1 style="${HEADING_STYLE}">Reset your password</h1>
      <p style="${BODY_STYLE}">Enter this code to reset your Alloro password:</p>
      ${createCodeCard("Password reset code", code)}
      <p style="${SUPPORTING_STYLE}">This code will expire in 30 minutes.</p>
      <p style="${SUPPORTING_STYLE}">If you didn't request a password reset, please ignore this email.</p>
    `,
    { preheader: "Reset your Alloro password" },
  );
}

export function buildTemporaryPasswordEmail({
  userName,
  tempPassword,
  appUrl,
}: TemporaryPasswordEmailParams): string {
  const greeting = userName ? `Hello, ${escapeHtml(userName)}!` : "Hello!";

  return wrapInBaseTemplate(
    `
      <h1 style="${HEADING_STYLE}">${greeting}</h1>
      <p style="${BODY_STYLE}">
        Alloro has set a temporary password for your account. You can now sign in using your email and the password below.
      </p>
      ${createCodeCard("Your temporary password", tempPassword)}
      <p style="${BODY_STYLE}">
        We recommend changing your password as soon as possible. You can do this from your Account Settings.
      </p>
      <div style="margin: 28px 0;">
        ${createButton("Open Account Settings", `${appUrl}/settings`)}
      </div>
      <p style="${SUPPORTING_STYLE}">If you have any questions, please contact our team.</p>
    `,
    { preheader: "Your Alloro password has been set" },
  );
}
