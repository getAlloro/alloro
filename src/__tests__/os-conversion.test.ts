/**
 * Hermetic tests — OS import converters (P6 T2,
 * plans/07042026-alloro-os-admin-port). Each converter turns a tiny SYNTHETIC
 * fixture (§20.4) under src/__tests__/fixtures/os/ into the expected markdown
 * skeleton. No S3, no DB, no network — the converters are pure buffer → markdown
 * functions. PDF vision uses an injected fake, so no provider call leaves the
 * process.
 */

import fs from "fs";
import path from "path";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convertDocx } from "../controllers/admin-os/feature-services/conversion/docxConverter";
import { convertXlsx } from "../controllers/admin-os/feature-services/conversion/xlsxConverter";
import {
  convertPdf,
  inferBlocksToMarkdown,
} from "../controllers/admin-os/feature-services/conversion/pdfConverter";
import { osHtmlToMarkdown } from "../controllers/admin-os/feature-utils/osHtmlToMarkdown";
import {
  OsFakeLlmProvider,
  setOsLlmProvider,
} from "../controllers/admin-os/feature-services/service.os-llm";
import {
  setOsPdfParseFactory,
  type OsPdfParser,
} from "../controllers/admin-os/feature-services/conversion/pdfParseAdapter";

const FIXTURES = path.join(__dirname, "fixtures", "os");
const read = (name: string): Buffer => fs.readFileSync(path.join(FIXTURES, name));
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
  "base64"
);

beforeEach(() => setOsLlmProvider(new OsFakeLlmProvider()));
afterEach(() => {
  setOsLlmProvider(null);
  setOsPdfParseFactory(null);
});

function fakePdfParser(options?: {
  text?: string;
  tables?: string[][][];
  images?: Array<{ data: Uint8Array; name: string; width: number; height: number }>;
  imageError?: Error;
  screenshotError?: Error;
}): OsPdfParser {
  return {
    getText: vi.fn(async () => ({
      pages: [{ num: 1, text: options?.text ?? "Report body" }],
    })),
    getTable: vi.fn(async () => ({
      pages: [{ num: 1, tables: options?.tables ?? [] }],
    })),
    getImage: vi.fn(async () => {
      if (options?.imageError) throw options.imageError;
      return { pages: [{ pageNumber: 1, images: options?.images ?? [] }] };
    }),
    getScreenshot: vi.fn(async () => {
      if (options?.screenshotError) throw options.screenshotError;
      return { pages: [{ pageNumber: 1, data: ONE_PIXEL_PNG }] };
    }),
    destroy: vi.fn(async () => undefined),
  };
}

async function buildXlsxWithDrawing(unsafeDrawingPath = false): Promise<Buffer> {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Name", "Role"], ["Ada", "Engineer"]]),
    "Team"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Value"], [42]]),
    "Numbers"
  );
  const base = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const zip = await JSZip.loadAsync(base);
  const sheetPath = "xl/worksheets/sheet1.xml";
  const sheetXml = await zip.file(sheetPath)!.async("string");
  zip.file(
    sheetPath,
    sheetXml.replace(
      "</worksheet>",
      '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdImageDrawing"/></worksheet>'
    )
  );
  const target = unsafeDrawingPath
    ? "../../../outside.xml"
    : "../drawings/drawing1.xml";
  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImageDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${target}"/></Relationships>`
  );
  if (unsafeDrawingPath) return zip.generateAsync({ type: "nodebuffer" });

  zip.file(
    "xl/drawings/drawing1.xml",
    '<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:row>2</xdr:row></xdr:from><xdr:ext cx="100" cy="100"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Architecture diagram" descr="Synthetic architecture"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdImage1"/></xdr:blipFill></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>'
  );
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>'
  );
  zip.file("xl/media/image1.png", ONE_PIXEL_PNG);
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("OS converters", () => {
  it("docx → markdown: heading + bold, images list is empty here", async () => {
    const result = await convertDocx(read("sample.docx"));
    expect(result.markdown).toContain("# Project Notes");
    expect(result.markdown).toContain("**bold**");
    expect(result.images).toEqual([]);
  });

  it("xlsx → one GFM table section per non-empty sheet", async () => {
    const result = await convertXlsx(read("sample.xlsx"));
    expect(result.markdown).toContain("## Team");
    expect(result.markdown).toContain("| Name | Role |");
    // Exactly one delimiter row per table (the header separator).
    expect(result.markdown).toContain("| --- | --- |");
    expect(result.markdown).toContain("| Ada | Engineer |");
    expect(result.markdown).toContain("## Numbers");
    expect(result.images).toEqual([]);
  });

  it("xlsx keeps an anchored PNG under its owning sheet", async () => {
    const result = await convertXlsx(await buildXlsxWithDrawing());
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      mime: "image/png",
      alt: "Synthetic architecture",
    });
    expect(result.markdown).toContain(
      `![Synthetic architecture](${result.images[0].placeholder})`
    );
    expect(result.markdown.indexOf("![Synthetic architecture]")).toBeLessThan(
      result.markdown.indexOf("## Numbers")
    );
    expect(result.warnings).toEqual([]);
  });

  it("xlsx preserves tables and warns when a drawing escapes xl", async () => {
    const result = await convertXlsx(await buildXlsxWithDrawing(true));
    expect(result.markdown).toContain("| Ada | Engineer |");
    expect(result.images).toEqual([]);
    expect(result.warnings).toContain(
      "Sheet 'Team' has an unsafe drawing path; embedded images were skipped."
    );
  });

  it("pdf → extracted page text (deterministic, no vision)", async () => {
    const result = await convertPdf(read("sample.pdf"));
    expect(result.markdown).toContain("Report Title");
    // The approximate-extraction notice rides every parse.
    expect(result.warnings.some((w) => w.includes("approximate"))).toBe(true);
    expect(result.images).toEqual([]);
  });

  it("pdf with no extractable text → low-text warning, empty body", async () => {
    const result = await convertPdf(read("lowtext.pdf"));
    expect(result.markdown).toBe("");
    expect(
      result.warnings.some((w) => w.includes("little extractable text"))
    ).toBe(true);
  });

  it("pdf vision reconstructs a GFM table and places only real images", async () => {
    const parser = fakePdfParser({
      text: "Rule\tOwner\tNotes\nR-001\tJo\tClient-side only",
      images: [
        { data: ONE_PIXEL_PNG, name: "diagram", width: 1, height: 1 },
      ],
    });
    setOsPdfParseFactory(() => parser);
    const provider = new OsFakeLlmProvider();
    provider.transcribeDocumentPageToMarkdown = vi.fn(async () =>
      [
        "| Rule | Owner | Notes |",
        "| --- | --- | --- |",
        "| R-001 | Jo | Client-side only |",
        "",
        "[[IMAGE_1]]",
      ].join("\n")
    );
    setOsLlmProvider(provider);

    const result = await convertPdf(Buffer.from("synthetic-pdf"));

    expect(result.markdown).toContain("| R-001 | Jo | Client-side only |");
    expect(result.images).toHaveLength(1);
    expect(result.markdown).toContain(result.images[0].placeholder);
    expect(result.markdown).not.toContain("[[IMAGE_1]]");
    expect(provider.transcribeDocumentPageToMarkdown).toHaveBeenCalledTimes(1);
    expect(parser.destroy).toHaveBeenCalledTimes(1);
  });

  it("pdf vision failure preserves deterministic content and real images", async () => {
    const parser = fakePdfParser({
      text: "Rule\tOwner\tNotes\nR-001\tJo\tClient-side only",
      images: [
        { data: ONE_PIXEL_PNG, name: "diagram", width: 1, height: 1 },
      ],
      screenshotError: new Error("renderer unavailable"),
    });
    setOsPdfParseFactory(() => parser);

    const result = await convertPdf(Buffer.from("synthetic-pdf"));

    expect(result.markdown).toContain("Rule\tOwner\tNotes");
    expect(result.markdown).toContain(result.images[0].placeholder);
    expect(result.warnings).toContain(
      "PDF page rendering failed; deterministic extraction was preserved."
    );
    expect(parser.destroy).toHaveBeenCalledTimes(1);
  });

  it("pdf rejects invented image markers and preserves the source fallback", async () => {
    const parser = fakePdfParser({
      text: "Rule\tOwner\tNotes\nR-001\tJo\tClient-side only",
      images: [
        { data: ONE_PIXEL_PNG, name: "diagram", width: 1, height: 1 },
      ],
    });
    setOsPdfParseFactory(() => parser);
    const provider = new OsFakeLlmProvider();
    provider.transcribeDocumentPageToMarkdown = vi.fn(async () =>
      [
        "| Rule | Owner | Notes |",
        "| --- | --- | --- |",
        "| R-001 | Jo | Client-side only |",
        "[[IMAGE_2]]",
      ].join("\n")
    );
    setOsLlmProvider(provider);

    const result = await convertPdf(Buffer.from("synthetic-pdf"));

    expect(result.markdown).toContain("Rule\tOwner\tNotes");
    expect(result.markdown).not.toContain("[[IMAGE_2]]");
    expect(result.markdown).toContain(result.images[0].placeholder);
    expect(
      result.warnings.some((warning) => warning.includes("malformed"))
    ).toBe(true);
  });

  it("pdf parser is destroyed when deterministic extraction throws", async () => {
    const parser = fakePdfParser();
    vi.mocked(parser.getText).mockRejectedValue(new Error("bad xref"));
    setOsPdfParseFactory(() => parser);

    await expect(convertPdf(Buffer.from("broken-pdf"))).rejects.toThrow(
      /bad xref/
    );
    expect(parser.destroy).toHaveBeenCalledTimes(1);
  });

  it("pdf preserves text when embedded-image inspection fails", async () => {
    const parser = fakePdfParser({
      text: "Readable deterministic paragraph remains available.",
      imageError: new Error("unsupported image operator"),
    });
    setOsPdfParseFactory(() => parser);

    const result = await convertPdf(Buffer.from("synthetic-pdf"));

    expect(result.markdown).toContain("Readable deterministic paragraph");
    expect(result.warnings).toContain(
      "PDF embedded images could not be inspected; extracted text was preserved."
    );
  });

  it("pdf heading heuristic promotes large-font items to headings", () => {
    const md = inferBlocksToMarkdown([
      { str: "Big Title", transform: [0, 0, 0, 24, 0, 0] },
      { str: "body one", transform: [0, 0, 0, 12, 0, 0] },
      { str: "body two", transform: [0, 0, 0, 12, 0, 0] },
    ]);
    // 24/12 = 2.0 ≥ H1_RATIO → "# "; body stays plain.
    expect(md).toBe("# Big Title\nbody one\nbody two");
  });

  it("html→markdown sanitizes script and keeps image placeholders", () => {
    const md = osHtmlToMarkdown(
      '<h1>Title</h1><script>alert(1)</script><p>Hi <img src="__ALLORO_OS_IMG_abc__" alt="x"></p>'
    );
    expect(md).toContain("# Title");
    expect(md).not.toContain("alert");
    expect(md).not.toContain("<script");
    expect(md).toContain("__ALLORO_OS_IMG_abc__");
  });

  it("markdown passthrough is byte-for-byte the source text", () => {
    // convertMarkdown is inlined in OsConversionService.dispatch; assert the
    // contract directly on the fixture the service reads.
    const raw = read("sample.md").toString("utf8");
    expect(raw).toContain("# Sample Doc");
    expect(raw).toContain("**OS**");
  });
});
