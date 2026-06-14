import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

export interface IReferral {
  id: string;
  referrer_org_id: number;
  referred_org_id: number;
  referral_code: string;
  status: "pending" | "signup" | "converted" | "rewarded";
  referred_at: Date | null;
  converted_at: Date | null;
  reward_applied_at: Date | null;
}

/**
 * Owns the `referrals` table. Methods mirror the inline queries previously held
 * in services/referralReward.ts verbatim. The `referrals` table has no
 * migration owner in some environments, so the `hasTable` guard the service
 * performed inline is exposed as `tableExists()` (mirrors CompetitorCacheModel
 * folding schema introspection into the model) to preserve the original
 * early-return control flow.
 */
export class ReferralModel extends BaseModel {
  protected static tableName = "referrals";

  /** Whether the referrals table exists. Mirrors db.schema.hasTable. */
  static async tableExists(): Promise<boolean> {
    return db.schema.hasTable("referrals");
  }

  /** Existing referral for a referrer→referred pair (raw row, or undefined). */
  static async findByReferrerAndReferred(
    referrerOrgId: number,
    referredOrgId: number,
    trx?: QueryContext
  ): Promise<IReferral | undefined> {
    return this.table(trx)
      .where({ referrer_org_id: referrerOrgId, referred_org_id: referredOrgId })
      .first();
  }

  /** Insert a pending referral. Mirrors trackReferralSignup's insert. */
  static async insertPending(
    data: {
      referrer_org_id: number;
      referred_org_id: number;
      referral_code: string;
      referred_at: Date;
    },
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert({
      referrer_org_id: data.referrer_org_id,
      referred_org_id: data.referred_org_id,
      referral_code: data.referral_code,
      status: "pending",
      referred_at: data.referred_at,
    });
  }

  /**
   * Pending/signup referral for a referred org (raw row, or undefined).
   * Mirrors the lookup in applyReferralReward.
   */
  static async findPendingForReferred(
    referredOrgId: number,
    trx?: QueryContext
  ): Promise<IReferral | undefined> {
    return this.table(trx)
      .where({ referred_org_id: referredOrgId })
      .whereIn("status", ["pending", "signup"])
      .first();
  }

  /** Mark a referral converted. Mirrors applyReferralReward's update. */
  static async markConverted(
    id: string,
    convertedAt: Date,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ status: "converted", converted_at: convertedAt });
  }

  /** Mark a referral rewarded. Mirrors applyReferralReward's update. */
  static async markRewarded(
    id: string,
    rewardAppliedAt: Date,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({ status: "rewarded", reward_applied_at: rewardAppliedAt });
  }

  /**
   * status projection for all referrals made by a referrer. Mirrors the read in
   * getReferralStats.
   */
  static async findStatusesByReferrer(
    referrerOrgId: number,
    trx?: QueryContext
  ): Promise<{ status: string }[]> {
    return this.table(trx)
      .where({ referrer_org_id: referrerOrgId })
      .select("status");
  }
}
