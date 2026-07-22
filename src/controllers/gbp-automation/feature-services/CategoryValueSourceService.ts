import { IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { CategoryRecommendationInput } from "../feature-utils/gbpCategoryTaxonomy";
import type { CategoryRecommendation } from "../feature-utils/gbpCategoryTaxonomy";
import { BusinessInfoField, BusinessInfoPatch } from "../feature-utils/gbpBusinessInfo";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { mapAiReadyGbpToCategoryInput } from "../feature-utils/mapAiReadyGbpToCategoryInput";
import { resolveOrganizationAuditContext } from "../../../services/ai-seo-audit/organizationAuditContextService";
import { GbpBusinessInfoDraftService } from "./GbpBusinessInfoDraftService";
import { CategoryRecommendationService } from "./CategoryRecommendationService";

/** The category field is the only thing this value-source ever proposes. */
const CATEGORY_UPDATE_MASK: BusinessInfoField[] = ["categories"];

interface ProposeCategoryDraftParams {
  organizationId: number;
  locationId: number;
  userId: number | null;
  actorEmail?: string | null;
  accessibleLocationIds?: number[];
  /** Current primary category + context signals (from client_gbp). */
  recommendationInput: CategoryRecommendationInput;
}

/**
 * Same tenant context as ProposeCategoryDraftParams, but WITHOUT a caller-built
 * recommendationInput: proposeCategoryDraftForLocation derives it from the location's
 * live AI-ready GBP data.
 */
interface ProposeCategoryDraftForLocationParams {
  organizationId: number;
  locationId: number;
  userId: number | null;
  actorEmail?: string | null;
  accessibleLocationIds?: number[];
}

/** Either nothing was warranted, or a draft was staged for the owner to approve. */
export type ProposeCategoryDraftResult =
  | { proposed: false }
  | {
      proposed: true;
      recommendation: CategoryRecommendation;
      workItem: IGbpWorkItem;
    };

/**
 * Category value-source — the wiring half.
 *
 * Given a location, it asks CategoryRecommendationService for a more-specific
 * primary category and, if there is one, stages it as an owner-approved A6
 * `business_info` draft through GbpBusinessInfoDraftService.createDraft — the SAME
 * rail that re-enforces the master switch, Google-readiness, and tenant scope, and
 * leaves the item at `draft` for the owner.
 *
 * This service writes NOTHING to Google. It imports no deploy/patch path; the only
 * outbound rail is createDraft, so a proposal cannot reach a live profile without
 * the owner approving it AND A6's master switch being on. When no better category
 * exists, it stages nothing (Value #6 — never a manufactured change).
 */
export class CategoryValueSourceService {
  static async proposeCategoryDraft(
    params: ProposeCategoryDraftParams
  ): Promise<ProposeCategoryDraftResult> {
    const recommendation = CategoryRecommendationService.recommendPrimaryCategory(
      params.recommendationInput
    );
    if (!recommendation) {
      return { proposed: false };
    }

    const patch: BusinessInfoPatch = {
      categories: { primaryCategory: recommendation.proposed },
    };

    const workItem = await GbpBusinessInfoDraftService.createDraft({
      organizationId: params.organizationId,
      locationId: params.locationId,
      userId: params.userId,
      actorEmail: params.actorEmail,
      accessibleLocationIds: params.accessibleLocationIds,
      patch,
      updateMask: CATEGORY_UPDATE_MASK,
      summary: `Set Google primary category to "${recommendation.proposed.displayName}"`,
    });

    return { proposed: true, recommendation, workItem };
  }

  /**
   * The MANUAL, owner/operator-triggered production caller — the runtime invocation
   * proposeCategoryDraft had lacked (it took a pre-built input). Resolves the location's
   * live AI-ready GBP data, derives the recommendation input, and delegates. Thin by
   * design; mirrors GbpCompletenessDraftService.stageFillForLocation (§6.1).
   *
   * Safety: writes NOTHING to Google. §11.7 tenant scope is enforced twice — the audit
   * context is org-scoped here, and createDraft re-checks downstream. No better category
   * (or no gradable profile) → stages nothing (Value #6), returned as { proposed: false }.
   */
  static async proposeCategoryDraftForLocation(
    params: ProposeCategoryDraftForLocationParams
  ): Promise<ProposeCategoryDraftResult> {
    // §11.7 — the audit context is org-scoped, so only locations this org owns are
    // present. A locationId the caller does not own is absent → access denied.
    const context = await resolveOrganizationAuditContext(params.organizationId);
    const location =
      context.locations.find((candidate) => candidate.id === params.locationId) ?? null;
    if (!location) {
      throw new GbpAutomationError(
        "LOCATION_ACCESS_DENIED",
        "No access to this location."
      );
    }

    const recommendationInput = mapAiReadyGbpToCategoryInput(location.gbpData);
    if (!recommendationInput) {
      // No gradable GBP profile — nothing to reason a category from (Value #6).
      return { proposed: false };
    }

    return CategoryValueSourceService.proposeCategoryDraft({
      organizationId: params.organizationId,
      locationId: params.locationId,
      userId: params.userId,
      actorEmail: params.actorEmail ?? null,
      accessibleLocationIds: params.accessibleLocationIds,
      recommendationInput,
    });
  }
}
