import crypto from "crypto";
import path from "path";
import JSZip from "jszip";
import {
  osImagePlaceholder,
  type OsExtractedImage,
} from "../../feature-utils/osConversionTypes";

interface OoxmlRelationship {
  id: string;
  target: string;
  type: string;
  isExternal: boolean;
}

interface WorkbookSheetPart {
  name: string;
  path: string;
}

interface DrawingImageAnchor {
  relationshipId: string;
  row: number;
  column: number;
  sequence: number;
  alt: string;
}

export interface XlsxSheetImageReference {
  placeholder: string;
  alt: string;
}

export interface XlsxImageExtractionResult {
  images: OsExtractedImage[];
  imagesBySheet: Map<string, XlsxSheetImageReference[]>;
  warnings: string[];
}

interface ImageExtractionContext {
  zip: JSZip;
  result: XlsxImageExtractionResult;
  assetsByMediaPath: Map<string, OsExtractedImage>;
}

const OOXML_ZIP_SIGNATURES = new Set(["504b0304", "504b0506", "504b0708"]);
const IMAGE_RELATIONSHIP_SUFFIX = "/image";
const DRAWING_RELATIONSHIP_SUFFIX = "/drawing";
const WORKSHEET_RELATIONSHIP_SUFFIX = "/worksheet";

export function isOoxmlWorkbook(buffer: Buffer): boolean {
  return buffer.length >= 4 && OOXML_ZIP_SIGNATURES.has(buffer.subarray(0, 4).toString("hex"));
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readAttribute(attributes: string, localName: string): string | null {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:^|\\s)(?:[\\w.-]+:)?${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i"
  ).exec(attributes);
  const value = match?.[1] ?? match?.[2];
  return value === undefined ? null : decodeXml(value);
}

function tagAttributes(xml: string, localName: string): string[] {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${escaped}\\b([^>]*)>`, "gi");
  return [...xml.matchAll(pattern)].map((match) => match[1] ?? "");
}

function parseRelationships(xml: string): Map<string, OoxmlRelationship> {
  const relationships = new Map<string, OoxmlRelationship>();
  for (const attributes of tagAttributes(xml, "Relationship")) {
    const id = readAttribute(attributes, "Id");
    const target = readAttribute(attributes, "Target");
    const type = readAttribute(attributes, "Type");
    if (!id || !target || !type) continue;
    relationships.set(id, {
      id,
      target,
      type,
      isExternal: readAttribute(attributes, "TargetMode")?.toLowerCase() === "external",
    });
  }
  return relationships;
}

function relationshipPartPath(partPath: string): string {
  return path.posix.join(
    path.posix.dirname(partPath),
    "_rels",
    `${path.posix.basename(partPath)}.rels`
  );
}

function resolveInternalTarget(sourcePart: string, target: string): string | null {
  const cleanTarget = target.replace(/\\/g, "/");
  if (!cleanTarget || /^[a-z][a-z0-9+.-]*:/i.test(cleanTarget)) return null;
  const packageRelative = cleanTarget.startsWith("/")
    ? cleanTarget.slice(1)
    : path.posix.join(path.posix.dirname(sourcePart), cleanTarget);
  const normalized = path.posix.normalize(packageRelative);
  if (normalized === "xl" || !normalized.startsWith("xl/")) return null;
  return normalized;
}

async function readXml(zip: JSZip, partPath: string): Promise<string | null> {
  const part = zip.file(partPath);
  return part ? part.async("string") : null;
}

async function getWorkbookSheetParts(zip: JSZip): Promise<WorkbookSheetPart[]> {
  const workbookPath = "xl/workbook.xml";
  const workbookXml = await readXml(zip, workbookPath);
  const relationshipsXml = await readXml(zip, relationshipPartPath(workbookPath));
  if (!workbookXml || !relationshipsXml) return [];
  const relationships = parseRelationships(relationshipsXml);

  return tagAttributes(workbookXml, "sheet").flatMap((attributes) => {
    const name = readAttribute(attributes, "name");
    const relationshipId = readAttribute(attributes, "id");
    const relationship = relationshipId ? relationships.get(relationshipId) : null;
    if (!name || !relationship || relationship.isExternal) return [];
    if (!relationship.type.endsWith(WORKSHEET_RELATIONSHIP_SUFFIX)) return [];
    const sheetPath = resolveInternalTarget(workbookPath, relationship.target);
    return sheetPath ? [{ name, path: sheetPath }] : [];
  });
}

function firstElementNumber(xml: string, localName: string): number | null {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `<(?:[\\w.-]+:)?${escaped}\\b[^>]*>\\s*(\\d+)\\s*</(?:[\\w.-]+:)?${escaped}>`,
    "i"
  ).exec(xml);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseDrawingAnchors(xml: string): DrawingImageAnchor[] {
  const anchors: DrawingImageAnchor[] = [];
  const anchorPattern = /<(?:[\w.-]+:)?(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)>/gi;
  let sequence = 0;
  for (const match of xml.matchAll(anchorPattern)) {
    const body = match[1] ?? "";
    const blip = tagAttributes(body, "blip")[0] ?? "";
    const relationshipId = readAttribute(blip, "embed");
    if (!relationshipId) continue;
    const fromMatch = /<(?:[\w.-]+:)?from\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?from>/i.exec(body);
    const from = fromMatch?.[1] ?? "";
    const properties = tagAttributes(body, "cNvPr")[0] ?? "";
    anchors.push({
      relationshipId,
      row: firstElementNumber(from, "row") ?? Number.MAX_SAFE_INTEGER,
      column: firstElementNumber(from, "col") ?? Number.MAX_SAFE_INTEGER,
      sequence,
      alt:
        readAttribute(properties, "descr") ??
        readAttribute(properties, "title") ??
        readAttribute(properties, "name") ??
        `Embedded image ${sequence + 1}`,
    });
    sequence += 1;
  }
  return anchors.sort(
    (left, right) =>
      left.row - right.row || left.column - right.column || left.sequence - right.sequence
  );
}

function sniffRenderableMime(data: Buffer): string | null {
  if (data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (data.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return "image/jpeg";
  const prefix = data.subarray(0, 6).toString("ascii");
  if (prefix === "GIF87a" || prefix === "GIF89a") return "image/gif";
  if (data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

function addWarningOnce(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

async function getOrCreateAsset(
  context: ImageExtractionContext,
  sheetName: string,
  mediaPath: string,
  alt: string
): Promise<OsExtractedImage | null> {
  const existing = context.assetsByMediaPath.get(mediaPath);
  if (existing) return existing;
  const mediaPart = context.zip.file(mediaPath);
  if (!mediaPart) {
    addWarningOnce(context.result.warnings, `Sheet '${sheetName}' references a missing embedded image; it was skipped.`);
    return null;
  }
  const data = await mediaPart.async("nodebuffer");
  const mime = sniffRenderableMime(data);
  if (!mime) {
    addWarningOnce(context.result.warnings, `Sheet '${sheetName}' contains an embedded image that is not web-displayable; it was skipped.`);
    return null;
  }
  const asset: OsExtractedImage = {
    placeholder: osImagePlaceholder(crypto.randomBytes(8).toString("hex")),
    data,
    mime,
    alt,
  };
  context.assetsByMediaPath.set(mediaPath, asset);
  context.result.images.push(asset);
  return asset;
}

async function extractDrawingImages(
  context: ImageExtractionContext,
  sheetName: string,
  drawingPath: string,
  sheetImages: XlsxSheetImageReference[]
): Promise<void> {
  const drawingXml = await readXml(context.zip, drawingPath);
  const relationshipsXml = await readXml(
    context.zip,
    relationshipPartPath(drawingPath)
  );
  if (!drawingXml || !relationshipsXml) {
    addWarningOnce(context.result.warnings, `Sheet '${sheetName}' has an incomplete drawing relationship; embedded images were skipped.`);
    return;
  }
  const relationships = parseRelationships(relationshipsXml);
  for (const anchor of parseDrawingAnchors(drawingXml)) {
    const relationship = relationships.get(anchor.relationshipId);
    if (!relationship || relationship.isExternal) continue;
    if (!relationship.type.endsWith(IMAGE_RELATIONSHIP_SUFFIX)) continue;
    const mediaPath = resolveInternalTarget(drawingPath, relationship.target);
    if (!mediaPath?.startsWith("xl/media/")) {
      addWarningOnce(context.result.warnings, `Sheet '${sheetName}' has an unsafe image path; an embedded image was skipped.`);
      continue;
    }
    const asset = await getOrCreateAsset(context, sheetName, mediaPath, anchor.alt);
    if (asset) sheetImages.push({ placeholder: asset.placeholder, alt: anchor.alt });
  }
}

async function extractSheetImages(
  context: ImageExtractionContext,
  sheet: WorkbookSheetPart
): Promise<void> {
  const sheetXml = await readXml(context.zip, sheet.path);
  const relationshipsXml = await readXml(
    context.zip,
    relationshipPartPath(sheet.path)
  );
  if (!sheetXml || !relationshipsXml) return;
  const relationships = parseRelationships(relationshipsXml);
  const sheetImages: XlsxSheetImageReference[] = [];

  for (const drawingAttributes of tagAttributes(sheetXml, "drawing")) {
    const drawingId = readAttribute(drawingAttributes, "id");
    const drawingRelationship = drawingId ? relationships.get(drawingId) : null;
    if (!drawingRelationship || drawingRelationship.isExternal) continue;
    if (!drawingRelationship.type.endsWith(DRAWING_RELATIONSHIP_SUFFIX)) continue;
    const drawingPath = resolveInternalTarget(sheet.path, drawingRelationship.target);
    if (!drawingPath) {
      addWarningOnce(context.result.warnings, `Sheet '${sheet.name}' has an unsafe drawing path; embedded images were skipped.`);
      continue;
    }
    await extractDrawingImages(context, sheet.name, drawingPath, sheetImages);
  }

  if (sheetImages.length > 0) {
    context.result.imagesBySheet.set(sheet.name, sheetImages);
  }
}

/** Extract standard OOXML worksheet drawing images without changing cell data. */
export async function extractXlsxImages(buffer: Buffer): Promise<XlsxImageExtractionResult> {
  const result: XlsxImageExtractionResult = {
    images: [],
    imagesBySheet: new Map(),
    warnings: [],
  };
  try {
    const zip = await JSZip.loadAsync(buffer);
    const sheets = await getWorkbookSheetParts(zip);
    const context: ImageExtractionContext = {
      zip,
      result,
      assetsByMediaPath: new Map(),
    };
    for (const sheet of sheets) {
      await extractSheetImages(context, sheet);
    }
    return result;
  } catch {
    result.warnings.push(
      "Embedded workbook images could not be inspected; cell tables were preserved."
    );
    return result;
  }
}
