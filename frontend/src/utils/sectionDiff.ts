import type { Section } from "../api/templates";

export type SectionDiffStatus = "changed" | "added" | "removed";

export type SectionDiffEntry = {
  name: string;
  /** Status from the compared version's perspective vs the current draft. */
  status: SectionDiffStatus;
};

function normalizeContent(content: string | undefined): string {
  return (content || "").trim();
}

/**
 * Compare the current draft's sections against another version's sections.
 * - changed: present in both with different content
 * - added:   present in the version but not the draft
 * - removed: present in the draft but not the version
 */
export function diffSections(
  currentSections: Section[],
  versionSections: Section[],
): SectionDiffEntry[] {
  const currentByName = new Map(
    currentSections.map((s) => [s.name, normalizeContent(s.content)]),
  );
  const versionByName = new Map(
    versionSections.map((s) => [s.name, normalizeContent(s.content)]),
  );

  const entries: SectionDiffEntry[] = [];

  for (const [name, versionContent] of versionByName) {
    if (!currentByName.has(name)) {
      entries.push({ name, status: "added" });
    } else if (currentByName.get(name) !== versionContent) {
      entries.push({ name, status: "changed" });
    }
  }

  for (const name of currentByName.keys()) {
    if (!versionByName.has(name)) {
      entries.push({ name, status: "removed" });
    }
  }

  return entries;
}

/**
 * CSS injected into a version-preview iframe to outline the sections that
 * differ from the current draft. Sections are tagged with
 * data-alloro-section="{name}" by the page assembler.
 */
export function buildDiffOutlineStyleTag(names: string[]): string {
  if (names.length === 0) return "";
  const selectors = names
    .map((name) => `[data-alloro-section="${name.replace(/"/g, '\\"')}"]`)
    .join(",\n");
  return `<style data-alloro-diff-outline>${selectors} { outline: 2px dashed #d97706 !important; outline-offset: 4px; }</style>`;
}

/** Inject the diff outline style into assembled preview HTML. */
export function injectDiffOutlines(html: string, names: string[]): string {
  const styleTag = buildDiffOutlineStyleTag(names);
  if (!styleTag) return html;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleTag}</head>`);
  }
  return styleTag + html;
}
