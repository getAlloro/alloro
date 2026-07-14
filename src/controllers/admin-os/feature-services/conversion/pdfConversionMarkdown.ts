import type { OsPdfPageData, OsPdfTable } from "./pdfParseAdapter";

function escapeGfmCell(value: string): string {
  return value
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "\\|")
    .trim();
}

/** Convert a detected rectangular PDF table into valid, padded GFM. */
export function pdfTableToGfm(table: OsPdfTable): string {
  const width = Math.max(0, ...table.map((row) => row.length));
  if (width === 0 || table.length === 0) return "";
  const rows = table.map((row) =>
    Array.from({ length: width }, (_, index) => escapeGfmCell(row[index] ?? ""))
  );
  const line = (row: string[]) => `| ${row.join(" | ")} |`;
  return [line(rows[0]), line(Array.from({ length: width }, () => "---")), ...rows.slice(1).map(line)].join("\n");
}

export function pdfImageMarkdown(page: OsPdfPageData): string[] {
  return page.images.map(
    (image) => `![${image.alt ?? "Embedded PDF image"}](${image.placeholder})`
  );
}

/** Readable deterministic fallback used when vision is unnecessary or fails. */
export function pdfPageToDeterministicMarkdown(page: OsPdfPageData): string {
  const sections: string[] = [];
  if (page.text) sections.push(page.text);
  sections.push(...page.tables.map(pdfTableToGfm).filter(Boolean));
  sections.push(...pdfImageMarkdown(page));
  return sections.join("\n\n");
}

export function joinPdfPages(pages: string[]): string {
  return pages.map((page) => page.trim()).filter(Boolean).join("\n\n");
}
