import logger from "../../../lib/logger";
import { IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { LocationModel } from "../../../models/LocationModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import type { GbpCompletenessField } from "../../../services/ai-seo-audit/gbpCompletenessScoring";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import {
  buildCompletenessFillPatch,
  CompletenessFillSkip,
} from "../feature-utils/gbpCompletenessFill";
import { GbpBusinessInfoDraftService } from "./GbpBusinessInfoDraftService";

interface StageFillParams {
  organizationId: number;
  locationId: number;
  userId: number | null;
  actorEmail?: string | null;
  accessibleLocationIds?: number[];
  /** The MISSING-field set from scoreGbpCompleteness (A2 detection). */
  missingFields: readonly GbpCompletenessField[];
}

export interface StageFillResult {
  /** The staged draft work item, or null when Alloro held no value for any gap. */
  workItem: IGbpWorkItem | null;
  /** The businessInformation fields staged with a real value. */
  filled: import("../feature-utils/gbpBusinessInfo").BusinessInfoField[];
  /** Detected-missing fields NOT staged, each with a reason (owner-visible). */
  unfillable: CompletenessFillSkip[];
}

/**
 * A2 → A6 bridge (the detect → fix wire). Takes the completeness detector's
 * missing-field set and stages an OWNER-APPROVAL businessInformation draft for the
 * fields where Alloro already holds the correct value on its own. Nothing auto-deploys:
 * this delegates to GbpBusinessInfoDraftService.createDraft, which re-enforces the
 * master switch and Google-write readiness before staging (§5.4), and the owner still
 * approves before any write to Google.
 *
 * Honesty (Value #6): only genuinely-held values are staged; every other gap is returned
 * in `unfillable` with a reason instead of being guessed or blank-filled. See
 * gbpCompletenessFill for the per-field source map and the documented open decisions.
 *
 * Mirrors GbpBusinessInfoDraftService (§6.1): the service composes model reads (§7.4)
 * and delegates the transaction-bounded stage; it never touches the DB handle directly.
 */
export class GbpCompletenessDraftService {
  static async stageFillForMissingFields(
    params: StageFillParams
  ): Promise<StageFillResult> {
    // §11.7 — tenant scope: the location must belong to the org from server context.
    const location = await LocationModel.findById(params.locationId);
    if (!location || location.organization_id !== params.organizationId) {
      throw new GbpAutomationError(
        "LOCATION_ACCESS_DENIED",
        "No access to this location."
      );
    }

    // Website value source: the location's own domain, falling back to the org domain.
    let website = location.domain;
    if (!website || !website.trim()) {
      const org = await OrganizationModel.findById(params.organizationId);
      website = org?.domain ?? null;
    }

    const fill = buildCompletenessFillPatch(params.missingFields, { website });

    // Never stage an empty draft: if Alloro held no usable value for any detected gap,
    // report the unfillable set and stop — the createDraft path would reject an empty
    // updateMask anyway.
    if (fill.updateMask.length === 0) {
      return { workItem: null, filled: [], unfillable: fill.unfillable };
    }

    const workItem = await GbpBusinessInfoDraftService.createDraft({
      organizationId: params.organizationId,
      locationId: params.locationId,
      userId: params.userId,
      actorEmail: params.actorEmail ?? null,
      accessibleLocationIds: params.accessibleLocationIds,
      patch: fill.patch,
      updateMask: fill.updateMask,
      summary: fill.summary,
    });

    logger.info(
      {
        organizationId: params.organizationId,
        locationId: params.locationId,
        workItemId: workItem.id,
        filled: fill.filled,
        unfillable: fill.unfillable,
      },
      "[GbpCompletenessDraft] staged owner-approval draft from detected GBP gaps"
    );

    return { workItem, filled: fill.filled, unfillable: fill.unfillable };
  }
}
