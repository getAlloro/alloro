import logger from "../../../lib/logger";
import { IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { LocationModel } from "../../../models/LocationModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import {
  mapAiReadyGbpToCompletenessInput,
  scoreGbpCompleteness,
  type GbpCompletenessField,
} from "../../../services/ai-seo-audit/gbpCompletenessScoring";
import { resolveOrganizationAuditContext } from "../../../services/ai-seo-audit/organizationAuditContextService";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { BUSINESS_INFO_ORIGIN_COMPLETENESS_AUTOFILL } from "../feature-utils/gbpBusinessInfo";
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

interface StageFillForLocationParams {
  organizationId: number;
  locationId: number;
  userId: number | null;
  actorEmail?: string | null;
  accessibleLocationIds?: number[];
}

export interface StageFillResult {
  /** The staged draft work item, or null when Alloro held no value for any gap. */
  workItem: IGbpWorkItem | null;
  /** The businessInformation fields staged with a real value. */
  filled: import("../feature-utils/gbpBusinessInfo").BusinessInfoField[];
  /** Detected-missing fields NOT staged, each with a reason (owner-visible). */
  unfillable: CompletenessFillSkip[];
}

export interface StageFillForLocationResult extends StageFillResult {
  /** True only when a gradable GBP record was found for this location. */
  hasGbpData: boolean;
  /** present / total graded GBP fields, 0..1 (0 when no gradable record). */
  completeness: number;
  /** The full detected-missing set before fill classification (owner-visible). */
  missingFields: GbpCompletenessField[];
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
      // Tag the draft so the publish path surfaces it to the owner as Alloro's fill,
      // and a manual business-info edit (same publish path) never claims the same.
      origin: BUSINESS_INFO_ORIGIN_COMPLETENESS_AUTOFILL,
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

  /**
   * The MANUAL, owner/operator-triggered production caller for the detect → fix wire.
   * Runs completeness for ONE location live, then stages the fill draft — closing the
   * gap where stageFillForMissingFields had no runtime invocation.
   *
   * Completeness is computed from the SAME source the audit uses:
   * resolveOrganizationAuditContext builds each location's AI-ready `gbpData`, which
   * mapAiReadyGbpToCompletenessInput + scoreGbpCompleteness grade. Reusing that path
   * (rather than a second GBP-fetch) guarantees the missing-field set here can never
   * drift from what the get-found audit reports.
   *
   * Safety (this is the safe half of the seam):
   *   - Nothing auto-fires: a human calls this endpoint.
   *   - Nothing auto-publishes: it only STAGES a draft. createDraft re-enforces the
   *     write-back master switch (assertWritebackEnabled) and Google-write readiness,
   *     and the owner still approves before any write to Google.
   *   - §11.7 tenant scope: the audit context is resolved for the caller's org, so a
   *     foreign location is not in `context.locations`; stageFillForMissingFields then
   *     re-checks the location's org ownership as defense in depth.
   *
   * OPEN OWNER-CONTROL DECISION (documented, deliberately NOT wired): whether this
   * fill should ALSO fire automatically at audit time (when the get-found checker
   * detects gaps) is a levers-default-OFF question for the owner. This method is the
   * manual path only; no auto-at-audit invocation is added here.
   */
  static async stageFillForLocation(
    params: StageFillForLocationParams
  ): Promise<StageFillForLocationResult> {
    // §11.7 — the audit context is org-scoped, so only locations owned by this org
    // are present. A locationId the caller does not own is absent → access denied.
    const context = await resolveOrganizationAuditContext(params.organizationId);
    const location =
      context.locations.find((candidate) => candidate.id === params.locationId) ?? null;
    if (!location) {
      throw new GbpAutomationError(
        "LOCATION_ACCESS_DENIED",
        "No access to this location."
      );
    }

    const completeness = scoreGbpCompleteness(
      mapAiReadyGbpToCompletenessInput(location.gbpData)
    );

    const staged = await GbpCompletenessDraftService.stageFillForMissingFields({
      organizationId: params.organizationId,
      locationId: params.locationId,
      userId: params.userId,
      actorEmail: params.actorEmail ?? null,
      accessibleLocationIds: params.accessibleLocationIds,
      missingFields: completeness.missingFields,
    });

    return {
      ...staged,
      hasGbpData: completeness.hasData,
      completeness: completeness.completeness,
      missingFields: completeness.missingFields,
    };
  }
}
