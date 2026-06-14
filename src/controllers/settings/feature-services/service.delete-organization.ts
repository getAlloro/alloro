/**
 * Delete Organization Service
 *
 * Permanently deletes an organization and all related data.
 * FK CASCADE handles most cleanup; this service handles:
 * 1. Stripe subscription cancellation
 * 2. Google OAuth token revocation
 * 3. Orphaned user cleanup
 */
import { db } from "../../../database/connection";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { getStripe, isStripeConfigured } from "../../../config/stripe";
import axios from "axios";
import logger from "../../../lib/logger";

export async function deleteOrganization(organizationId: number): Promise<void> {
  const org = await OrganizationModel.findById(organizationId);
  if (!org) {
    const err: any = new Error("Organization not found");
    err.statusCode = 404;
    throw err;
  }

  // 1. Cancel Stripe subscription (best-effort, don't block on failure)
  if (org.stripe_subscription_id && isStripeConfigured()) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.cancel(org.stripe_subscription_id);
      logger.info(
        `[DeleteOrg] Cancelled Stripe subscription ${org.stripe_subscription_id} for org ${organizationId}`
      );
    } catch (stripeErr) {
      logger.warn({ err: (stripeErr as Error).message }, `[DeleteOrg] Failed to cancel Stripe subscription for org ${organizationId}:`);
    }
  }

  // 2. Revoke Google OAuth tokens (best-effort, don't block on failure)
  const connections = await GoogleConnectionModel.findByOrganization(organizationId);
  for (const conn of connections) {
    try {
      if (conn.refresh_token) {
        await axios.post(
          `https://oauth2.googleapis.com/revoke?token=${conn.refresh_token}`
        );
      }
    } catch (revokeErr) {
      logger.warn({ err: (revokeErr as Error).message }, `[DeleteOrg] Failed to revoke token for connection ${conn.id}:`);
    }
  }

  // 3. Delete the organization — CASCADE handles all FK-linked tables
  const trx = await db.transaction();
  try {
    // Delete the organization — CASCADE handles all FK-linked tables:
    //    locations, google_connections, google_properties, user_locations,
    //    organization_users, invitations, agent_results, tasks,
    //    practice_rankings, pms_jobs, notifications, website_builder.projects,
    //    website_builder.user_edits
    await trx("organizations").where({ id: organizationId }).del();

    // 4. Clean up orphaned users (users who no longer belong to any organization)
    await trx.raw(`
      DELETE FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM organization_users ou WHERE ou.user_id = u.id
      )
    `);

    await trx.commit();

    logger.info(
      `[DeleteOrg] Organization "${org.name}" (id=${organizationId}) deleted successfully.`
    );
  } catch (err) {
    await trx.rollback();
    throw err;
  }
}
