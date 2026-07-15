import { BaseModel, QueryContext } from "../BaseModel";
import type { TasteProfile, TasteProfileAudit } from "../../controllers/admin-websites/feature-services/service.taste-profile";

export type TasteProfileStatus = "draft" | "approved";

export interface ITasteProfile {
  id: string;
  organization_id: number;
  location_id: number | null;
  status: TasteProfileStatus;
  business_name: string | null;
  business_category: string | null;
  profile: TasteProfile;
  source_summary: TasteProfileAudit;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * DB-correctness layer for `taste_profiles` — one composed, source-linked
 * Taste Profile per business (Slice 2). Thin model, all DB access here, no
 * business logic (§6.1 reference: `GbpReviewInsightModel` / `PracticeFactModel`).
 * The honesty gate + composition live in the service layer
 * (`service.taste-profile.ts`); this model only persists the gated result.
 *
 * Tenant-scoped per §11.7/§5.5 — `organizationId` is a required parameter on
 * every read, never an optional filter a caller can skip. `location_id` is a
 * nullable dimension (null = organization-level profile), handled explicitly
 * like `PracticeFactModel.findByOrgAndLocation`.
 */
export class TasteProfileModel extends BaseModel {
  protected static tableName = "taste_profiles";
  // JSONB columns — serialized on write / parsed on read by BaseModel.
  protected static jsonFields = ["profile", "source_summary"];

  /** Insert a new (draft) taste-profile record. */
  static async create(
    data: Omit<
      ITasteProfile,
      "id" | "status" | "approved_by" | "approved_at" | "created_at" | "updated_at"
    > & { status?: TasteProfileStatus },
    trx?: QueryContext
  ): Promise<ITasteProfile> {
    return super.create(
      {
        organization_id: data.organization_id,
        location_id: data.location_id,
        status: data.status ?? "draft",
        business_name: data.business_name,
        business_category: data.business_category,
        profile: data.profile,
        source_summary: data.source_summary,
      },
      trx
    );
  }

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<ITasteProfile | undefined> {
    return super.findById(id, trx);
  }

  /**
   * Latest profile for an organization (+ optional location), newest first.
   * Tenant-scoped: `organizationId` is required. `location_id === null` selects
   * the organization-level profile explicitly (never a wildcard).
   */
  static async findLatestByOrgAndLocation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<ITasteProfile | undefined> {
    const query = this.table(trx).where({ organization_id: organizationId });
    if (locationId === null) {
      query.whereNull("location_id");
    } else {
      query.where({ location_id: locationId });
    }
    const row = await query.orderBy("created_at", "desc").first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * Mark a profile approved (Tier 3 owner sign-off). AI drafts; the human
   * stakes — nothing publishes until this flips `status` to `approved`.
   */
  static async markApproved(
    id: string,
    approvedBy: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id })
      .update({
        status: "approved",
        approved_by: approvedBy,
        approved_at: new Date(),
        updated_at: new Date(),
      });
  }

  static async deleteById(id: string, trx?: QueryContext): Promise<number> {
    return this.table(trx).where({ id }).del();
  }
}
