/**
 * Component List Utility
 *
 * Turns a template page's `sections` blob into the ordered list of section
 * components the generation pipeline iterates over. The page pipeline only
 * generates sections — wrapper/header/footer are owned by the Layouts
 * pipeline (service.layouts-pipeline.ts).
 *
 * Extracted from service.generation-pipeline.ts (behavior-preserving) so the
 * pipeline stays focused on orchestration.
 */

import { normalizeSections } from "./util.section-normalizer";

export interface ComponentDef {
  name: string;
  type: "section";
  templateMarkup: string;
}

/**
 * Page pipeline only generates sections. Wrapper/header/footer are owned by
 * the Layouts pipeline (service.layouts-pipeline.ts).
 */
export function buildComponentList(templatePage: any): ComponentDef[] {
  const sections = normalizeSections(templatePage?.sections);
  return sections.map((section: any, idx: number) => ({
    name: section.name || `section-${idx}`,
    type: "section" as const,
    templateMarkup: section.content || "",
  }));
}
