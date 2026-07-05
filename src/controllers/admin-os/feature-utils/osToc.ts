/**
 * Deterministic table-of-contents from Markdown headings — parsed
 * synchronously at save time, never AI-generated. Ported verbatim from
 * alloro-os/backend/src/utils/toc.ts. Code fences are skipped so a commented
 * "# heading" inside a code block is not treated as a heading.
 */

import { slugify } from "./osSlug";

export interface OsTocItem {
  level: number;
  text: string;
  slug: string;
}

export function parseToc(markdown: string): OsTocItem[] {
  const items: OsTocItem[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      const text = match[2].trim();
      items.push({ level: match[1].length, text, slug: slugify(text) });
    }
  }
  return items;
}
