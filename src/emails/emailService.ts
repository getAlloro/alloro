import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import type {
  EmailCategory,
  EmailPayload,
  EmailResult,
  EmailTransport,
  MailgunMessage,
  SendEmailOptions,
} from "./types";
import { interceptEmailPayload } from "./emailInterceptor";
import { EmailLogModel } from "../models/EmailLogModel";
import { sendViaMailgun } from "./transport/mailgunTransport";
import { sendViaN8n } from "./transport/n8nTransport";
import logger from "../lib/logger";

const IS_WORKTREE_TEST_MODE =
  process.env.ALLORO_WORKTREE_TEST_MODE === "true";
if (!IS_WORKTREE_TEST_MODE) {
  dotenv.config();
}

const WEBHOOK_URL = process.env.ALLORO_EMAIL_SERVICE_WEBHOOK || "";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);
const DEFAULT_FROM_EMAIL = "info@getalloro.com";
const DEFAULT_FROM_NAME = "Alloro";

export function resolveTransport(): EmailTransport {
  const explicit = process.env.EMAIL_DEFAULT_TRANSPORT;
  if (explicit === "mailgun" || explicit === "n8n") return explicit;
  if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN)
    return "mailgun";
  return "n8n";
}

function normalizeMessageId(id?: string | null): string | null {
  if (!id) return null;
  return id.replace(/[<>]/g, "").trim() || null;
}

function resolveLogDirectory(): string {
  if (!IS_WORKTREE_TEST_MODE) {
    return path.join(__dirname, "..", "logs");
  }

  const configured = process.env.ALLORO_EMAIL_LOG_DIR;
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error(
      "ALLORO_EMAIL_LOG_DIR must be an absolute path in worktree test mode.",
    );
  }
  return configured;
}

// Log file path
const LOG_DIR = resolveLogDirectory();
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
 * Best-effort write of one email_logs row. Never throws — a logging failure
 * must never fail or delay the actual send (plan Risk mitigation). Called
 * from both the success and failure branches of sendEmail.
 */
async function recordEmailLog(params: {
  category: EmailCategory;
  payload: EmailPayload & { from: string; fromName: string };
  intercepted: boolean;
  originalRecipients: string[];
  status: "sent" | "failed";
  providerMessageId: string | null;
  error: string | null;
}): Promise<void> {
  try {
    await EmailLogModel.createLog({
      category: params.category,
      status: params.status,
      from_email: params.payload.from,
      from_name: params.payload.fromName,
      recipients: params.payload.recipients,
      cc: params.payload.cc ?? [],
      bcc: params.payload.bcc ?? [],
      subject: params.payload.subject,
      body_html: params.payload.body,
      provider_message_id: params.providerMessageId,
      intercepted: params.intercepted,
      original_recipients: params.intercepted ? params.originalRecipients : null,
      error: params.error,
    });
  } catch (err) {
    logEmail("WARN", "Failed to write email_logs row (send unaffected)", {
      error: err instanceof Error ? err.message : String(err),
      subject: params.payload.subject,
    });
  }
}

export async function sendEmail(
  options: SendEmailOptions
): Promise<EmailResult> {
  const timestamp = new Date().toISOString();
  const transport = resolveTransport();

  if (transport === "n8n" && !WEBHOOK_URL) {
    const error = "ALLORO_EMAIL_SERVICE_WEBHOOK not configured";
    logEmail("ERROR", error, { recipients: options.recipients });
    return { success: false, error, timestamp };
  }

  const validationErrors = validatePayload(options);
  if (validationErrors.length > 0) {
    const error = `Validation failed: ${validationErrors.join(", ")}`;
    logEmail("ERROR", error, {
      subject: options.subject,
      recipients: options.recipients,
      validationErrors,
    });
    return { success: false, error, timestamp };
  }

  const builtPayload: EmailPayload & { from: string; fromName: string } = {
    subject: options.subject,
    body: options.body,
    recipients: options.recipients,
    cc: options.cc || [],
    bcc: options.bcc || [],
    from: options.from || DEFAULT_FROM_EMAIL,
    fromName: options.fromName || DEFAULT_FROM_NAME,
  };

  const { payload, intercepted, originalRecipients } =
    options.allowLiveSend && !IS_WORKTREE_TEST_MODE
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

  logEmail("INFO", `Sending email via ${transport}`, {
    subject: payload.subject,
    recipientCount: payload.recipients.length,
    hasCC: (payload.cc?.length || 0) > 0,
    hasBCC: (payload.bcc?.length || 0) > 0,
  });

  const result =
    transport === "mailgun"
      ? await sendViaMailgun(toMailgunMessage(payload))
      : await sendViaN8n(WEBHOOK_URL, {
          subject: payload.subject,
          body: payload.body,
          recipients: payload.recipients,
          cc: payload.cc ?? [],
          bcc: payload.bcc ?? [],
          from: payload.from,
          fromName: payload.fromName,
        });

  if (result.success) {
    const messageId = result.messageId || `msg_${Date.now()}`;

    logEmail("INFO", `Email sent successfully via ${transport}`, {
      messageId,
      subject: payload.subject,
      recipients: payload.recipients,
      status: result.status,
    });

    await recordEmailLog({
      category: options.category ?? "uncategorized",
      payload,
      intercepted,
      originalRecipients,
      status: "sent",
      providerMessageId: normalizeMessageId(result.messageId),
      error: null,
    });

    return { success: true, messageId, timestamp };
  }

  logEmail("ERROR", `Failed to send email via ${transport}`, {
    error: result.error,
    subject: payload.subject,
    recipients: payload.recipients,
    status: result.status,
  });

  await recordEmailLog({
    category: options.category ?? "uncategorized",
    payload,
    intercepted,
    originalRecipients,
    status: "failed",
    providerMessageId: null,
    error: result.error ?? "Unknown transport error",
  });

  return { success: false, error: result.error, timestamp };
}

function toMailgunMessage(
  payload: EmailPayload & { from: string; fromName: string }
): MailgunMessage {
  const from = payload.fromName
    ? `${payload.fromName} <${payload.from}>`
    : payload.from;
  return {
    from,
    to: payload.recipients,
    cc: payload.cc,
    bcc: payload.bcc,
    subject: payload.subject,
    html: payload.body,
  };
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
    category: "notification",
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
