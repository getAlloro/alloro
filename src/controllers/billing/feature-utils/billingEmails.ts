/**
 * Billing notification emails shared by the quantity-sync path and the
 * paid location-add path. Extracted verbatim from BillingService.
 * syncSubscriptionQuantity's inline template so both flows send the same
 * email. Best-effort senders — they log and never throw.
 */

import { IOrganization } from "../../../models/OrganizationModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { sendEmail } from "../../../emails/emailService";
import {
  buildLocationLifecycleEmail,
  buildQuantityUpdateEmail,
} from "../../../emails/templates/BillingEmailTemplates";
import type { LocationLifecycleEmailKind } from "../../../emails/templates/BillingEmailTemplates";
import logger from "../../../lib/logger";

export type { LocationLifecycleEmailKind } from "../../../emails/templates/BillingEmailTemplates";

/**
 * Notify org admins that the subscription quantity changed.
 * @param unitAmountCents - per-location price in cents (null → shown as "—")
 */
export async function sendQuantityUpdateEmail(
  org: IOrganization,
  oldQuantity: number,
  newQuantity: number,
  unitAmountCents: number | null
): Promise<void> {
  try {
    const orgUsers = await OrganizationUserModel.listByOrgWithUsers(org.id);
    const adminEmails = orgUsers
      .filter((u) => u.role === "admin")
      .map((u) => u.email)
      .filter(Boolean);

    if (adminEmails.length === 0) return;

    const unitPrice =
      unitAmountCents != null ? (unitAmountCents / 100).toFixed(0) : "—";
    const newTotal =
      unitAmountCents != null
        ? ((unitAmountCents / 100) * newQuantity).toLocaleString()
        : "—";
    const direction = newQuantity > oldQuantity ? "added" : "removed";

    await sendEmail({
      category: "billing",
      subject: `Your Alloro subscription has been updated`,
      body: buildQuantityUpdateEmail({
        organizationName: org.name,
        direction,
        oldQuantity,
        newQuantity,
        unitPrice,
        newTotal,
      }),
      recipients: adminEmails,
    });
  } catch (emailErr) {
    logger.warn(
      { detail: emailErr },
      `[Billing] Failed to send quantity update email for org ${org.id}:`
    );
  }
}

/**
 * Notify org admins about a location lifecycle change (cancel / reopen).
 * Best-effort — logs and never throws.
 */
export async function sendLocationLifecycleEmail(
  org: IOrganization,
  locationName: string,
  kind: LocationLifecycleEmailKind,
  effectiveAt: Date | null
): Promise<void> {
  try {
    const orgUsers = await OrganizationUserModel.listByOrgWithUsers(org.id);
    const adminEmails = orgUsers
      .filter((u) => u.role === "admin")
      .map((u) => u.email)
      .filter(Boolean);
    if (adminEmails.length === 0) return;

    const effectiveDate = effectiveAt
      ? effectiveAt.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : null;

    await sendEmail({
      category: "billing",
      subject: `Location update for ${org.name}`,
      body: buildLocationLifecycleEmail({
        locationName,
        kind,
        effectiveDate,
      }),
      recipients: adminEmails,
    });
  } catch (emailErr) {
    logger.warn(
      { detail: emailErr },
      `[Billing] Failed to send location lifecycle email for org ${org.id}:`
    );
  }
}
