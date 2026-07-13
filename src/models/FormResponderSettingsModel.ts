import { BaseModel, QueryContext } from "./BaseModel";
import { db } from "../database/connection";

export type ResponderMode = "ai" | "custom";

export interface IFormResponderSettings {
  id: string;
  organization_id: number;
  location_id: number | null;
  enabled: boolean;
  mode: ResponderMode;
  reply_subject: string | null;
  reply_body: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export type FormResponderSettingsUpsert = Partial<
  Pick<
    IFormResponderSettings,
    "enabled" | "mode" | "reply_subject" | "reply_body" | "metadata"
  >
>;

/**
 * Owner-controlled auto-responder settings. The send path reads
 * `findEffectiveForLocation`; the owner-facing settings UI reads/writes via
 * `findForScope` + `upsertForScope`. Mirrors GbpAutomationSettingsModel.
 */
export class FormResponderSettingsModel extends BaseModel {
  protected static tableName = "form_responder_settings";
  protected static jsonFields = ["metadata"];

  /**
   * The effective settings for a submission: a location-specific row wins over
   * the org-level default (null location). Returns undefined when the org has
   * no settings row at all — the caller treats that as "off" (opt-in default).
   */
  static async findEffectiveForLocation(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<IFormResponderSettings | undefined> {
    const query = this.table(trx).where({ organization_id: organizationId });
    if (locationId === null) {
      query.whereNull("location_id");
    } else {
      query.where(function () {
        this.where({ location_id: locationId }).orWhereNull("location_id");
      });
    }
    const rows = await query
      .orderByRaw("CASE WHEN location_id IS NULL THEN 1 ELSE 0 END")
      .limit(1);
    const row = rows[0];
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findForScope(
    organizationId: number,
    locationId: number | null,
    trx?: QueryContext
  ): Promise<IFormResponderSettings | undefined> {
    const query = this.table(trx).where({ organization_id: organizationId });
    if (locationId === null) {
      query.whereNull("location_id");
    } else {
      query.where({ location_id: locationId });
    }
    const row = await query.first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async upsertForScope(
    organizationId: number,
    locationId: number | null,
    data: FormResponderSettingsUpsert,
    trx?: QueryContext
  ): Promise<IFormResponderSettings> {
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
}
