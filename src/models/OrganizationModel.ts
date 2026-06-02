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
}
