import { useState } from "react";
import { Loader2, Quote, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { usePageFacts, usePostFacts, useExtractPageFacts, useExtractPostFacts } from "../../../hooks/queries/usePracticeFacts";
import { fieldLabel } from "./fieldStyles";

const SOURCE_FIELD_LABEL: Record<string, string> = {
  business_data: "Business Data",
  page_content: "Page Content",
  post_content: "Post Content",
};

/**
 * Surfaces extracted practice_facts with their verbatim source_excerpt — the
 * provenance trust mechanism the whole GEO auto-apply design relies on (spec
 * Must: "SEO panel UI shows ... which facts were used, their source
 * excerpt"). This is the single most important piece of T7: it is what lets
 * an editor verify a generated claim traces to something real instead of
 * being invented.
 */
export default function PracticeFactsPanel({
  projectId,
  entityId,
  entityType,
  pageContent,
}: {
  projectId: string;
  entityId: string;
  entityType: "page" | "post";
  pageContent: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pageFacts = usePageFacts(projectId, entityType === "page" ? entityId : "");
  const postFacts = usePostFacts(projectId, entityType === "post" ? entityId : "");
  const { data: facts, isLoading } = entityType === "page" ? pageFacts : postFacts;

  const extractPage = useExtractPageFacts(projectId, entityId);
  const extractPost = useExtractPostFacts(projectId, entityId);
  const extraction = entityType === "page" ? extractPage : extractPost;

  const handleExtract = () => {
    if (entityType === "page") {
      extractPage.mutate(pageContent);
    } else {
      extractPost.mutate();
    }
  };

  return (
    <div className="pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <label className={fieldLabel}>Verified Practice Facts</label>
        <button
          onClick={handleExtract}
          disabled={extraction.isPending}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-white bg-alloro-orange hover:bg-alloro-orange/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Extract source-traceable facts for GEO generation"
        >
          {extraction.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          Extract Facts
        </button>
      </div>

      {isLoading && (
        <p className="text-xs text-gray-400">Loading extracted facts…</p>
      )}

      {!isLoading && (!facts || facts.length === 0) && (
        <p className="text-xs text-gray-400">
          No facts extracted yet. Extraction reads business data and this {entityType}'s content
          and only keeps facts it can quote back to source — nothing is invented.
        </p>
      )}

      {!isLoading && facts && facts.length > 0 && (
        <ul className="space-y-1.5">
          {facts.map((fact) => {
            const isExpanded = expandedId === fact.id;
            return (
              <li key={fact.id} className="rounded-lg border border-gray-200 bg-white">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : fact.id)}
                  className="w-full flex items-start gap-2 px-3 py-2 text-left"
                >
                  <Quote className="w-3 h-3 text-alloro-orange mt-0.5 shrink-0" />
                  <span className="text-xs text-gray-700 flex-1">{fact.fact_text}</span>
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  )}
                </button>
                {isExpanded && (
                  <div className="px-3 pb-2.5 pl-8">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      Source — {SOURCE_FIELD_LABEL[fact.source_field] || fact.source_field}
                    </span>
                    <p className="text-[11px] text-gray-500 italic mt-1 bg-gray-50 rounded-md p-2 border border-gray-100">
                      &ldquo;{fact.source_excerpt}&rdquo;
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
