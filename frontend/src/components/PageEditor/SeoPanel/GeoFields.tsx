import { Target, HelpCircle } from "lucide-react";
import { type SeoData } from "../../../api/websites";
import { fieldLabel } from "./fieldStyles";

/**
 * Read-only surface for the geo_layer SEO section's output (target query,
 * opening-content recommendation, FAQ candidates) — all sourced only from
 * VERIFIED PRACTICE FACTS per SeoGeneration.geo-layer.md. Not editable here;
 * these are AI-citability recommendations, not meta fields with their own
 * save path. opening_content_recommendation is what GEO auto-apply writes
 * into the live body (see AutoApplyBanner for that provenance).
 */
export default function GeoFields({ seo }: { seo: SeoData }) {
  const hasTargetQuery = !!seo.target_query_primary;
  const hasOpening = !!seo.opening_content_recommendation;
  const faqs = seo.faq_candidates || [];

  if (!hasTargetQuery && !hasOpening && faqs.length === 0) {
    return (
      <div className="pt-4 border-t border-gray-200">
        <label className={fieldLabel}>GEO / Answer-First Recommendations</label>
        <p className="text-xs text-gray-400 mt-1">
          Not generated yet. Run "Generate" on this section to produce an AI-citability layer
          sourced from verified practice facts.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-4 border-t border-gray-200 space-y-4">
      <label className={fieldLabel}>GEO / Answer-First Recommendations</label>

      {hasTargetQuery && (
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Target className="w-3 h-3 text-alloro-orange" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Target Query</span>
          </div>
          <p className="text-xs text-gray-700 font-medium">{seo.target_query_primary}</p>
          {!!seo.target_query_variants?.length && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {seo.target_query_variants.map((variant) => (
                <span key={variant} className="text-[10px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                  {variant}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {hasOpening && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Opening Content Recommendation
          </span>
          <p className="text-xs text-gray-700 mt-1 bg-orange-50 border border-orange-100 rounded-lg p-2.5">
            {seo.opening_content_recommendation}
          </p>
        </div>
      )}

      {faqs.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <HelpCircle className="w-3 h-3 text-alloro-orange" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              FAQ Candidates ({faqs.length})
            </span>
          </div>
          <ul className="space-y-1.5">
            {faqs.map((faq) => (
              <li key={faq.question} className="rounded-lg border border-gray-200 bg-white p-2.5">
                <p className="text-xs font-semibold text-gray-800">{faq.question}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{faq.answer}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
