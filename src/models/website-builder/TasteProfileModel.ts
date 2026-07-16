import { BaseModel, QueryContext } from "../BaseModel";
import type { TasteProfile, TasteProfileAudit } from "../../types/tasteProfile";

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
 * Tenant-scoped per §11.7/§5.5 — `organizationId` is a REQUIRED parameter on
 * every read and every mutation, never an optional filter a caller can skip.
 * The unscoped `BaseModel` entry points (`findById`, `deleteById`) are sealed
 * rather than inherited, so the scope cannot be bypassed by accident; use
 * `findByIdForOrg` / `deleteByIdForOrg` / `markApproved(id, organizationId, …)`.
 * `location_id` is a nullable dimension (null = organization-level profile),
 * handled explicitly like `PracticeFactModel.findByOrgAndLocation`.
 *
 * Persisted JSONB shapes come from the neutral `types/tasteProfile` module —
 * never from the composition service, which is a controller-layer module (§7.1).
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

  /**
   * Read one profile by id, scoped to its owning organization (§11.7/§5.5).
   * `organizationId` is REQUIRED and always applied to the WHERE clause — a
   * caller holding only a leaked/guessed uuid cannot read another org's row
   * (analog: `GbpWorkItemModel.findByIdForScope`). Returns `undefined` when the
   * id belongs to a different organization — indistinguishable from "missing",
   * which is deliberate: it leaks no existence information across tenants.
   */
  static async findByIdForOrg(
    id: string,
    organizationId: number,
    trx?: QueryContext
  ): Promise<ITasteProfile | undefined> {
    const row = await this.table(trx)
      .where({ id, organization_id: organizationId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * SEALED (§11.7). `BaseModel.findById(id)` is unscoped, so inheriting it would
   * hand every caller a cross-tenant read of `taste_profiles`. Overriding it to
   * take no arguments makes `TasteProfileModel.findById(id)` a COMPILE error
   * (TS2554), not a runtime hope — the org scope cannot be forgotten.
   * TypeScript forbids widening the base signature with a required param
   * (TS2417), which is why this is a seal + a scoped sibling rather than an
   * extra argument on `findById` itself.
   *
   * @deprecated Use {@link findByIdForOrg}.
   */
  static async findById(): Promise<never> {
    throw new Error(
      "TasteProfileModel.findById is unscoped and disabled — use findByIdForOrg(id, organizationId) (§11.7)."
    );
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
   *
   * Tenant-scoped (§11.7): `organizationId` is REQUIRED and part of the WHERE
   * clause, so an owner can only ever approve their OWN profile. Returns the
   * number of rows updated — 0 when the id belongs to another organization.
   */
  static async markApproved(
    id: string,
    organizationId: number,
    approvedBy: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where({ id, organization_id: organizationId })
      .update({
        status: "approved",
        approved_by: approvedBy,
        approved_at: new Date(),
        updated_at: new Date(),
      });
  }

  /**
   * Delete one profile by id, scoped to its owning organization (§11.7).
   * `organizationId` is REQUIRED — a caller cannot delete another org's row.
   * Returns the number of rows deleted (0 = wrong org, or already gone).
   */
  static async deleteByIdForOrg(
    id: string,
    organizationId: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id, organization_id: organizationId }).del();
  }

  /**
   * SEALED (§11.7) — see {@link findById}. An unscoped delete-by-id is the most
   * destructive cross-tenant hole of the three; disabled at compile time.
   *
   * @deprecated Use {@link deleteByIdForOrg}.
   */
  static async deleteById(): Promise<never> {
    throw new Error(
      "TasteProfileModel.deleteById is unscoped and disabled — use deleteByIdForOrg(id, organizationId) (§11.7)."
    );
  }
}
