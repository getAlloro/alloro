import { EnginePrompt } from "./types";

/**
 * Build the small, fixed prompt set for a practice's category + geo — one
 * generic + one contextualized variant (the Clovion finding: a generic-only
 * reading overstates standing). Curated, not "everything" (SEJ deliberate
 * prompt selection). Stable `key`s feed the observation idempotency.
 */
export interface PromptSetInput {
  category: string;
  city: string;
}

export function buildPromptSet(input: PromptSetInput): EnginePrompt[] {
  const category = input.category?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  if (!category || !city) return [];
  return [
    {
      key: "generic_best",
      text: `Who are a few good ${category}s in ${city}? Name specific practices.`,
      kind: "generic",
    },
    {
      key: "contextualized_new_patient",
      text: `I'm a new patient looking for a highly-rated ${category} in ${city}. Which specific practices would you recommend?`,
      kind: "contextualized",
    },
  ];
}
