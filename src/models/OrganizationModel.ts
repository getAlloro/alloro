import { Knex } from "knex";
import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

export interface IOrganization {
  id: number;
  name: string;
  domain: string | null;
  referral_code: string | null;
  organization_type: "health" | "saas" | null;
  subscription_tier: "DWY" | "DFY" | null;
  subscription_status: "active" | "inactive" | "trial" | "cancelled";
  subscription_started_at: Date | null;
  subscription_updated_at: Date | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  billing_quantity_override: number | null;
  operational_jurisdiction: string | null;
  onboarding_completed: boolean;
  onboarding_wizard_completed: boolean;
  setup_progress: Record<string, unknown> | null;
  business_data: Record<string, unknown> | null;
  archived_at: Date | null;
  archived_by_user_id: number | null;
  archive_reason: string | null;
  archive_metadata: Record<string, unknown>;
  website_edits_this_month: number;
  website_edits_reset_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type OrganizationListView = "active" | "archived" | "all";

function isOrganizationListOptions(
  value: { view?: OrganizationListView } | QueryContext | undefined
): value is { view?: OrganizationListView } {
  return Boolean(value && typeof value === "object" && "view" in value);
}

export class OrganizationModel extends BaseModel {
  protected static tableName = "organizations";
  protected static jsonFields = ["setup_progress", "business_data", "archive_metadata"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IOrganization | undefined> {
    return super.findById(id, trx);
  }

  static async findByDomain(
    domain: string,
    trx?: QueryContext
  ): Promise<IOrganization | undefined> {
    return this.table(trx).where({ domain }).first();
  }

  static async create(
    data: { name: string; domain?: string; referral_code?: string; referred_by_org_id?: number },
    trx?: QueryContext
  ): Promise<IOrganization> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async findByReferralCode(
    code: string,
    trx?: QueryContext
  ): Promise<IOrganization | undefined> {
    return this.table(trx).where({ referral_code: code }).first();
  }

  static async updateById(
    id: number,
    data: Partial<IOrganization>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async updateTier(
    id: number,
    tier: "DWY" | "DFY",
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      { subscription_tier: tier, subscription_updated_at: new Date() },
      trx
    );
  }

  static async isArchived(id: number, trx?: QueryContext): Promise<boolean> {
    const row = await this.table(trx).select("archived_at").where({ id }).first();
    return Boolean(row?.archived_at);
  }

  static async listAll(
    optionsOrTrx?: { view?: OrganizationListView } | QueryContext,
    trx?: QueryContext
  ): Promise<IOrganization[]> {
    const options = isOrganizationListOptions(optionsOrTrx)
      ? optionsOrTrx
      : undefined;
    const queryContext: QueryContext | undefined = isOrganizationListOptions(optionsOrTrx)
      ? trx
      : optionsOrTrx;
    const view = options?.view ?? "active";

    const query = this.table(queryContext)
      .select(
        "id",
        "name",
        "domain",
        "organization_type",
        "subscription_tier",
        "subscription_status",
        "stripe_customer_id",
        "archived_at",
        "archived_by_user_id",
        "archive_reason",
        "archive_metadata",
        "created_at",
        "updated_at"
      )
      .orderBy("created_at", "desc");

    if (view === "active") {
      query.whereNull("archived_at");
    } else if (view === "archived") {
      query.whereNotNull("archived_at");
    }

    const rows = await query;
    return rows.map((row: IOrganization) => this.deserializeJsonFields(row));
  }

  static async completeOnboarding(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, { onboarding_completed: true }, trx);
  }

  static async updateSetupProgress(
    id: number,
    progress: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      { setup_progress: progress } as Record<string, unknown>,
      trx
    );
  }

  /**
   * Ids of organizations eligible for a full AI-SEO audit: a website project
   * with a resolvable URL and at least one published page. Mirrors the inline
   * whereExists query in
   * services/ai-seo-audit/organizationAuditContextService.listAuditableOrganizationIds
   * verbatim (including the nested raw subqueries against website_builder.*).
   */
  static async findAuditableIds(trx?: QueryContext): Promise<number[]> {
    const knex = trx || db;
    const rows = await knex("organizations as o")
      .select("o.id")
      .whereExists(function () {
        this.select(knex.raw("1"))
          .from("website_builder.projects as p")
          .whereRaw("p.organization_id = o.id")
          .whereRaw(
            "(p.custom_domain IS NOT NULL OR p.generated_hostname IS NOT NULL OR p.selected_website_url IS NOT NULL)",
          )
          .whereExists(function () {
            this.select(knex.raw("1"))
              .from("website_builder.pages as pg")
              .whereRaw("pg.project_id = p.id")
              .andWhere("pg.status", "published");
          });
      })
      .orderBy("o.id");
    return rows.map((row: { id: number }) => Number(row.id));
  }

  /** name-only projection for an org (raw row, or undefined). */
  static async findNameById(
    id: number,
    trx?: QueryContext
  ): Promise<{ name: string } | undefined> {
    return this.table(trx).where({ id }).select("name").first();
  }

  /**
   * Billing-context projection (id, name, stripe_customer_id,
   * stripe_subscription_id) for an org. Mirrors the referrer/referred reads in
   * services/referralReward.applyReferralReward. Returned as a raw row
   * (untyped) to match the original untyped `db(...).first()` consumption — the
   * Stripe calls pass stripe_customer_id where a `string | undefined` is
   * expected, which the loose row shape preserves.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findBillingContextById(
    id: number,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx)
      .where({ id })
      .select("id", "name", "stripe_customer_id", "stripe_subscription_id")
      .first();
  }

  /**
   * engagement_score projection for an org. Mirrors the cached-value read in
   * services/behavioralIntelligence.getEngagementScore. Returns the raw row.
   */
  static async findEngagementScore(
    id: number,
    trx?: QueryContext
  ): Promise<{ engagement_score: number | null } | undefined> {
    return this.table(trx).where({ id }).select("engagement_score").first();
  }

  /**
   * Persist a recomputed engagement score and its timestamp. Mirrors the inline
   * update in services/behavioralIntelligence.getEngagementScore.
   */
  static async updateEngagementScore(
    id: number,
    score: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({
      engagement_score: score,
      engagement_score_updated_at: new Date(),
    });
  }

  /**
   * (id) projection for organizations counting toward MRR: subscription_status
   * 'active' OR any non-null subscription_tier. Mirrors the inline query in
   * services/businessMetrics.getMRRFromDB verbatim.
   */
  static async findMrrEligibleIds(
    trx?: QueryContext
  ): Promise<{ id: number }[]> {
    return this.table(trx)
      .where(function (this: Knex.QueryBuilder) {
        this.where("subscription_status", "active")
          .orWhereNotNull("subscription_tier");
      })
      .select("id");
  }

  /** Domain-only projection for an organization (or undefined if missing). */
  static async findDomainById(
    id: number,
    trx?: QueryContext
  ): Promise<{ domain: string | null } | undefined> {
    return this.table(trx).where({ id }).select("domain").first();
  }

  /**
   * (id, domain, archived_at) projection — used by ranking competitor
   * onboarding to load org context and enforce the archived guard.
   */
  static async findContextById(
    id: number,
    trx?: QueryContext
  ): Promise<
    { id: number; domain: string | null; archived_at: Date | null } | undefined
  > {
    return this.table(trx)
      .where({ id })
      .select("id", "domain", "archived_at")
      .first();
  }
}
