import { PDFParse } from "pdf-parse";
import { osImagePlaceholder, type OsExtractedImage } from "../../feature-utils/osConversionTypes";

export type OsPdfTable = string[][];

export interface OsPdfPageData {
  pageNumber: number;
  text: string;
  tables: OsPdfTable[];
  images: OsExtractedImage[];
  hasTabularLayout: boolean;
}

export interface OsPdfDocumentData {
  pages: OsPdfPageData[];
  images: OsExtractedImage[];
  warnings: string[];
}

export interface OsPdfParser {
  getText(params?: Record<string, unknown>): Promise<{
    pages: Array<{ num: number; text: string }>;
  }>;
  getTable(params?: Record<string, unknown>): Promise<{
    pages: Array<{ num: number; tables: OsPdfTable[] }>;
  }>;
  getImage(params?: Record<string, unknown>): Promise<{
    pages: Array<{
      pageNumber: number;
      images: Array<{
        data: Uint8Array;
        name: string;
        width: number;
        height: number;
      }>;
    }>;
  }>;
  getScreenshot(params?: Record<string, unknown>): Promise<{
    pages: Array<{ pageNumber: number; data: Uint8Array }>;
  }>;
  destroy(): Promise<void>;
}

export type OsPdfParseFactory = (buffer: Buffer) => OsPdfParser;

const defaultFactory: OsPdfParseFactory = (buffer) =>
  new PDFParse({ data: buffer }) as OsPdfParser;

let pdfParseFactory: OsPdfParseFactory = defaultFactory;

/** Hermetic test seam; production always uses the installed pdf-parse package. */
export function setOsPdfParseFactory(factory: OsPdfParseFactory | null): void {
  pdfParseFactory = factory ?? defaultFactory;
}

export function createOsPdfParser(buffer: Buffer): OsPdfParser {
  return pdfParseFactory(buffer);
}

function sniffRasterMime(data: Buffer): string | null {
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) {
    return "image/jpeg";
  }
  const prefix = data.subarray(0, 6).toString("ascii");
  if (prefix === "GIF87a" || prefix === "GIF89a") return "image/gif";
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function hasTabularText(text: string): boolean {
  return text
    .split("\n")
    .some((line) => line.split("\t").filter((cell) => cell.trim()).length >= 3);
}

function mapPageImages(
  pages: Awaited<ReturnType<OsPdfParser["getImage"]>>["pages"],
  warnings: string[]
): Map<number, OsExtractedImage[]> {
  const byPage = new Map<number, OsExtractedImage[]>();
  for (const page of pages) {
    const extracted: OsExtractedImage[] = [];
    for (const [index, source] of page.images.entries()) {
      const data = Buffer.from(source.data);
      const mime = sniffRasterMime(data);
      if (!mime) {
        warnings.push(
          `Page ${page.pageNumber} contained an unsupported embedded image (${source.name || `image ${index + 1}`}).`
        );
        continue;
      }
      extracted.push({
        placeholder: osImagePlaceholder(`pdf_p${page.pageNumber}_${index + 1}`),
        data,
        mime,
        alt: `PDF page ${page.pageNumber} image ${index + 1}`,
      });
    }
    byPage.set(page.pageNumber, extracted);
  }
  return byPage;
}

async function extractTablesSafely(
  parser: OsPdfParser,
  warnings: string[]
): Promise<Awaited<ReturnType<OsPdfParser["getTable"]>>["pages"]> {
  try {
    return (await parser.getTable()).pages;
  } catch {
    warnings.push(
      "PDF table geometry could not be inspected; extracted text was preserved."
    );
    return [];
  }
}

async function extractImagesSafely(
  parser: OsPdfParser,
  imageThreshold: number,
  warnings: string[]
): Promise<Awaited<ReturnType<OsPdfParser["getImage"]>>["pages"]> {
  try {
    const result = await parser.getImage({
      imageThreshold,
      imageBuffer: true,
      imageDataUrl: false,
    });
    return result.pages;
  } catch {
    warnings.push(
      "PDF embedded images could not be inspected; extracted text was preserved."
    );
    return [];
  }
}

/** Extract text, grid tables, and browser-safe raster images in page order. */
export async function extractPdfDocument(
  parser: OsPdfParser,
  imageThreshold: number
): Promise<OsPdfDocumentData> {
  const warnings: string[] = [];
  const textResult = await parser.getText({
    cellSeparator: "\t",
    lineEnforce: true,
    pageJoiner: "",
  });
  const tablePages = await extractTablesSafely(parser, warnings);
  const imagePages = await extractImagesSafely(parser, imageThreshold, warnings);

  const tableByPage = new Map(tablePages.map((page) => [page.num, page.tables]));
  const imageByPage = mapPageImages(imagePages, warnings);
  const pages = textResult.pages.map((page) => {
    const tables = tableByPage.get(page.num) ?? [];
    const images = imageByPage.get(page.num) ?? [];
    return {
      pageNumber: page.num,
      text: page.text.trim(),
      tables,
      images,
      hasTabularLayout: tables.length > 0 || hasTabularText(page.text),
    };
  });

  return {
    pages,
    images: pages.flatMap((page) => page.images),
    warnings,
  };
}

/** Render only selected pages for the bounded vision path. */
export async function renderPdfPageScreenshots(
  parser: OsPdfParser,
  pageNumbers: number[],
  desiredWidth: number
): Promise<Map<number, Buffer>> {
  if (pageNumbers.length === 0) return new Map();
  const result = await parser.getScreenshot({
    partial: pageNumbers,
    desiredWidth,
    imageBuffer: true,
    imageDataUrl: false,
  });
  return new Map(
    result.pages.map((page) => [page.pageNumber, Buffer.from(page.data)])
  );
}
