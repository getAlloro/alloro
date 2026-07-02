/**
 * Schema.org business-type allowlist.
 *
 * The SEO generation prompt (SeoGeneration.significant.md) once instructed
 * the model to invent a "closest valid MedicalBusiness subtype" for a
 * specialty practice (e.g. "Orthodontist", "Endodontist"-equivalent) — neither
 * exists in schema.org's vocabulary, so Google's Rich Results parser almost
 * certainly drops the whole block on any page carrying one. The prompt is
 * fixed to stop asking for this, but a code-level guard is required too:
 * an LLM's free-text field can't be trusted to stay compliant on retries or
 * future prompt drift, so every schema_json entry is sanitized after
 * generation regardless of what the model produced.
 */

const VALID_BUSINESS_SCHEMA_TYPES = new Set([
  "Dentist",
  "Physician",
  "MedicalBusiness",
  "MedicalClinic",
  "LocalBusiness",
  "Organization",
]);

/** Other legitimate schema.org kinds this pipeline emits — never business types, never sanitized. */
const KNOWN_NON_BUSINESS_SCHEMA_TYPES = new Set([
  "BreadcrumbList",
  "Service",
  "FAQPage",
  "CollectionPage",
  "WebPage",
  "AboutPage",
  "ContactPage",
  "WebSite",
  "ItemList",
  "Blog",
  "Person",
  "Article",
  "BlogPosting",
  "AggregateRating",
  "Question",
  "Answer",
]);

/** Fallback type when a schema_json entry's @type is neither a valid business type nor a known non-business kind. */
const FALLBACK_BUSINESS_TYPE = "MedicalBusiness";

/**
 * Replace an invented/unrecognized @type on one schema_json entry with the
 * safe fallback. Entries whose @type is already valid, or is a known
 * non-business schema kind (Service, FAQPage, BreadcrumbList, ...), pass
 * through unchanged.
 */
export function sanitizeSchemaEntryType<T extends Record<string, unknown>>(
  entry: T
): T {
  const type = entry["@type"];
  if (typeof type !== "string") return entry;
  if (VALID_BUSINESS_SCHEMA_TYPES.has(type) || KNOWN_NON_BUSINESS_SCHEMA_TYPES.has(type)) {
    return entry;
  }
  return { ...entry, "@type": FALLBACK_BUSINESS_TYPE };
}

/**
 * Sanitize every entry of a schema_json array. Non-array or malformed input
 * returns an empty array rather than throwing — schema_json is optional data,
 * not a required contract.
 */
export function sanitizeSchemaJsonTypes(schemaJson: unknown): Record<string, unknown>[] {
  if (!Array.isArray(schemaJson)) return [];
  return schemaJson.map((entry) =>
    entry && typeof entry === "object"
      ? sanitizeSchemaEntryType(entry as Record<string, unknown>)
      : entry
  );
}

/** True when a schema_json entry represents the primary business/location entity (has a postal address). */
export function isBusinessEntitySchema(entry: unknown): entry is Record<string, unknown> {
  if (!entry || typeof entry !== "object") return false;
  const record = entry as Record<string, unknown>;
  const type = record["@type"];
  return (
    typeof type === "string" &&
    VALID_BUSINESS_SCHEMA_TYPES.has(type) &&
    "address" in record
  );
}
