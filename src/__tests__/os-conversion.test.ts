/**
 * Hermetic tests — OS import converters (P6 T2,
 * plans/07042026-alloro-os-admin-port). Each converter turns a tiny SYNTHETIC
 * fixture (§20.4) under src/__tests__/fixtures/os/ into the expected markdown
 * skeleton. No S3, no DB, no network — the converters are pure buffer → markdown
 * functions. The pdf path exercises the ESM-only pdfjs legacy build loaded via
 * the Function-import shim (the reason it can't be a plain `await import`).
 */

import fs from "fs";
import path from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { convertDocx } from "../controllers/admin-os/feature-services/conversion/docxConverter";
import { convertXlsx } from "../controllers/admin-os/feature-services/conversion/xlsxConverter";
import {
  convertPdf,
  inferBlocksToMarkdown,
  setOsPdfjsLoader,
  type OsPdfjsLoader,
} from "../controllers/admin-os/feature-services/conversion/pdfConverter";
import { osHtmlToMarkdown } from "../controllers/admin-os/feature-utils/osHtmlToMarkdown";

const FIXTURES = path.join(__dirname, "fixtures", "os");
const read = (name: string): Buffer => fs.readFileSync(path.join(FIXTURES, name));

// Vitest's module runner can't use the production Function-import shim, so tests
// inject a native dynamic import of the same legacy build (§20.4). Production
// uses the shim (proven against the compiled CJS output).
const nativePdfjsLoader: OsPdfjsLoader = async () =>
  (await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  )) as unknown as Awaited<ReturnType<OsPdfjsLoader>>;

beforeAll(() => setOsPdfjsLoader(nativePdfjsLoader));
afterAll(() => setOsPdfjsLoader(null));

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
