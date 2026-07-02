/**
 * AggregateRating schema.org injection.
 *
 * Star rating and review count are factual claims about a real business —
 * the same free-text trust the generator gave schema.org @type (and got
 * "Endodontist" back for it) is worse here: a wrong number is a false claim,
 * not just a technical SEO miss. This module never generates a rating; it
 * only shapes a real, already-fetched {ratingValue, reviewCount} into the
 * schema.org block and injects it on the primary business-entity schema
 * element (never Service/FAQPage/BreadcrumbList/etc).
 */

import { isBusinessEntitySchema } from "./util.schema-business-type";

export interface RealAggregateRating {
  ratingValue: number;
  reviewCount: number;
}

/**
 * Inject an AggregateRating block into the business-entity element(s) of a
 * schema_json array. Returns the array unchanged when there is no rating to
 * inject or no business-entity element to attach it to — never fabricates a
 * placeholder.
 */
export function injectAggregateRating(
  schemaJson: unknown,
  rating: RealAggregateRating | null
): Record<string, unknown>[] {
  if (!Array.isArray(schemaJson)) return [];
  if (!rating) return schemaJson;

  return schemaJson.map((entry) => {
    if (!isBusinessEntitySchema(entry)) return entry;
    return {
      ...entry,
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: String(rating.ratingValue),
        reviewCount: String(rating.reviewCount),
        bestRating: "5",
        worstRating: "1",
      },
    };
  });
}
