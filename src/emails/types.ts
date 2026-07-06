/**
 * Email Types and Interfaces
 *
 * Defines the structure for the Alloro email service.
 */

export interface EmailPayload {
  subject: string;
  body: string; // HTML content
  recipients: string[];
  cc?: string[];
  bcc?: string[];
}

/**
 * Logical category for an outbound email, recorded on every email_logs row and
 * used by the internal Email Logs dashboard. Set explicitly at each call site;
 * defaults to "uncategorized" when omitted.
 */
export type EmailCategory =
  | "auth"
  | "account"
  | "billing"
  | "support"
  | "notification"
  | "leadgen"
  | "website_form"
  | "system"
  | "uncategorized";

export interface SendEmailOptions {
  /** Email subject line */
  subject: string;
  /** HTML body content */
  body: string;
  /** Primary recipients */
  recipients: string[];
  /** Optional sender email override */
  from?: string;
  /** Optional sender display name override */
  fromName?: string;
  /** CC recipients */
  cc?: string[];
  /** BCC recipients */
  bcc?: string[];
  /** Preheader text (for email previews) */
  preheader?: string;
  /**
   * Bypass the email interceptor and send live in every environment.
   * Reserved for OTP login codes so the requester always receives their
   * code on dev/local/CI. Do not set this on any other email path.
   */
  allowLiveSend?: boolean;
  /**
   * Logical category recorded on the email_logs row for the admin dashboard.
   * Defaults to "uncategorized" when omitted.
   */
  category?: EmailCategory;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: string;
}

export interface AdminNotificationData {
  newActionItems?: number;
  practiceRankingsCompleted?: Array<{
    practiceName: string;
    locationName: string;
    rankScore: number;
    rankPosition: number;
  }>;
  monthlyAgentsCompleted?: Array<{
    practiceName: string;
    agentType: string;
    status: string;
  }>;
  summary?: string;
}

export interface AdminErrorData {
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  context?: Record<string, any>;
  timestamp: string;
  environment: string;
}

export interface UserInquiryData {
  userName: string;
  userEmail: string;
  practiceName?: string;
  subject: string;
  message: string;
}

export interface UserNotificationData {
  recipientName?: string;
  recipientEmail: string;
  notificationType:
    | "pms_job_ready"
    | "ranking_complete"
    | "monthly_report"
    | "task_update"
    | "system";
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, any>;
}

// Email template metadata
export interface EmailTemplate {
  name: string;
  description: string;
  requiredFields: string[];
}

// Registered templates
export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  ADMIN_NOTIFICATION: {
    name: "AdminSendNotification",
    description: "Notify admins of new action items, completed rankings, etc.",
    requiredFields: ["summary"],
  },
  ADMIN_ERROR: {
    name: "AdminSendErrorMessage",
    description: "Send error snapshots to admin team",
    requiredFields: ["errorType", "errorMessage", "timestamp"],
  },
  USER_INQUIRY: {
    name: "UserSendInquiry",
    description: "Forward user inquiries to admin team",
    requiredFields: ["userName", "userEmail", "subject", "message"],
  },
  USER_NOTIFICATION: {
    name: "UserSendNotification",
    description:
      "Send notifications to users in parallel with in-app notifications",
    requiredFields: ["recipientEmail", "notificationType", "title", "message"],
  },
};
