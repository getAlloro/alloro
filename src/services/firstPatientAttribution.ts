/**
 * First Patient Attribution (U-NEW-3)
 *
 * Tracks when someone finds a business through Alloro:
 * - Checkup share links with refCode
 * - PatientPath websites
 * - Programmatic SEO pages
 *
 * When a checkup is completed with a refCode that maps to an existing org,
 * writes a behavioral_event "patient.attributed" and creates a notification.
 */

import { BehavioralEventModel } from "../models/BehavioralEventModel";
import { OrganizationModel } from "../models/OrganizationModel";
import { createNotification } from "../utils/core/notificationHelper";
import logger from "../lib/logger";

export interface AttributionResult {
  attributed: boolean;
  orgId?: number;
  orgName?: string;
  reason?: string;
}

/**
 * Attempt to attribute a checkup completion to a referring org.
 *
 * Called from the checkup track endpoint when ref_code is present
 * in the event properties. Fire-and-forget: never blocks the user flow.
 */
export async function attributeCheckupToOrg(
  refCode: string,
  sessionId?: string | null,
  properties?: Record<string, unknown>,
): Promise<AttributionResult> {
  if (!refCode || refCode.length < 6) {
    return { attributed: false, reason: "Invalid ref code" };
  }

  const normalizedCode = refCode.toUpperCase();

  // Look up the org that owns this referral code
  const org = await OrganizationModel.findByReferralCode(normalizedCode);
  if (!org) {
    return { attributed: false, reason: "No org found for ref code" };
  }

  // Deduplicate: check if this session already attributed
  if (sessionId) {
    const existing = await BehavioralEventModel.findFirstByTypeAndSession(
      "patient.attributed",
      sessionId
    );

    if (existing) {
      return { attributed: false, reason: "Session already attributed" };
    }
  }

  // Write the attribution event
  await BehavioralEventModel.create({
    event_type: "patient.attributed",
    org_id: org.id,
    session_id: sessionId || null,
    properties: {
      ref_code: normalizedCode,
      source: "checkup_share_link",
      practice_name: properties?.practice_name || null,
      city: properties?.city || null,
      specialty: properties?.specialty || null,
      attributed_at: new Date().toISOString(),
    },
  });

  // Check how many attributions this org has this week
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weeklyCount = await BehavioralEventModel.countByTypeAndOrgSince(
    "patient.attributed",
    org.id,
    weekStart
  );

  const count = Number(weeklyCount?.count ?? 1);

  // Create a notification for the org owner
  const orgName = org.name || "your business";
  const notificationTitle =
    count <= 1
      ? `Someone found ${orgName} through Alloro this week`
      : `${count} people found ${orgName} through Alloro this week`;

  const notificationMessage =
    "Your online presence is working. People are discovering your business through the visibility Alloro builds for you.";

  await createNotification(
    org.id,
    notificationTitle,
    notificationMessage,
    "system",
    {
      event: "patient.attributed",
      ref_code: normalizedCode,
      weekly_count: count,
      source: "checkup_share_link",
    },
    { skipEmail: true },
  ).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, `[FirstPatientAttribution] Failed to create notification for org ${org.id}:`);
  });

  logger.info(
    `[FirstPatientAttribution] Attributed checkup to org ${org.id} (${orgName}) via ref ${normalizedCode}`,
  );

  return { attributed: true, orgId: org.id, orgName };
}
