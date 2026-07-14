import { getOsKnowledgeBaseConfig } from "../../../../config/osKnowledgeBase";
import type { OsParsedDocument } from "../../feature-utils/osConversionTypes";
import {
  createOsPdfParser,
  extractPdfDocument,
  setOsPdfParseFactory,
  type OsPdfParseFactory,
} from "./pdfParseAdapter";
import {
  joinPdfPages,
} from "./pdfConversionMarkdown";
import { transcribePdfLayoutPages } from "./pdfVisionConverter";

export { setOsPdfParseFactory };
export type { OsPdfParseFactory };

interface PdfTextItem {
  str: string;
  transform: number[];
}

const H1_RATIO = 1.7;
const H2_RATIO = 1.3;
const APPROX_WARNING =
  "PDF conversion is approximate and best-effort; complex layout may require visual transcription.";

function fontSizeOf(item: PdfTextItem): number {
  return Math.abs(item.transform[3] ?? 0);
}

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

/** Retained pure heading heuristic for callers/tests that use positioned items. */
export function inferBlocksToMarkdown(items: PdfTextItem[]): string {
  const body = bodyFontSize(items);
  return items
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
    .filter(Boolean)
    .join("\n");
}

/** PDF to semantic Markdown with deterministic text/table/image extraction. */
export async function convertPdf(buffer: Buffer): Promise<OsParsedDocument> {
  const config = getOsKnowledgeBaseConfig();
  const parser = createOsPdfParser(buffer);
  try {
    const document = await extractPdfDocument(parser, config.pdfImageThreshold);
    const visual = await transcribePdfLayoutPages(parser, document.pages, config);
    const warnings = [APPROX_WARNING, ...document.warnings, ...visual.warnings];
    for (const page of document.pages) {
      if (page.text.length < config.pdfLowTextChars) {
        warnings.push(
          `Page ${page.pageNumber} had little extractable text; preserved images and deterministic content where available.`
        );
      }
    }
    return {
      markdown: joinPdfPages(visual.pages),
      images: document.images,
      warnings,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Failed to convert PDF (${buffer.length} bytes): ${message}`);
  } finally {
    await parser.destroy();
  }
}
