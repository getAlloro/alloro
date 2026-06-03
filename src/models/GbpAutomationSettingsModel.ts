import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export type LocalPostFrequency = "twice_monthly";

export interface IGbpAutomationSettings {
  id: string;
  organization_id: number;
  location_id: number | null;
  review_reply_enabled: boolean;
  review_reply_customizations: string | null;
  local_post_customizations: string | null;
  review_reply_voice_examples: string[];
  local_post_voice_examples: string[];
  reply_rules: string[];
  post_rules: string[];
  local_post_generation_enabled: boolean;
  local_post_frequency: LocalPostFrequency;
  next_post_generation_at: Date | null;
  default_featured_image_url: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export type GbpAutomationSettingsUpsert = Partial<
  Pick<
    IGbpAutomationSettings,
    | "review_reply_enabled"
    | "review_reply_customizations"
    | "local_post_customizations"
    | "review_reply_voice_examples"
    | "local_post_voice_examples"
    | "reply_rules"
    | "post_rules"
    | "local_post_generation_enabled"
    | "local_post_frequency"
    | "next_post_generation_at"
    | "default_featured_image_url"
    | "metadata"
  >
>;

export class GbpAutomationSettingsModel extends BaseModel {
  protected static tableName = "gbp_automation_settings";
  protected static jsonFields = [
    "metadata",
    "review_reply_voice_examples",
    "local_post_voice_examples",
    "reply_rules",
    "post_rules",
  ];

  static async findById(
    id: string,
    trx?: QueryContext
  ): Promise<IGbpAutomationSettings | undefined> {
    return super.findById(id, trx);
  }

  static async findForScope(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<IGbpAutomationSettings | undefined> {
    const query = this.table(trx).where({ organization_id: organizationId });

    if (locationId === null) {
      query.whereNull("location_id");
    } else {
      query.where({ location_id: locationId });
    }

    const row = await query.first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findEffectiveForLocation(
    organizationId: number,
    locationId: number,
    trx?: QueryContext
  ): Promise<IGbpAutomationSettings | undefined> {
    const rows = await this.table(trx)
      .where({ organization_id: organizationId })
      .where(function () {
        this.where({ location_id: locationId }).orWhereNull("location_id");
      })
      .orderByRaw("CASE WHEN location_id IS NULL THEN 1 ELSE 0 END")
      .limit(2);

    const row = rows[0];
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async listDueLocalPostGeneration(
    now: Date,
    limit = 25,
    trx?: QueryContext
  ): Promise<IGbpAutomationSettings[]> {
    const rows = await (trx || db)(`${this.tableName} as gas`)
      .join("organizations as o", "gas.organization_id", "o.id")
      .select("gas.*")
      .where({ "gas.local_post_generation_enabled": true })
      .whereNotNull("gas.location_id")
      .whereNull("o.archived_at")
      .where(function () {
        this.whereNull("gas.next_post_generation_at").orWhere(
          "gas.next_post_generation_at",
          "<=",
          now
        );
      })
      .orderByRaw("gas.next_post_generation_at ASC NULLS FIRST")
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.map((row: IGbpAutomationSettings) => this.deserializeJsonFields(row));
  }

  static async listByOrganizationId(
    organizationId: number,
    trx?: QueryContext
  ): Promise<IGbpAutomationSettings[]> {
    const rows = await this.table(trx)
      .where({ organization_id: organizationId })
      .orderBy("created_at", "asc");
    return rows.map((row: IGbpAutomationSettings) => this.deserializeJsonFields(row));
  }

  static async upsertForScope(
    organizationId: number,
    locationId: number | null,
    data: GbpAutomationSettingsUpsert,
    trx?: QueryContext
  ): Promise<IGbpAutomationSettings> {
    const now = new Date();
    const insertData = this.serializeJsonFields({
      organization_id: organizationId,
      location_id: locationId,
      ...data,
      created_at: now,
      updated_at: now,
    });
    const updateData = this.serializeJsonFields({
      ...data,
      updated_at: now,
    });
    const conflictTarget =
      locationId === null
        ? db.raw("(organization_id) WHERE location_id IS NULL")
        : db.raw("(organization_id, location_id) WHERE location_id IS NOT NULL");

    const [row] = await this.table(trx)
      .insert(insertData)
      .onConflict(conflictTarget)
      .merge(updateData)
      .returning("*");
    return this.deserializeJsonFields(row);
  }

  static async updateById(
    id: string,
    data: GbpAutomationSettingsUpsert,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }
}
