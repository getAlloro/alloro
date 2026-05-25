import {
  GbpAutomationSettingsModel,
  IGbpAutomationSettings,
  GbpAutomationSettingsUpsert,
} from "../../../models/GbpAutomationSettingsModel";

const DEFAULT_NEXT_POST_DAYS = 14;

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export class GbpCustomizationService {
  static async getEffectiveSettings(
    organizationId: number,
    locationId: number
  ): Promise<IGbpAutomationSettings | undefined> {
    return GbpAutomationSettingsModel.findEffectiveForLocation(
      organizationId,
      locationId
    );
  }

  static async getOrCreateSettings(
    organizationId: number,
    locationId: number | null
  ): Promise<IGbpAutomationSettings> {
    const existing = await GbpAutomationSettingsModel.findForScope(
      organizationId,
      locationId
    );
    if (existing) return existing;

    return GbpAutomationSettingsModel.upsertForScope(organizationId, locationId, {
      review_reply_enabled: false,
      local_post_frequency: "twice_monthly",
      next_post_generation_at: addDays(new Date(), DEFAULT_NEXT_POST_DAYS),
      metadata: {},
    });
  }

  static async updateSettings(
    organizationId: number,
    locationId: number | null,
    data: GbpAutomationSettingsUpsert
  ): Promise<IGbpAutomationSettings> {
    return GbpAutomationSettingsModel.upsertForScope(organizationId, locationId, {
      ...data,
      local_post_frequency: data.local_post_frequency || "twice_monthly",
    });
  }
}
