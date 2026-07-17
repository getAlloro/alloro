/**
 * Schema-completeness grading — Alloro Funnel Engine Slice 1a (get-found).
 *
 * NEW grading logic layered on the REUSED ai-seo-audit extraction. It does NOT
 * parse HTML or re-extract identity — callers pass the `schemaItems` that
 * identityExtractionService.extractIdentityFromHtml already produced (it flattens
 * `@graph` and returns each JSON-LD object). This module only GRADES those
 * objects against the field set the existing schema builders emit
 * (admin-websites SeoGeneration.significant + util.faq-schema + Google's
 * documented LocalBusiness recommendations), and returns the MISSING-field set.
 *
 * Honesty rule (spec Constraint): grade REAL schema.org fields only. Every field
 * checked here is a genuine schema.org property the builders can populate from
 * owner-approved data — never a field invented to pad a score or to pass.
 *
 * Evidence tier: DIRECTIONAL. Completeness correlates with crawl-eligibility
 * (68M-crawler study, 82% vs 55%), not with placement. Callers must not present
 * a completeness score as a ranking outcome.
 */

/** schema.org business @types the pipeline treats as the primary local entity. */
const BUSINESS_ENTITY_TYPES = new Set([
  "Dentist",
  "Physician",
  "MedicalBusiness",
  "MedicalClinic",
  "LocalBusiness",
  "Organization",
]);

/**
 * Fields graded on the primary LocalBusiness/Organization entity. All are real
 * schema.org properties the significant-section builder is told to emit
 * ("address, hours, phone, coordinates", social profiles → sameAs) plus the
 * spec-named sameAs/areaServed. `@type` and `name` anchor the entity.
 */
export const LOCAL_BUSINESS_FIELDS: readonly string[] = [
  "@type",
  "name",
  "address",
  "telephone",
  "url",
  "openingHours",
  "geo",
  "image",
  "priceRange",
  "sameAs",
  "areaServed",
];

/** Fields graded on a Service entity (service pages emit Service schema). */
export const SERVICE_FIELDS: readonly string[] = [
  "@type",
  "name",
  "serviceType",
  "provider",
  "areaServed",
  "description",
];

/** Fields graded on an FAQPage entity (built by util.faq-schema). */
export const FAQPAGE_FIELDS: readonly string[] = ["@type", "mainEntity"];

/**
 * Field aliases: a graded field counts as present if ANY of its aliases carries
 * a non-empty value. Keeps the grader honest about equivalent representations
 * the builders legitimately use (e.g. openingHoursSpecification, nested geo).
 */
const FIELD_ALIASES: Record<string, string[]> = {
  openingHours: ["openingHours", "openingHoursSpecification"],
  geo: ["geo", "latitude", "longitude", "hasMap"],
};

export type SchemaEntityKind = "LocalBusiness" | "Service" | "FAQPage";

export interface SchemaEntityGrade {
  kind: SchemaEntityKind;
  type: string;
  presentFields: string[];
  missingFields: string[];
  completeness: number; // 0..1, present / expected
}

export interface SchemaCompletenessResult {
  /** True only when at least one gradable entity was found in the schema. */
  hasGradableEntity: boolean;
  entities: SchemaEntityGrade[];
  /** Union of every missing field across all graded entities (sorted, unique). */
  missingFields: string[];
  /** Overall present/expected ratio across graded entities (0..1). */
  completeness: number;
  /**
   * Internal-only signal, never owner-facing. True when any graded entity is
   * missing one or more expected fields. Gates NOTHING (spec Constraint).
   */
  aeoIncomplete: boolean;
}

function isNonEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true; // numbers, booleans
}

function fieldPresent(record: Record<string, unknown>, field: string): boolean {
  const aliases = FIELD_ALIASES[field] ?? [field];
  return aliases.some((alias) => isNonEmpty(record[alias]));
}

function typeText(record: Record<string, unknown>): string {
  const type = record["@type"];
  if (Array.isArray(type)) return type.filter((t) => typeof t === "string").join(" ");
  return typeof type === "string" ? type : "";
}

function classify(record: Record<string, unknown>): SchemaEntityKind | null {
  const text = typeText(record);
  if (!text) return null;
  if (/\bFAQPage\b/.test(text)) return "FAQPage";
  if (BUSINESS_ENTITY_TYPES.has(text) || /Dentist|LocalBusiness|MedicalBusiness|MedicalClinic|Organization|Physician/.test(text)) {
    return "LocalBusiness";
  }
  if (/\bService\b/.test(text)) return "Service";
  return null;
}

function fieldSetFor(kind: SchemaEntityKind): readonly string[] {
  if (kind === "LocalBusiness") return LOCAL_BUSINESS_FIELDS;
  if (kind === "Service") return SERVICE_FIELDS;
  return FAQPAGE_FIELDS;
}

function gradeEntity(record: Record<string, unknown>, kind: SchemaEntityKind): SchemaEntityGrade {
  const expected = fieldSetFor(kind);
  const presentFields: string[] = [];
  const missingFields: string[] = [];
  for (const field of expected) {
    if (fieldPresent(record, field)) presentFields.push(field);
    else missingFields.push(field);
  }
  return {
    kind,
    type: typeText(record) || "unknown",
    presentFields,
    missingFields,
    completeness: expected.length > 0 ? presentFields.length / expected.length : 1,
  };
}

/**
 * Grade a page's parsed JSON-LD objects (from identityExtractionService) for
 * completeness. Pass the `schemaItems` array that extractIdentityFromHtml
 * returns — this module never re-parses HTML.
 */
export function scoreSchemaCompleteness(schemaItems: unknown[]): SchemaCompletenessResult {
  const entities: SchemaEntityGrade[] = [];

  for (const item of schemaItems) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const kind = classify(record);
    if (!kind) continue;
    entities.push(gradeEntity(record, kind));
  }

  const missingSet = new Set<string>();
  let present = 0;
  let expected = 0;
  for (const entity of entities) {
    entity.missingFields.forEach((field) => missingSet.add(field));
    present += entity.presentFields.length;
    expected += entity.presentFields.length + entity.missingFields.length;
  }

  const missingFields = Array.from(missingSet).sort();
  return {
    hasGradableEntity: entities.length > 0,
    entities,
    missingFields,
    completeness: expected > 0 ? present / expected : 0,
    aeoIncomplete: missingFields.length > 0,
  };
}
