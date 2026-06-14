/**
 * Referral Reward Service
 *
 * Tracks referral signups and applies Stripe rewards when
 * a referred org converts to paid. Both the referrer and
 * the referred org receive one free month.
 *
 * "You both saved a month. We all rise together."
 */

import { isStripeConfigured, getStripe } from "../config/stripe";
import { BehavioralEventModel } from "../models/BehavioralEventModel";
import { NotificationModel } from "../models/NotificationModel";
import { OrganizationModel } from "../models/OrganizationModel";
import { ReferralModel } from "../models/ReferralModel";
import logger from "../lib/logger";

// ---- Track referral signup ----

export async function trackReferralSignup(
  referrerOrgId: number,
  referredOrgId: number,
  referralCode: string
): Promise<void> {
  try {
    const hasTable = await ReferralModel.tableExists();
    if (!hasTable) {
      logger.warn("[Referral] referrals table does not exist, skipping tracking");
      return;
    }

    // Dedupe: don't create duplicate referral records
    const existing = await ReferralModel.findByReferrerAndReferred(
      referrerOrgId,
      referredOrgId
    );
    if (existing) return;

    await ReferralModel.insertPending({
      referrer_org_id: referrerOrgId,
      referred_org_id: referredOrgId,
      referral_code: referralCode,
      referred_at: new Date(),
    });

    // Notify referrer: "[Practice] just ran their checkup using your link."
    try {
      const referredOrg = await OrganizationModel.findNameById(referredOrgId);
      const practiceName = referredOrg?.name || "A new practice";

      await NotificationModel.create({
        organization_id: referrerOrgId,
        title: "Someone used your referral link",
        message: `${practiceName} just ran their checkup using your link.`,
        type: "system",
        metadata: {
          source: "referral_signup",
          referred_org_id: referredOrgId,
        },
      });
    } catch {
      // Non-blocking
    }

    BehavioralEventModel.create({
      event_type: "referral.signup_tracked",
      org_id: referrerOrgId,
      properties: {
        referred_org_id: referredOrgId,
        referral_code: referralCode,
      },
    }).catch(() => {});

    logger.info(
      `[Referral] Tracked signup: referrer=${referrerOrgId}, referred=${referredOrgId}`
    );
  } catch (err: any) {
    logger.error({ err: err.message }, "[Referral] trackReferralSignup error (non-blocking):");
  }
}

// ---- Apply referral reward ----

export async function applyReferralReward(referredOrgId: number): Promise<void> {
  try {
    const hasTable = await ReferralModel.tableExists();
    if (!hasTable) return;

    // Find the pending/signup referral record
    const referral = await ReferralModel.findPendingForReferred(referredOrgId);

    if (!referral) return;

    // Mark as converted
    await ReferralModel.markConverted(referral.id, new Date());

    // Apply Stripe coupons if configured
    if (!isStripeConfigured()) {
      logger.warn("[Referral] Stripe not configured, skipping coupon application");
      await ReferralModel.markRewarded(referral.id, new Date());
      return;
    }

    const stripe = getStripe();

    // Get both orgs
    const referrerOrg = await OrganizationModel.findBillingContextById(
      referral.referrer_org_id
    );
    const referredOrg = await OrganizationModel.findBillingContextById(
      referredOrgId
    );

    // Create a 100% off, 1-month, one-time coupon
    const coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: "once",
      name: `Referral reward: ${referredOrg?.name || "New practice"} joined`,
      metadata: {
        referrer_org_id: String(referral.referrer_org_id),
        referred_org_id: String(referredOrgId),
        referral_id: referral.id,
      },
    });

    // Apply coupon to referrer's subscription
    if (referrerOrg?.stripe_subscription_id) {
      try {
        await stripe.invoiceItems.create({
          customer: referrerOrg.stripe_customer_id,
          amount: -200000,
          currency: "usd",
          description: `Referral reward: ${referredOrg?.name || "a colleague"} joined Alloro`,
        });
      } catch (err: any) {
        logger.error({ err: err.message }, "[Referral] Failed to apply coupon to referrer:");
      }
    }

    // Apply coupon to referred org's subscription
    if (referredOrg?.stripe_subscription_id) {
      try {
        // Need a second coupon for the referred org
        const referredCoupon = await stripe.coupons.create({
          percent_off: 100,
          duration: "once",
          name: `Referral reward: Welcome to Alloro`,
          metadata: {
            referrer_org_id: String(referral.referrer_org_id),
            referred_org_id: String(referredOrgId),
            referral_id: referral.id,
            direction: "referred",
          },
        });
        await stripe.invoiceItems.create({
          customer: referredOrg.stripe_customer_id,
          amount: -200000,
          currency: "usd",
          description: `Welcome to Alloro. Your first month is on us.`,
        });
      } catch (err: any) {
        logger.error({ err: err.message }, "[Referral] Failed to apply coupon to referred org:");
      }
    }

    // Mark as rewarded
    await ReferralModel.markRewarded(referral.id, new Date());

    // Behavioral events for both
    BehavioralEventModel.create({
      event_type: "referral.reward_applied",
      org_id: referral.referrer_org_id,
      properties: {
        referred_org_id: referredOrgId,
        referred_org_name: referredOrg?.name,
        coupon_id: coupon.id,
      },
    }).catch(() => {});

    BehavioralEventModel.create({
      event_type: "referral.reward_applied",
      org_id: referredOrgId,
      properties: {
        referrer_org_id: referral.referrer_org_id,
        referrer_org_name: referrerOrg?.name,
        direction: "referred",
      },
    }).catch(() => {});

    // Notifications for both orgs
    const sharedMessage = "You both saved a month. We all rise together.";

    await NotificationModel.create({
      organization_id: referral.referrer_org_id,
      title: "Referral reward applied",
      message: `${referredOrg?.name || "Your referral"} converted to paid. ${sharedMessage}`,
      type: "system",
      metadata: { source: "referral_reward", referred_org_id: referredOrgId },
    }).catch(() => {});

    await NotificationModel.create({
      organization_id: referredOrgId,
      title: "Welcome reward applied",
      message: `Your referrer gets a free month too. ${sharedMessage}`,
      type: "system",
      metadata: { source: "referral_reward", referrer_org_id: referral.referrer_org_id },
    }).catch(() => {});

    logger.info(
      `[Referral] Reward applied: referrer=${referral.referrer_org_id}, referred=${referredOrgId}`
    );
  } catch (err: any) {
    logger.error({ err: err.message }, "[Referral] applyReferralReward error (non-blocking):");
  }
}

// ---- Get referral stats ----

export interface ReferralStats {
  totalReferred: number;
  totalConverted: number;
  totalRewarded: number;
  monthsSaved: number;
}

export async function getReferralStats(orgId: number): Promise<ReferralStats> {
  try {
    const hasTable = await ReferralModel.tableExists();
    if (!hasTable) {
      return { totalReferred: 0, totalConverted: 0, totalRewarded: 0, monthsSaved: 0 };
    }

    const referrals = await ReferralModel.findStatusesByReferrer(orgId);

    const totalReferred = referrals.length;
    const totalConverted = referrals.filter(
      (r) => r.status === "converted" || r.status === "rewarded"
    ).length;
    const totalRewarded = referrals.filter((r) => r.status === "rewarded").length;
    // Each reward = 1 month saved for the referrer
    const monthsSaved = totalRewarded;

    return { totalReferred, totalConverted, totalRewarded, monthsSaved };
  } catch (err: any) {
    logger.error({ err: err.message }, "[Referral] getReferralStats error:");
    return { totalReferred: 0, totalConverted: 0, totalRewarded: 0, monthsSaved: 0 };
  }
}
