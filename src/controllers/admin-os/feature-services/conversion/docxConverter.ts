import crypto from "crypto";
import mammoth from "mammoth";
import JSZip from "jszip";
import { osHtmlToMarkdown } from "../../feature-utils/osHtmlToMarkdown";
import {
  OsExtractedImage,
  OsParsedDocument,
  osImagePlaceholder,
} from "../../feature-utils/osConversionTypes";

/**
 * .docx → GFM markdown converter (P6 T2). Ported from alloro-os docxParser:
 * mammoth converts to HTML, osHtmlToMarkdown sanitizes + markdownifies, and
 * renderable embedded images become scheme-free placeholders the convert step
 * uploads to S3 and rewrites. jszip reads the page header/footer as a title /
 * empty-body fallback.
 */

// Raster image types a browser renders inline. Anything else mammoth pulls out
// of a .docx (EMF/WMF vector art, TIFF, …) is skipped rather than embedded.
const RENDERABLE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

// mammoth's runtime image. The published types omit `altText` (read off the
// element inside images.js), so we declare the shape we actually consume.
interface MammothImage {
  contentType: string;
  altText?: string;
  read(): Promise<Buffer>;
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function unescapeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * True when the markdown already opens with a heading whose text equals `text`
 * (so we don't prepend a duplicate title).
 */
function startsWithHeading(markdown: string, text: string): boolean {
  const firstLine = markdown.trimStart().split("\n", 1)[0] ?? "";
  if (!/^#{1,6}\s/.test(firstLine)) return false;
  const norm = (s: string) =>
    s.replace(/^#{1,6}\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();
  return norm(firstLine) === norm(text);
}

/**
 * Read text from a .docx's header (or footer) parts, matched by `pattern`.
 * Footers are only used as an empty-body fallback; headers are promoted to the
 * title.
 */
async function extractPartsText(buffer: Buffer, pattern: RegExp): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const parts = Object.keys(zip.files)
    .filter((name) => pattern.test(name))
    .sort();
  const blocks: string[] = [];
  for (const name of parts) {
    const xml = await zip.files[name].async("string");
    const text = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? [])
      .map((tag) => unescapeXml(tag.replace(/<[^>]+>/g, "")))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text) blocks.push(text);
  }
  return [...new Set(blocks)].join(" ");
}

/**
 * Build mammoth's convertImage handler: collect renderable rasters as
 * placeholders, drop everything else (with a warning) by returning empty `src`.
 */
function buildImageConverter(
  images: OsExtractedImage[],
  warnings: string[]
) {
  return mammoth.images.imgElement(async (image) => {
    const img = image as unknown as MammothImage;
    if (!RENDERABLE_MIME.has(img.contentType)) {
      warnings.push(
        `An embedded image of type ${img.contentType} was skipped (not web-displayable).`
      );
      return { src: "" };
    }
    const data = await img.read();
    const placeholder = osImagePlaceholder(crypto.randomBytes(8).toString("hex"));
    images.push({ placeholder, data, mime: img.contentType, alt: img.altText });
    return { src: placeholder, alt: img.altText ?? "" };
  });
}

/**
 * Parse a .docx buffer into GFM markdown plus the renderable images it carried.
 * Images become scheme-free placeholders the convert step uploads + rewrites.
 */
export async function convertDocx(buffer: Buffer): Promise<OsParsedDocument> {
  const images: OsExtractedImage[] = [];
  const warnings: string[] = [];
  const convertImage = buildImageConverter(images, warnings);

  let html: string;
  let messages: ReadonlyArray<{ message: string }>;
  try {
    const result = await mammoth.convertToHtml({ buffer }, { convertImage });
    html = result.value;
    messages = result.messages;
  } catch (cause) {
    throw new Error(`Failed to parse .docx document: ${errorMessage(cause)}`);
  }

  for (const message of messages) warnings.push(message.message);

  let markdown = osHtmlToMarkdown(html);
  const headerText = await extractPartsText(buffer, /^word\/header\d*\.xml$/i);

  if (headerText) {
    // The page header is usually the real title. Promote it to a top-level
    // heading so the body has a title + ToC anchor — unless the body opens
    // with it already.
    const heading = `# ${headerText}`;
    if (!markdown.trim()) {
      markdown = heading;
      warnings.push("The document body was empty; used the page header as the title.");
    } else if (!startsWithHeading(markdown, headerText)) {
      markdown = `${heading}\n\n${markdown}`;
    }
  } else if (!markdown.trim()) {
    // No header, empty body — fall back to footer text so the doc isn't blank.
    const footerText = await extractPartsText(buffer, /^word\/footer\d*\.xml$/i);
    if (footerText) {
      markdown = footerText;
      warnings.push("The document body was empty; captured text from the page footer.");
    }
  }

  return { markdown, images, warnings };
}
