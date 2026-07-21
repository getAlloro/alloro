import {
  CategoryRecommendation,
  CategoryRecommendationInput,
  findMoreSpecificPrimaryCategory,
} from "../feature-utils/gbpCategoryTaxonomy";

/**
 * Category value-source — the recommendation half.
 *
 * Turns "your primary category should be X" into a concrete, settable proposal by
 * applying the audit's SearchConversion specificity principle (a more specific
 * category beats a generic one) over the real Google category catalog. It DECIDES;
 * it never writes. The A6 draft rail (GbpBusinessInfoDraftService) is what stages
 * an owner-approved change — see CategoryValueSourceService.
 */
export class CategoryRecommendationService {
  /**
   * Return a strictly-more-specific primary-category proposal for this location,
   * or `null` when none is warranted. Honest by construction: no signal, an
   * already-specific current category, or a self-match all return `null` rather
   * than a manufactured change.
   */
  static recommendPrimaryCategory(
    input: CategoryRecommendationInput
  ): CategoryRecommendation | null {
    return findMoreSpecificPrimaryCategory(input);
  }
}
