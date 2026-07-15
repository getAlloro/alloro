import type { OsKnowledgeBaseConfig } from "../../../../config/osKnowledgeBase";
import logger from "../../../../lib/logger";
import {
  getOsLlmProvider,
  isOsModelBusyError,
} from "../service.os-llm";
import type { OsPdfPageData, OsPdfParser } from "./pdfParseAdapter";
import { renderPdfPageScreenshots } from "./pdfParseAdapter";
import {
  pdfImageMarkdown,
  pdfPageToDeterministicMarkdown,
} from "./pdfConversionMarkdown";

const PDF_VISION_MAX_ATTEMPTS = 2;
const PDF_VISION_RETRY_DELAY_MS = 250;
const IMAGE_MARKER = /\[\[IMAGE_(\d+)\]\]/g;
const GFM_TABLE = /(?:^|\n)\s*\|[^\n]+\|\s*\n\s*\|(?:\s*:?-{3,}:?\s*\|)+/;

export interface OsPdfVisionResult {
  pages: string[];
  warnings: string[];
}

function needsVision(page: OsPdfPageData, lowTextChars: number): boolean {
  return (
    page.text.length < lowTextChars ||
    page.hasTabularLayout ||
    page.images.length > 0
  );
}

function validateVisionMarkdown(
  markdown: string,
  page: OsPdfPageData
): string | null {
  const trimmed = markdown.trim();
  if (!trimmed || trimmed.startsWith("```") || trimmed.includes("__ALLORO_OS_IMG_")) {
    return null;
  }
  if (/<img\b|data:image|!\[[^\]]*\]\((?!\[\[IMAGE_)/i.test(trimmed)) {
    return null;
  }
  if (page.hasTabularLayout && !GFM_TABLE.test(trimmed)) return null;

  const seen = new Set<number>();
  for (const match of trimmed.matchAll(IMAGE_MARKER)) {
    const imageNumber = Number(match[1]);
    if (
      imageNumber < 1 ||
      imageNumber > page.images.length ||
      seen.has(imageNumber)
    ) {
      return null;
    }
    seen.add(imageNumber);
  }
  return trimmed;
}

export function placePdfImages(
  markdown: string,
  page: OsPdfPageData
): string {
  const used = new Set<number>();
  const withMarkers = markdown.replace(IMAGE_MARKER, (_marker, rawIndex: string) => {
    const index = Number(rawIndex);
    used.add(index);
    return pdfImageMarkdown({ ...page, images: [page.images[index - 1]] })[0];
  });
  const unmatched = pdfImageMarkdown({
    ...page,
    images: page.images.filter((_image, index) => !used.has(index + 1)),
  });
  return [withMarkers, ...unmatched].filter(Boolean).join("\n\n");
}

async function transcribeWithBusyRetry(
  page: OsPdfPageData,
  screenshotPng: Buffer
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PDF_VISION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await getOsLlmProvider().transcribeDocumentPageToMarkdown({
        pageNumber: page.pageNumber,
        screenshotPng,
        extractedText: page.text,
        imageCount: page.images.length,
      });
    } catch (error) {
      lastError = error;
      if (!isOsModelBusyError(error) || attempt === PDF_VISION_MAX_ATTEMPTS) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, PDF_VISION_RETRY_DELAY_MS));
    }
  }
  throw lastError;
}

/** Apply vision to selected pages without ever making conversion depend on it. */
export async function transcribePdfLayoutPages(
  parser: OsPdfParser,
  pages: OsPdfPageData[],
  config: OsKnowledgeBaseConfig
): Promise<OsPdfVisionResult> {
  const warnings: string[] = [];
  const candidates = pages.filter((page) => needsVision(page, config.pdfLowTextChars));
  const selected = candidates.slice(0, config.pdfVisionMaxPages);
  if (candidates.length > selected.length) {
    warnings.push(
      `PDF vision was capped at ${config.pdfVisionMaxPages} pages; remaining layout-heavy pages used deterministic extraction.`
    );
  }

  let screenshots: Map<number, Buffer>;
  try {
    screenshots = await renderPdfPageScreenshots(
      parser,
      selected.map((page) => page.pageNumber),
      config.pdfScreenshotWidth
    );
  } catch (error) {
    logger.warn({ err: error }, "[ADMIN-OS] PDF page rendering failed; using deterministic extraction");
    return {
      pages: pages.map(pdfPageToDeterministicMarkdown),
      warnings: [
        ...warnings,
        "PDF page rendering failed; deterministic extraction was preserved.",
      ],
    };
  }

  const selectedNumbers = new Set(selected.map((page) => page.pageNumber));
  const output: string[] = [];
  for (const page of pages) {
    if (!selectedNumbers.has(page.pageNumber)) {
      output.push(pdfPageToDeterministicMarkdown(page));
      continue;
    }
    const screenshot = screenshots.get(page.pageNumber);
    if (!screenshot) {
      warnings.push(`Page ${page.pageNumber} screenshot was unavailable; deterministic extraction was preserved.`);
      output.push(pdfPageToDeterministicMarkdown(page));
      continue;
    }
    try {
      const reply = await transcribeWithBusyRetry(page, screenshot);
      const validated = validateVisionMarkdown(reply, page);
      if (!validated) {
        warnings.push(`Page ${page.pageNumber} visual transcription was malformed; deterministic extraction was preserved.`);
        output.push(pdfPageToDeterministicMarkdown(page));
        continue;
      }
      output.push(placePdfImages(validated, page));
    } catch (error) {
      logger.warn(
        { err: error, pageNumber: page.pageNumber },
        "[ADMIN-OS] PDF visual transcription failed; using deterministic extraction"
      );
      warnings.push(`Page ${page.pageNumber} visual transcription failed; deterministic extraction was preserved.`);
      output.push(pdfPageToDeterministicMarkdown(page));
    }
  }
  return { pages: output, warnings };
}
