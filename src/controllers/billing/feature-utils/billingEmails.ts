/**
 * Billing notification emails shared by the quantity-sync path and the
 * paid location-add path. Extracted verbatim from BillingService.
 * syncSubscriptionQuantity's inline template so both flows send the same
 * email. Best-effort senders — they log and never throw.
 */

import { IOrganization } from "../../../models/OrganizationModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { sendEmail } from "../../../emails/emailService";
import logger from "../../../lib/logger";

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
      body: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
          <h2 style="color: #1a1a1a;">Subscription Updated</h2>
          <p style="color: #4a5568; font-size: 16px;">
            A location was ${direction} for <strong>${org.name}</strong>, and your subscription has been automatically adjusted.
          </p>
          <div style="background: #f7f7f7; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 4px 0; color: #4a5568;">Previous: <strong>${oldQuantity}</strong> ${oldQuantity === 1 ? "location" : "locations"} × $${unitPrice}/mo</p>
            <p style="margin: 4px 0; color: #4a5568;">Updated: <strong>${newQuantity}</strong> ${newQuantity === 1 ? "location" : "locations"} × $${unitPrice}/mo</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 12px 0;" />
            <p style="margin: 4px 0; color: #1a1a1a; font-weight: bold;">New monthly total: $${newTotal}/mo</p>
          </div>
          <p style="color: #718096; font-size: 14px;">
            Any price difference for the current billing period will be prorated on your next invoice.
          </p>
        </div>
      `,
      recipients: adminEmails,
    });
  } catch (emailErr) {
    logger.warn(
      { detail: emailErr },
      `[Billing] Failed to send quantity update email for org ${org.id}:`
    );
  }
}

export type LocationLifecycleEmailKind =
  | "cancel_scheduled"
  | "cancelled_immediately"
  | "subscription_ending"
  | "reopened";

const LIFECYCLE_COPY: Record<
  LocationLifecycleEmailKind,
  (locationName: string, effectiveDate: string | null) => string
> = {
  cancel_scheduled: (name, date) =>
    `<strong>${name}</strong> is scheduled to be cancelled${date ? ` on <strong>${date}</strong>` : ""}. It stays fully active until then, and you can reopen it any time before that date at no charge.`,
  cancelled_immediately: (name) =>
    `<strong>${name}</strong> has been cancelled. Its data is retained and it can be reopened at any time.`,
  subscription_ending: (name, date) =>
    `<strong>${name}</strong> was your last active location, so your Alloro subscription is scheduled to end${date ? ` on <strong>${date}</strong>` : ""}. Reopening the location before then keeps your subscription running.`,
  reopened: (name) =>
    `<strong>${name}</strong> has been reopened and is active again.`,
};

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
      body: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
          <h2 style="color: #1a1a1a;">Location Update</h2>
          <p style="color: #4a5568; font-size: 16px;">
            ${LIFECYCLE_COPY[kind](locationName, effectiveDate)}
          </p>
          <p style="color: #718096; font-size: 14px;">
            Manage your locations any time in Settings → Properties.
          </p>
        </div>
      `,
      recipients: adminEmails,
    });
  } catch (emailErr) {
    logger.warn(
      { detail: emailErr },
      `[Billing] Failed to send location lifecycle email for org ${org.id}:`
    );
  }
}
