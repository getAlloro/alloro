import { GbpWorkEventModel } from "../../../models/GbpWorkEventModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import {
  BUSINESS_INFO_ORIGIN_COMPLETENESS_AUTOFILL,
  BusinessInfoField,
  BusinessInfoPatch,
} from "../feature-utils/gbpBusinessInfo";
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
  /**
   * Set only by the completeness auto-fill path so the publish trigger can surface an
   * owner-facing action for it; absent for a manual owner edit.
   */
  origin?: typeof BUSINESS_INFO_ORIGIN_COMPLETENESS_AUTOFILL;
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

    // §10.5 — the work item and its audit event are two tables and one fact.
    // Without a transaction a failed event write leaves a staged draft with no
    // provenance; both land or neither does.
    // §7.4 — the transaction boundary is opened THROUGH the model layer, which owns
    // the database handle; this service composes model calls and never imports `db`.
    return GbpWorkItemModel.transaction(async (trx) => {
      const created = await GbpWorkItemModel.create(
        {
          organization_id: params.organizationId,
          location_id: params.locationId,
          google_property_id: property.id,
          content_type: "business_info",
          status: "draft",
          draft_content: params.summary,
          business_info_payload: {
            patch: params.patch,
            updateMask: params.updateMask,
            ...(params.origin ? { origin: params.origin } : {}),
          },
          created_by_user_id: params.userId,
        },
        trx
      );

      await GbpWorkEventModel.create(
        {
          work_item_id: created.id,
          actor_user_id: params.userId,
          event_type: "business_info_draft_created",
          metadata: { updateMask: params.updateMask, actorEmail: params.actorEmail || null },
        },
        trx
      );

      return created;
    });
  }
}
