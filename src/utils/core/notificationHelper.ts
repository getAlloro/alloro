import { GoogleConnectionModel } from "../../models/GoogleConnectionModel";
import { NotificationModel } from "../../models/NotificationModel";
import { resolveLocationId } from "../locationResolver";
import { resolveRecipients } from "../../services/recipientSettingsService";

export type NotificationType = "task" | "pms" | "agent" | "system" | "ranking";
import {
  sendUserNotification,
  sendAdminNotification,
  sendAdminError,
  sendUserInquiry,
} from "../../emails";
import type {
  UserNotificationData,
  AdminNotificationData,
  AdminErrorData,
  UserInquiryData,
} from "../../emails";
import logger from "../../lib/logger";

// Use explicit APP_URL environment variable, fallback to production URL by default
const APP_URL =
  process.env.APP_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://app.getalloro.com"
    : "https://app.getalloro.com"); // Default to production URL for safety in emails

/**
 * Map notification types to email notification types
 */
const notificationTypeToEmailType: Record<
  NotificationType,
  UserNotificationData["notificationType"]
> = {
  pms: "pms_job_ready",
  agent: "monthly_report",
  ranking: "ranking_complete",
  task: "task_update",
  system: "system",
};

/**
 * Create a notification for an organization.
 * Also sends an email notification in parallel if user email is available.
 * @param organizationId - The organization to notify
 * @param title - Notification title
 * @param message - Notification message/body
 * @param type - Notification type (default: 'system')
 * @param metadata - Optional metadata object
 * @param options - Optional configuration
 * @returns The notification ID or null if failed
 */
export async function createNotification(
  organizationId: number,
  title: string,
  message?: string,
  type: NotificationType = "system",
  metadata?: any,
  options?: {
    skipEmail?: boolean;
    actionUrl?: string;
    actionLabel?: string;
    locationId?: number | null;
  }
): Promise<number | null> {
  try {
    const locationId = options?.locationId ?? await resolveLocationId(organizationId);

    // Look up account email for email notification
    const account = await GoogleConnectionModel.findFirstByOrganization(
      organizationId
    );

    const notificationId = await NotificationModel.create({
      organization_id: organizationId,
      location_id: locationId,
      title,
      message: message || null,
      type,
      metadata: metadata ?? null,
    });

    // Send email notification in parallel (non-blocking)
    if (!options?.skipEmail) {
      const emailType = notificationTypeToEmailType[type] || "system";
      const emailRecipients =
        type === "agent"
          ? (
              await resolveRecipients({
                organizationId,
                channel: "agent_notifications",
              })
            ).recipients
          : account?.email
            ? [account.email]
            : [];

      // Determine action URL based on notification type
      let actionUrl = options?.actionUrl;
      let actionLabel = options?.actionLabel;

      if (!actionUrl) {
        switch (type) {
          case "pms":
            actionUrl = `${APP_URL}/dashboard?tab=referrals`;
            actionLabel = "View Referral Data";
            break;
          case "agent":
            actionUrl = `${APP_URL}/dashboard`;
            actionLabel = "View Dashboard";
            break;
          case "ranking":
            actionUrl = `${APP_URL}/rankings`;
            actionLabel = "View Rankings";
            break;
          case "task":
            actionUrl = `${APP_URL}/dashboard`;
            actionLabel = "Open Dashboard";
            break;
          default:
            actionUrl = `${APP_URL}/dashboard`;
            actionLabel = "Open Dashboard";
        }
      }

      if (emailRecipients.length > 0) {
        const recipientName =
          account?.practice_name || account?.domain_name || "Practice";

        // Fire and forget - don't await, don't block
        Promise.all(
          emailRecipients.map((recipientEmail) =>
            sendUserNotification({
              recipientEmail,
              recipientName,
              notificationType: emailType,
              title,
              message: message || "",
              actionUrl,
              actionLabel,
              metadata: metadata || {},
            })
          )
        ).catch((err) => {
          logger.error(
            `[NotificationHelper] Failed to send user email for org ${organizationId}: ${err.message}`
          );
        });
      }
    }

    return notificationId;
  } catch (error) {
    logger.error({ err: error }, `[NotificationHelper] Failed to create notification:`);
    return null;
  }
}

/**
 * Send admin email notification
 * Used for internal team notifications (PMS ready for review, errors, etc.)
 * @param data - Admin notification data
 * @returns Email result
 */
export async function notifyAdmins(data: AdminNotificationData) {
  try {
    const result = await sendAdminNotification(data);
    if (!result.success) {
      logger.error({ err: result.error }, `[NotificationHelper] Admin notification failed:`);
    }
    return result;
  } catch (error: any) {
    logger.error({ err: error.message }, `[NotificationHelper] Admin notification error:`);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Send admin error alert
 * Used when system errors occur that need admin attention
 * @param data - Error data
 * @returns Email result
 */
export async function notifyAdminsOfError(data: AdminErrorData) {
  try {
    const result = await sendAdminError(data);
    if (!result.success) {
      logger.error({ err: result.error }, `[NotificationHelper] Admin error notification failed:`);
    }
    return result;
  } catch (error: any) {
    logger.error({ err: error.message }, `[NotificationHelper] Admin error notification error:`);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Forward user inquiry to admin team
 * Used when a user submits a support request via help form
 * @param data - User inquiry data
 * @returns Email result
 */
export async function forwardUserInquiry(data: UserInquiryData) {
  try {
    const result = await sendUserInquiry(data);
    if (!result.success) {
      logger.error({ err: result.error }, `[NotificationHelper] User inquiry forward failed:`);
    }
    return result;
  } catch (error: any) {
    logger.error({ err: error.message }, `[NotificationHelper] User inquiry forward error:`);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Notify admins when PMS parser output is ready for review
 * Trigger: When n8n webhook completes processing
 */
export async function notifyAdminsPmsReady(domain: string, _jobId: number) {
  return notifyAdmins({
    summary: `PMS parser output is ready for review for ${domain}`,
    practiceRankingsCompleted: [],
    monthlyAgentsCompleted: [],
  });
}

/**
 * Notify admins when monthly agents complete
 * Trigger: After all monthly agents finish successfully
 */
export async function notifyAdminsMonthlyAgentComplete(practiceName: string) {
  return notifyAdmins({
    summary: `Monthly insight generation completed for ${practiceName}. Summary and Referral Engine results are ready for review.`,
    monthlyAgentsCompleted: [
      { practiceName, agentType: "Summary", status: "completed" },
      {
        practiceName,
        agentType: "Referral Engine",
        status: "completed",
      },
    ],
  });
}

/**
 * Notify admins when practice ranking completes
 * Trigger: After ranking batch analysis finishes
 */
export async function notifyAdminsRankingComplete(
  domain: string,
  batchId: string,
  locationCount: number,
  avgScore: number | null
) {
  const scoreText = avgScore ? `Average score: ${avgScore.toFixed(1)}` : "";

  return notifyAdmins({
    summary: `Practice ranking analysis completed for ${domain}. ${locationCount} location(s) analyzed. ${scoreText}`,
    practiceRankingsCompleted: [
      {
        practiceName: domain,
        locationName: `${locationCount} location(s)`,
        rankScore: avgScore || 0,
        rankPosition: 0,
      },
    ],
  });
}
