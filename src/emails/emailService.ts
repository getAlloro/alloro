/**
 * Email Service
 *
 * Central email service that sends emails via n8n webhook.
 * All email operations are logged to src/logs/email.log
 */

import axios from "axios";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import type { EmailPayload, EmailResult, SendEmailOptions } from "./types";
import { interceptEmailPayload } from "./emailInterceptor";
import logger from "../lib/logger";

dotenv.config();

// Configuration
const WEBHOOK_URL = process.env.ALLORO_EMAIL_SERVICE_WEBHOOK || "";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);
const DEFAULT_FROM_EMAIL = "info@getalloro.com";
const DEFAULT_FROM_NAME = "Alloro";

// Log file path
const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "email.log");

/**
 * Ensure log directory exists
 */
function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Log email operation to file
 */
function logEmail(
  level: "INFO" | "ERROR" | "WARN",
  message: string,
  data?: Record<string, any>
): void {
  ensureLogDir();

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
  };

  const logLine = `[${timestamp}] [${level}] ${message} ${
    data ? JSON.stringify(data) : ""
  }\n`;

  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (error) {
    logger.error({ err: error }, "[EMAIL SERVICE] Failed to write to log file:");
  }

  // Also log to console in development
  if (process.env.NODE_ENV !== "production") {
    if (level === "ERROR") {
      logger.error({ err: data || "" }, `[EMAIL] ${message}`);
    } else {
      logger.info({ detail: data || "" }, `[EMAIL] ${message}`);
    }
  }
}

/**
 * Get admin email addresses from environment
 */
export function getAdminEmails(): string[] {
  if (ADMIN_EMAILS.length === 0) {
    logEmail(
      "WARN",
      "No admin emails configured in ADMIN_EMAILS environment variable"
    );
  }
  return ADMIN_EMAILS;
}

/**
 * Validate email payload
 */
function validatePayload(payload: SendEmailOptions): string[] {
  const errors: string[] = [];

  if (!payload.subject || payload.subject.trim() === "") {
    errors.push("Subject is required");
  }

  if (!payload.body || payload.body.trim() === "") {
    errors.push("Body is required");
  }

  if (!payload.recipients || payload.recipients.length === 0) {
    errors.push("At least one recipient is required");
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  payload.recipients?.forEach((email, index) => {
    if (!emailRegex.test(email)) {
      errors.push(
        `Invalid email format for recipient at index ${index}: ${email}`
      );
    }
  });

  return errors;
}

/**
 * Send email via n8n webhook
 */
export async function sendEmail(
  options: SendEmailOptions
): Promise<EmailResult> {
  const timestamp = new Date().toISOString();

  // Check webhook configuration
  if (!WEBHOOK_URL) {
    const error = "ALLORO_EMAIL_SERVICE_WEBHOOK not configured";
    logEmail("ERROR", error, { recipients: options.recipients });
    return {
      success: false,
      error,
      timestamp,
    };
  }

  // Validate payload
  const validationErrors = validatePayload(options);
  if (validationErrors.length > 0) {
    const error = `Validation failed: ${validationErrors.join(", ")}`;
    logEmail("ERROR", error, {
      subject: options.subject,
      recipients: options.recipients,
      validationErrors,
    });
    return {
      success: false,
      error,
      timestamp,
    };
  }

  // Prepare webhook payload
  const builtPayload: EmailPayload & { from: string; fromName: string } = {
    subject: options.subject,
    body: options.body,
    recipients: options.recipients,
    cc: options.cc || [],
    bcc: options.bcc || [],
    from: options.from || DEFAULT_FROM_EMAIL,
    fromName: options.fromName || DEFAULT_FROM_NAME,
  };

  // Non-production senders get every email rerouted to the intercept
  // recipient (fail closed) — see emailInterceptor.ts. OTP login codes
  // opt out via allowLiveSend so the code always reaches the requester,
  // even on dev/local/CI (user-ratified — see plan 06122026).
  const { payload, intercepted, originalRecipients } = options.allowLiveSend
    ? {
        payload: builtPayload,
        intercepted: false,
        originalRecipients: builtPayload.recipients,
      }
    : await interceptEmailPayload(builtPayload);

  if (intercepted) {
    logEmail("INFO", "Email intercepted (non-production sender)", {
      subject: options.subject,
      originalRecipients,
    });
  }

  logEmail("INFO", "Sending email via webhook", {
    subject: payload.subject,
    recipientCount: payload.recipients.length,
    hasCC: (payload.cc?.length || 0) > 0,
    hasBCC: (payload.bcc?.length || 0) > 0,
  });

  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const messageId =
      response.data?.messageId || response.data?.id || `msg_${Date.now()}`;

    logEmail("INFO", "Email sent successfully", {
      messageId,
      subject: payload.subject,
      recipients: payload.recipients,
      status: response.status,
    });

    return {
      success: true,
      messageId,
      timestamp,
    };
  } catch (error: any) {
    const errorMessage =
      error.response?.data?.message || error.message || "Unknown error";

    logEmail("ERROR", "Failed to send email", {
      error: errorMessage,
      subject: payload.subject,
      recipients: payload.recipients,
      status: error.response?.status,
      responseData: error.response?.data,
    });

    return {
      success: false,
      error: errorMessage,
      timestamp,
    };
  }
}

/**
 * Send email to all admin addresses
 */
export async function sendToAdmins(
  subject: string,
  body: string,
  options?: { cc?: string[]; bcc?: string[] }
): Promise<EmailResult> {
  const adminEmails = getAdminEmails();

  if (adminEmails.length === 0) {
    return {
      success: false,
      error: "No admin emails configured",
      timestamp: new Date().toISOString(),
    };
  }

  return sendEmail({
    subject,
    body,
    recipients: adminEmails,
    cc: options?.cc,
    bcc: options?.bcc,
  });
}

/**
 * Get email log entries (for debugging/monitoring)
 */
export function getEmailLogs(limit: number = 100): string[] {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }

    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    return lines.slice(-limit);
  } catch (error) {
    logger.error({ err: error }, "[EMAIL SERVICE] Failed to read log file:");
    return [];
  }
}

/**
 * Clear email logs (for maintenance)
 */
export function clearEmailLogs(): boolean {
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, "");
      logEmail("INFO", "Email logs cleared");
    }
    return true;
  } catch (error) {
    logger.error({ err: error }, "[EMAIL SERVICE] Failed to clear log file:");
    return false;
  }
}

// Export configuration for testing
export const config = {
  webhookUrl: WEBHOOK_URL,
  adminEmails: ADMIN_EMAILS,
  fromEmail: DEFAULT_FROM_EMAIL,
  fromName: DEFAULT_FROM_NAME,
  logFile: LOG_FILE,
};
