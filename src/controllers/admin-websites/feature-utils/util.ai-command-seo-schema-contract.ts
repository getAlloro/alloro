/**
 * Narrow row contract shared by the page SEO schema executor and verifier.
 *
 * The recommendation model still exposes legacy raw rows to the wider AI
 * command pipeline. This contract keeps the new Slice 1b path typed without
 * pretending the rest of that legacy surface has already been migrated.
 */
export interface PageSeoSchemaRecommendationRow {
  id: string;
  target_id: string;
  target_type?: "page_seo_schema";
  target_label?: string | null;
  target_meta: unknown;
  execution_result?: unknown;
}

/** A JSON-LD array member must be a non-null object, never a scalar or array. */
export function isJsonLdEntry(entry: unknown): entry is Record<string, unknown> {
  return typeof entry === "object" && entry !== null && !Array.isArray(entry);
}

/** Parse an unknown recommendation metadata value without trusting its shape. */
export function parseRecommendationMeta(value: unknown): Record<string, unknown> | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  return isJsonLdEntry(parsed) ? parsed : null;
}

/** Return the approved schema only when it matches the writer's full contract. */
export function readApprovedSchema(
  targetMeta: unknown
): Record<string, unknown>[] | null {
  const meta = parseRecommendationMeta(targetMeta);
  const schema = meta?.schema_json;
  if (!Array.isArray(schema) || schema.length === 0 || !schema.every(isJsonLdEntry)) {
    return null;
  }
  return schema;
}
