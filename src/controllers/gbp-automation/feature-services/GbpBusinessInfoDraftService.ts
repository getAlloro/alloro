import { GbpWorkEventModel } from "../../../models/GbpWorkEventModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { BusinessInfoField, BusinessInfoPatch } from "../feature-utils/gbpBusinessInfo";
import {
  assertGoogleReady,
  assertWritebackEnabled,
} from "./GbpBusinessInfoDeploymentService";
import { GbpReadinessService } from "./GbpReadinessService";

interface CreateDraftParams {
  organizationId: number;
  locationId: number;
  userId: number | null;
  actorEmail?: string | null;
  accessibleLocationIds?: number[];
  patch: BusinessInfoPatch;
  updateMask: BusinessInfoField[];
  summary: string;
}

export class GbpBusinessInfoDraftService {
  /**
   * Create a business_info work item in `draft` status. The write to Google never
   * happens here — this only stages the proposed change for the owner to approve.
   * The master switch and Google-write readiness are re-enforced before staging so a
   * draft can't be created for a location that can't (or shouldn't) be written to.
   */
  static async createDraft(params: CreateDraftParams): Promise<IGbpWorkItem> {
    if (
      params.accessibleLocationIds &&
      !params.accessibleLocationIds.includes(params.locationId)
    ) {
      throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
    }

    await assertWritebackEnabled(params.organizationId, params.locationId);

    const readiness = await GbpReadinessService.getLocationReadiness(
      params.organizationId,
      params.locationId
    );
    assertGoogleReady(readiness);

    const property = readiness.googleProperty;
    if (!property) {
      throw new GbpAutomationError("GBP_PROPERTY_MISSING", "GBP property missing.");
    }

    const created = await GbpWorkItemModel.create({
      organization_id: params.organizationId,
      location_id: params.locationId,
      google_property_id: property.id,
      content_type: "business_info",
      status: "draft",
      draft_content: params.summary,
      business_info_payload: { patch: params.patch, updateMask: params.updateMask },
      created_by_user_id: params.userId,
    });

    await GbpWorkEventModel.create({
      work_item_id: created.id,
      actor_user_id: params.userId,
      event_type: "business_info_draft_created",
      metadata: { updateMask: params.updateMask, actorEmail: params.actorEmail || null },
    });

    return created;
  }
}
