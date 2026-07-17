/**
 * Email Service Module
 *
 * Central module for all email functionality in Alloro.
 * Uses n8n webhook integration for email delivery.
 *
 * Environment Variables Required:
 * - ALLORO_EMAIL_SERVICE_WEBHOOK: n8n webhook URL for email sending
 * - ADMIN_EMAILS: Comma-separated list of admin email addresses
 *
 * Usage Examples:
 *
 * // Send admin notification after rankings complete
 * import { sendAdminNotification } from './emails';
 * await sendAdminNotification({
 *   summary: '3 practice rankings completed',
 *   practiceRankingsCompleted: [{ practiceName: 'Demo Dental', ... }],
 * });
 *
 * // Send error alert
 * import { sendAdminError } from './emails';
 * await sendAdminError({
 *   errorType: 'API_ERROR',
 *   errorMessage: 'Failed to fetch GBP data',
 *   timestamp: new Date().toISOString(),
 *   environment: process.env.NODE_ENV || 'development',
 * });
 *
 * // Send user notification (parallel to in-app notification)
 * import { sendUserNotification } from './emails';
 * await sendUserNotification({
 *   recipientEmail: 'user@example.com',
 *   recipientName: 'John',
 *   notificationType: 'pms_job_ready',
 *   title: 'Your PMS Data is Ready',
 *   message: 'Your referral analysis has been completed.',
 * });
 */

// Core email service
export {
  sendEmail,
  sendToAdmins,
  getAdminEmails,
  getEmailLogs,
  clearEmailLogs,
  config as emailConfig,
} from "./emailService";

// Types
export type {
  EmailPayload,
  SendEmailOptions,
  EmailResult,
  AdminNotificationData,
  AdminErrorData,
  UserInquiryData,
  UserNotificationData,
  EmailTemplate,
} from "./types";

export { EMAIL_TEMPLATES } from "./types";

// Templates
export {
  sendAdminNotification,
  buildAdminNotificationEmail,
  buildAdminNotificationContent,
} from "./templates/AdminSendNotification";

export {
  sendAdminError,
  buildAdminErrorEmail,
  buildAdminErrorContent,
} from "./templates/AdminSendErrorMessage";

export {
  sendUserInquiry,
  buildUserInquiryEmail,
  buildUserInquiryContent,
} from "./templates/UserSendInquiry";

export {
  sendUserNotification,
  buildUserNotificationEmail,
  buildUserNotificationContent,
} from "./templates/UserSendNotification";

export {
  buildInvitationEmail,
  buildVerificationCodeEmail,
  buildPasswordResetEmail,
  buildTemporaryPasswordEmail,
  type InvitationEmailParams,
  type AccountCodeEmailParams,
  type TemporaryPasswordEmailParams,
} from "./templates/AccountEmailTemplates";

export {
  buildQuantityUpdateEmail,
  buildLocationLifecycleEmail,
  type QuantityUpdateEmailData,
  type LocationLifecycleEmailData,
  type LocationLifecycleEmailKind,
} from "./templates/BillingEmailTemplates";

export {
  buildSystemTestEmail,
  type SystemTestEmailData,
} from "./templates/SystemTestEmail";

// Base template utilities (for custom emails)
export {
  wrapInBaseTemplate,
  createButton,
  createSecondaryButton,
  createCard,
  createTag,
  createDivider,
  createCodeCard,
  createList,
  highlight,
  escapeHtml,
  BRAND_COLORS,
  EMAIL_FONT_STACKS,
  LOGO_URL,
  APP_URL,
} from "./templates/base";
