import { getOsKnowledgeBaseConfig } from "../../../../config/osKnowledgeBase";
import {
  OsParsedDocument,
} from "../../feature-utils/osConversionTypes";

/**
 * PDF → GFM markdown converter (P6 T2). Ported from alloro-os pdfParser MINUS
 * the vision-transcription fallback (pdfRender.ts + @napi-rs/canvas are
 * DEFERRED, master spec R4/D-out-of-scope): deterministic per-page text
 * extraction only. Pages whose extracted text is below OS_PDF_LOW_TEXT_CHARS
 * append a warning instead of being transcribed. Embedded images are not
 * deep-extracted in v1 (images: []).
 *
 * pdfjs-dist 5.x ships ESM-only (`legacy/build/pdf.mjs`; the old CJS
 * `pdf.js` entry is gone). The backend compiles to CommonJS, so a plain
 * `await import()` is downleveled by tsc to `require()` and fails on an ESM
 * package (ERR_REQUIRE_ESM). The Function-constructor keeps a TRUE runtime
 * dynamic import that tsc cannot rewrite — the one supported way to load an
 * ESM-only dep from a CJS build here.
 */

// A text item's [a,b,c,d,e,f] transform; index 3 (d) ≈ vertical font scale.
interface PdfTextItem {
  str: string;
  transform: number[];
}
interface PdfTextContent {
  items: unknown[];
}
interface PdfPage {
  getTextContent(): Promise<PdfTextContent>;
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
interface PdfModule {
  getDocument(params: Record<string, unknown>): { promise: Promise<PdfDocument> };
}

// Heading inference: ≥1.3× the body font → `##`, ≥1.7× → `#`.
const H1_RATIO = 1.7;
const H2_RATIO = 1.3;
const APPROX_WARNING =
  "PDF text extraction is approximate; structure and tables may be imperfect.";

// True runtime ESM import (survives tsc's CommonJS downleveling — see docblock).
// The body is a fixed literal with NO interpolation; `specifier` is a function
// ARGUMENT, and every call site passes a compile-time constant string — no
// untrusted input ever reaches this, so it is not a code-injection surface.
const importEsm = new Function(
  "specifier",
  "return import(specifier);"
) as (specifier: string) => Promise<PdfModule>;

/** How the module is loaded — the default is production's Function-shim. */
export type OsPdfjsLoader = () => Promise<PdfModule>;

const defaultLoader: OsPdfjsLoader = () =>
  importEsm("pdfjs-dist/legacy/build/pdf.mjs");

// Overridable so tests inject a native `await import()` — Vitest's module runner
// does not support the Function-shim (no dynamic-import callback), while a bare
// `import()` would be downleveled to a broken require() in the CJS production
// build. Injection sidesteps both (§20.4).
let pdfjsLoader: OsPdfjsLoader = defaultLoader;
let pdfjsModule: PdfModule | null = null;

/** Test seam: swap the pdfjs loader (and reset the memoized module). */
export function setOsPdfjsLoader(loader: OsPdfjsLoader | null): void {
  pdfjsLoader = loader ?? defaultLoader;
  pdfjsModule = null;
}

async function loadPdfjs(): Promise<PdfModule> {
  if (!pdfjsModule) {
    pdfjsModule = await pdfjsLoader();
  }
  return pdfjsModule;
}

async function openDocument(buffer: Buffer): Promise<PdfDocument> {
  try {
    const pdfjs = await loadPdfjs();
    return await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0, // silence pdfjs font/glyph warnings so worker logs stay clean
    }).promise;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Failed to open PDF document (${buffer.length} bytes): ${message}`
    );
  }
}

// Narrow an unknown text-content item to the minimal {str, transform} shape.
function asTextItem(item: unknown): PdfTextItem | null {
  if (typeof item !== "object" || item === null) return null;
  const rec = item as Record<string, unknown>;
  if (typeof rec.str !== "string" || !Array.isArray(rec.transform)) return null;
  const transform = rec.transform.filter((n): n is number => typeof n === "number");
  return { str: rec.str, transform };
}

function fontSizeOf(item: PdfTextItem): number {
  return Math.abs(item.transform[3] ?? 0);
}

// Dominant ("body") font size: the most common rounded size across non-blank items.
function bodyFontSize(items: PdfTextItem[]): number {
  const counts = new Map<number, number>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const size = Math.round(fontSizeOf(item));
    if (size > 0) counts.set(size, (counts.get(size) ?? 0) + 1);
  }
  let dominant = 0;
  let best = -1;
  for (const [size, count] of counts) {
    if (count > best) {
      best = count;
      dominant = size;
    }
  }
  return dominant;
}

/**
 * Pure, pdfjs-free heading heuristic: join text items into markdown, promoting
 * items whose font is notably larger than the body size to ATX headings. Kept
 * pure so it is unit-testable without pdfjs (§20.1). Exported for tests.
 */
export function inferBlocksToMarkdown(items: PdfTextItem[]): string {
  const body = bodyFontSize(items);
  const lines = items
    .map((item) => {
      const text = item.str.trim();
      if (!text) return "";
      if (body > 0) {
        const ratio = fontSizeOf(item) / body;
        if (ratio >= H1_RATIO) return `# ${text}`;
        if (ratio >= H2_RATIO) return `## ${text}`;
      }
      return text;
    })
    .filter((line) => line.length > 0);
  return lines.join("\n");
}

async function extractPageText(page: PdfPage): Promise<string> {
  const content = await page.getTextContent();
  const items = content.items
    .map(asTextItem)
    .filter((i): i is PdfTextItem => i !== null);
  return inferBlocksToMarkdown(items);
}

/**
 * PDF → markdown (matches OsParserFn). Deterministic text extraction only;
 * low-text pages append a warning (vision transcription deferred). Pages are
 * joined with a blank line; empty pages are dropped.
 */
export async function convertPdf(buffer: Buffer): Promise<OsParsedDocument> {
  const lowTextChars = getOsKnowledgeBaseConfig().pdfLowTextChars;
  const warnings: string[] = [APPROX_WARNING];
  const doc = await openDocument(buffer);

  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const text = await extractPageText(page);
    if (text.length < lowTextChars) {
      warnings.push(
        `Page ${n} had little extractable text (image-only or scanned pages are not transcribed).`
      );
    }
    pages.push(text);
  }

  const markdown = pages.filter((p) => p.length > 0).join("\n\n");
  return { markdown, images: [], warnings };
}
