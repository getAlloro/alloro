/**
 * Referral Reward Service
 *
 * Tracks referral signups and applies Stripe rewards when
 * a referred org converts to paid. Both the referrer and
 * the referred org receive one free month.
 *
 * "You both saved a month. We all rise together."
 */

import { db } from "../database/connection";
import { isStripeConfigured, getStripe } from "../config/stripe";
import { BehavioralEventModel } from "../models/BehavioralEventModel";

// ---- Track referral signup ----

export async function trackReferralSignup(
  referrerOrgId: number,
  referredOrgId: number,
  referralCode: string
): Promise<void> {
  try {
    const hasTable = await db.schema.hasTable("referrals");
    if (!hasTable) {
      console.warn("[Referral] referrals table does not exist, skipping tracking");
      return;
    }

    // Dedupe: don't create duplicate referral records
    const existing = await db("referrals")
      .where({ referrer_org_id: referrerOrgId, referred_org_id: referredOrgId })
      .first();
    if (existing) return;

    await db("referrals").insert({
      referrer_org_id: referrerOrgId,
      referred_org_id: referredOrgId,
      referral_code: referralCode,
      status: "pending",
      referred_at: new Date(),
    });

    // Notify referrer: "[Practice] just ran their checkup using your link."
    try {
      const referredOrg = await db("organizations")
        .where({ id: referredOrgId })
        .select("name")
        .first();
      const practiceName = referredOrg?.name || "A new practice";

      await db("notifications").insert({
        organization_id: referrerOrgId,
        title: "Someone used your referral link",
        message: `${practiceName} just ran their checkup using your link.`,
        type: "system",
        read: false,
        metadata: JSON.stringify({
          source: "referral_signup",
          referred_org_id: referredOrgId,
        }),
        created_at: new Date(),
        updated_at: new Date(),
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

    console.log(
      `[Referral] Tracked signup: referrer=${referrerOrgId}, referred=${referredOrgId}`
    );
  } catch (err: any) {
    console.error("[Referral] trackReferralSignup error (non-blocking):", err.message);
  }
}

// ---- Apply referral reward ----

export async function applyReferralReward(referredOrgId: number): Promise<void> {
  try {
    const hasTable = await db.schema.hasTable("referrals");
    if (!hasTable) return;

    // Find the pending/signup referral record
    const referral = await db("referrals")
      .where({ referred_org_id: referredOrgId })
      .whereIn("status", ["pending", "signup"])
      .first();

    if (!referral) return;

    // Mark as converted
    await db("referrals")
      .where({ id: referral.id })
      .update({ status: "converted", converted_at: new Date() });

    // Apply Stripe coupons if configured
    if (!isStripeConfigured()) {
      console.warn("[Referral] Stripe not configured, skipping coupon application");
      await db("referrals")
        .where({ id: referral.id })
        .update({ status: "rewarded", reward_applied_at: new Date() });
      return;
    }

    const stripe = getStripe();

    // Get both orgs
    const referrerOrg = await db("organizations")
      .where({ id: referral.referrer_org_id })
      .select("id", "name", "stripe_customer_id", "stripe_subscription_id")
      .first();
    const referredOrg = await db("organizations")
      .where({ id: referredOrgId })
      .select("id", "name", "stripe_customer_id", "stripe_subscription_id")
      .first();

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

    // Wave 3 C1: attach the 100%-off one-month coupon to the referrer's
    // subscription. The coupon (percent_off:100, duration:once) IS the credit
    // mechanism, so there is no hardcoded invoice item and no plan-dependent
    // dollar amount. Stripe applies the discount on the referrer's next invoice.
    if (referrerOrg?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.update(referrerOrg.stripe_subscription_id, {
          discounts: [{ coupon: coupon.id }],
        });
      } catch (err: any) {
        console.error("[Referral] Failed to attach referral coupon to referrer:", err.message);
      }
    }

    // Wave 3 C1: a second 100%-off one-month coupon for the referred org's own
    // welcome month, attached to their subscription as a discount. No invoice item.
    if (referredOrg?.stripe_subscription_id) {
      try {
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
        await stripe.subscriptions.update(referredOrg.stripe_subscription_id, {
          discounts: [{ coupon: referredCoupon.id }],
        });
      } catch (err: any) {
        console.error("[Referral] Failed to attach welcome coupon to referred org:", err.message);
      }
    }

    // Mark as rewarded
    await db("referrals")
      .where({ id: referral.id })
      .update({ status: "rewarded", reward_applied_at: new Date() });

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

    await db("notifications")
      .insert({
        organization_id: referral.referrer_org_id,
        title: "Referral reward applied",
        message: `${referredOrg?.name || "Your referral"} converted to paid. ${sharedMessage}`,
        type: "system",
        read: false,
        metadata: JSON.stringify({ source: "referral_reward", referred_org_id: referredOrgId }),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .catch(() => {});

    await db("notifications")
      .insert({
        organization_id: referredOrgId,
        title: "Welcome reward applied",
        message: `Your referrer gets a free month too. ${sharedMessage}`,
        type: "system",
        read: false,
        metadata: JSON.stringify({ source: "referral_reward", referrer_org_id: referral.referrer_org_id }),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .catch(() => {});

    console.log(
      `[Referral] Reward applied: referrer=${referral.referrer_org_id}, referred=${referredOrgId}`
    );
  } catch (err: any) {
    console.error("[Referral] applyReferralReward error (non-blocking):", err.message);
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
    const hasTable = await db.schema.hasTable("referrals");
    if (!hasTable) {
      return { totalReferred: 0, totalConverted: 0, totalRewarded: 0, monthsSaved: 0 };
    }

    const referrals = await db("referrals")
      .where({ referrer_org_id: orgId })
      .select("status");

    const totalReferred = referrals.length;
    const totalConverted = referrals.filter(
      (r) => r.status === "converted" || r.status === "rewarded"
    ).length;
    const totalRewarded = referrals.filter((r) => r.status === "rewarded").length;
    // Each reward = 1 month saved for the referrer
    const monthsSaved = totalRewarded;

    return { totalReferred, totalConverted, totalRewarded, monthsSaved };
  } catch (err: any) {
    console.error("[Referral] getReferralStats error:", err.message);
    return { totalReferred: 0, totalConverted: 0, totalRewarded: 0, monthsSaved: 0 };
  }
}
