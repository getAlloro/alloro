/**
 * FAQPage schema.org conversion.
 *
 * The "geo_layer" generation section produces `faq_candidates` — an array of
 * {question, answer} pairs sourced from VERIFIED PRACTICE FACTS or page/post
 * content — but nothing downstream ever turned that into usable structured
 * data. This is a pure, deterministic transform: no LLM call, since it's a
 * straight data-shape conversion of content the generator already produced.
 */

export interface FaqCandidate {
  question: string;
  answer: string;
}

function isFaqCandidate(value: unknown): value is FaqCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.question === "string" &&
    candidate.question.trim().length > 0 &&
    typeof candidate.answer === "string" &&
    candidate.answer.trim().length > 0
  );
}

/**
 * Build a schema.org FAQPage block from faq_candidates. Returns null when
 * there are no valid candidates — callers must not inject an empty/fabricated
 * FAQPage block.
 */
export function buildFaqPageSchema(faqCandidates: unknown): Record<string, unknown> | null {
  if (!Array.isArray(faqCandidates)) return null;

  const validCandidates = faqCandidates.filter(isFaqCandidate);
  if (validCandidates.length === 0) return null;

  return {
    "@type": "FAQPage",
    "@context": "https://schema.org",
    mainEntity: validCandidates.map((candidate) => ({
      "@type": "Question",
      name: candidate.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: candidate.answer,
      },
    })),
  };
}

/** True when a schema_json array already contains an FAQPage entry. */
export function hasFaqPageSchema(schemaJson: unknown): boolean {
  if (!Array.isArray(schemaJson)) return false;
  return schemaJson.some(
    (entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>)["@type"] === "FAQPage"
  );
}
