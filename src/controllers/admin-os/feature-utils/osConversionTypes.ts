/**
 * Shared contracts for the OS file-import conversion pipeline
 * (plans/07042026-alloro-os-admin-port, P6 T2). Ported from
 * alloro-os/backend/src/services/conversion/types.ts.
 */

/**
 * An image pulled out of a source file. The parser embeds `placeholder` in the
 * markdown (as `![alt](placeholder)`); the convert step uploads `data` to S3
 * and rewrites the placeholder to the real /api/admin/os/assets/:id URL.
 * Placeholders are scheme-free tokens so the HTML sanitizer treats them as
 * relative and keeps them.
 */
export interface OsExtractedImage {
  placeholder: string;
  data: Buffer;
  /** image/png | image/jpeg | image/gif | image/webp */
  mime: string;
  /** original alt text from the source, if any */
  alt?: string;
}

/**
 * What every parser returns: GFM markdown, the images it pulled out, and any
 * best-effort notes (e.g. "PDF text extraction is approximate").
 */
export interface OsParsedDocument {
  markdown: string;
  images: OsExtractedImage[];
  warnings: string[];
}

/** A parser turns raw file bytes into an OsParsedDocument. One per format. */
export type OsParserFn = (buffer: Buffer) => Promise<OsParsedDocument>;

/** Build a scheme-free placeholder token for an extracted image. */
export function osImagePlaceholder(id: string): string {
  return `__ALLORO_OS_IMG_${id}__`;
}
