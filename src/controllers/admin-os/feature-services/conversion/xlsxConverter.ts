import * as XLSX from "xlsx";
import type { OsParsedDocument } from "../../feature-utils/osConversionTypes";

/**
 * Excel (.xlsx + legacy .xls) → GFM markdown converter (P6 T2). Ported from
 * alloro-os xlsxParser. Each worksheet becomes a `## <sheet>` section followed
 * by a GFM table (row 0 = header). SheetJS's community build cannot extract
 * embedded images, so `images` is always `[]`.
 */

type RowMatrix = unknown[][];

// Sheets past these dimensions still render in full; we just warn the caller
// the resulting table may be unwieldy.
const LARGE_ROWS = 200;
const LARGE_COLS = 25;

// Coerce any cell value to a plain string. Dates become ISO via toISOString();
// null/undefined → "".
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

// Make one cell GFM-table-safe: collapse newlines and escape the column pipe.
function escapeCell(v: unknown): string {
  return cellToString(v)
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

// Render a single table row: `| a | b | c |`, padding to `width` columns.
function gfmRow(cells: unknown[], width: number): string {
  const padded: unknown[] = [];
  for (let i = 0; i < width; i += 1) padded.push(cells[i]);
  return `| ${padded.map(escapeCell).join(" | ")} |`;
}

// Build the `## name` section + GFM table for one non-empty matrix. Row 0 is the
// header; ragged rows are padded to the widest row so the table stays valid.
function sheetToMarkdownTable(name: string, matrix: RowMatrix): string {
  const width = Math.max(1, ...matrix.map((r) => r.length));
  const header = gfmRow(matrix[0] ?? [], width);
  const separator = `| ${Array(width).fill("---").join(" | ")} |`;
  const body = matrix.slice(1).map((row) => gfmRow(row, width));
  return [`## ${name}`, "", header, separator, ...body].join("\n");
}

// Flag oversized sheets without truncating any data.
function largeSheetWarning(name: string, matrix: RowMatrix): string | null {
  const cols = Math.max(0, ...matrix.map((r) => r.length));
  if (matrix.length > LARGE_ROWS || cols > LARGE_COLS) {
    return `Sheet '${name}' is large (${matrix.length} rows) — it may render as an oversized table.`;
  }
  return null;
}

/**
 * Parse an Excel workbook buffer into GFM markdown. One section per worksheet;
 * empty sheets are skipped with a warning.
 */
export async function convertXlsx(buffer: Buffer): Promise<OsParsedDocument> {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse Excel workbook: ${reason}`);
  }

  const sections: string[] = [];
  const warnings: string[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    if (matrix.length === 0) {
      warnings.push(`Sheet '${name}' is empty — skipped.`);
      continue;
    }
    const large = largeSheetWarning(name, matrix);
    if (large) warnings.push(large);
    sections.push(sheetToMarkdownTable(name, matrix));
  }

  return { markdown: sections.join("\n\n"), images: [], warnings };
}
