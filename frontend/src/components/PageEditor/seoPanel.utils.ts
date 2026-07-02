import { type SeoData } from "../../api/websites";
import { type SectionScore } from "./seoPanel.types";

// ---------------------------------------------------------------------------
// Canonical correctness assessment
//
// "Canonical tag" used to score full points on mere presence — which let a
// canonical pointing at a dead legacy URL (or a different host entirely)
// hide behind an 8/8 while actively harming indexing. The criterion is now
// a correctness check: present + same host as the site + path matching the
// page's real serving path = full credit; same-host but a different path
// (possibly deliberate consolidation) = partial credit; missing, malformed,
// or cross-host = fail.
// ---------------------------------------------------------------------------

export type CanonicalAssessment = "full" | "partial" | "fail";

export interface CanonicalContext {
  /** The entity's real serving path (page path, or /{type-slug}/{post-slug}). */
  expectedPath?: string | null;
  /** Hosts this site legitimately serves on (custom domain, generated hostname). */
  siteHosts?: Array<string | null | undefined>;
}

function normalizePathForCompare(p: string): string {
  const trimmed = p.trim();
  if (!trimmed) return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

function normalizeHost(h: string): string {
  return h.trim().toLowerCase().replace(/^www\./, "");
}

export function assessCanonical(
  canonical: string,
  context?: CanonicalContext
): CanonicalAssessment {
  const value = (canonical || "").trim();
  if (!value) return "fail";

  let host: string | null = null;
  let path: string;
  if (value.startsWith("/")) {
    path = value;
  } else {
    try {
      const url = new URL(value);
      host = url.hostname;
      path = url.pathname;
    } catch {
      return "fail";
    }
  }

  const siteHosts = (context?.siteHosts || [])
    .filter((h): h is string => Boolean(h))
    .map(normalizeHost);
  if (host && siteHosts.length > 0 && !siteHosts.includes(normalizeHost(host))) {
    return "fail";
  }

  const expectedPath = context?.expectedPath;
  if (!expectedPath) return "full"; // no path context available — presence (+host) check only

  return normalizePathForCompare(path) === normalizePathForCompare(expectedPath)
    ? "full"
    : "partial";
}

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------

export function calculateScores(
  seo: SeoData,
  wrapperHtml: string,
  allTitles: string[],
  allDescriptions: string[],
  canonicalContext?: CanonicalContext
): SectionScore[] {
  const title = seo.meta_title || "";
  const desc = seo.meta_description || "";
  const canonical = seo.canonical_url || "";
  const robots = seo.robots || "";
  const ogTitle = seo.og_title || "";
  const ogDesc = seo.og_description || "";
  const ogImage = seo.og_image || "";
  const ogType = seo.og_type || "";
  const schema = seo.schema_json || [];
  const maxPreview = seo.max_image_preview || "";

  const hasViewport = /meta.*viewport/i.test(wrapperHtml);
  const hasCharset = /charset.*utf-8/i.test(wrapperHtml);
  const hasLang = /lang\s*=\s*["']en/i.test(wrapperHtml);
  const hasDeferScripts = /defer|async/i.test(wrapperHtml);
  const hasPreload = /rel\s*=\s*["']preload/i.test(wrapperHtml);

  const titleIsUnique = title ? !allTitles.includes(title) : false;
  const descIsUnique = desc ? !allDescriptions.includes(desc) : false;

  // Full correctness = 8; same-host-but-different-path (possibly deliberate
  // consolidation) = partial credit 4; missing/malformed/cross-host = 0.
  const canonicalAssessment = assessCanonical(canonical, canonicalContext);
  const canonicalLabel =
    canonicalAssessment === "partial"
      ? "Canonical tag (points to a different page)"
      : canonicalAssessment === "fail" && canonical.trim().length > 0
        ? "Canonical tag (wrong domain or malformed)"
        : "Canonical tag";

  return [
    {
      key: "critical",
      label: "Page Title & Canonical",
      dotColor: "bg-red-500",
      max: 30,
      score: 0,
      items: [
        {
          id: 1,
          label: canonicalLabel,
          points: canonicalAssessment === "partial" ? 4 : 8,
          passed: canonicalAssessment !== "fail",
        },
        { id: 2, label: "Title with keyword + city", points: 7, passed: title.length >= 20 },
        { id: 3, label: "Unique title", points: 6, passed: titleIsUnique },
        { id: 4, label: "Title length (50–60 chars)", points: 5, passed: title.length >= 50 && title.length <= 60 },
        { id: 5, label: "Page indexable", points: 4, passed: robots.includes("index") || robots === "" },
      ],
    },
    {
      key: "high_impact",
      label: "Search Snippet & CTR",
      dotColor: "bg-orange-500",
      max: 25,
      score: 0,
      items: [
        { id: 6, label: "Description with CTA", points: 6, passed: desc.length > 0 },
        { id: 7, label: "Description with trust signal", points: 5, passed: desc.length > 40 },
        { id: 8, label: "Description length (140–160 chars)", points: 5, passed: desc.length >= 140 && desc.length <= 160 },
        { id: 9, label: "Unique description", points: 5, passed: descIsUnique },
        { id: 10, label: "Large image preview tag", points: 4, passed: maxPreview === "large" },
      ],
    },
    {
      key: "significant",
      label: "Structured Data",
      dotColor: "bg-yellow-500",
      max: 22,
      score: 0,
      items: [
        { id: 11, label: "LocalBusiness schema", points: 6, passed: schema.some((s: Record<string, unknown>) => s["@type"] === "LocalBusiness") },
        { id: 12, label: "FAQ schema", points: 5, passed: schema.some((s: Record<string, unknown>) => s["@type"] === "FAQPage") },
        { id: 13, label: "Organization schema", points: 4, passed: schema.some((s: Record<string, unknown>) => s["@type"] === "Organization") },
        { id: 14, label: "Service schema", points: 4, passed: schema.some((s: Record<string, unknown>) => s["@type"] === "Service") },
        { id: 15, label: "Breadcrumb schema", points: 3, passed: schema.some((s: Record<string, unknown>) => s["@type"] === "BreadcrumbList") },
      ],
    },
    {
      key: "moderate",
      label: "Social & Open Graph",
      dotColor: "bg-blue-500",
      max: 13,
      score: 0,
      items: [
        { id: 16, label: "OG image (1200px+ landscape)", points: 4, passed: ogImage.length > 0 },
        { id: 17, label: "Real photo, not logo", points: 4, passed: ogImage.length > 0 },
        { id: 18, label: "OG title set", points: 3, passed: ogTitle.length > 0 },
        { id: 19, label: "OG URL matches canonical", points: 2, passed: true },
      ],
    },
    {
      key: "low",
      label: "Page Speed Tags",
      dotColor: "bg-gray-400",
      max: 7,
      score: 0,
      items: [
        { id: 20, label: "Viewport tag", points: 3, passed: hasViewport },
        { id: 21, label: "Scripts deferred", points: 3, passed: hasDeferScripts },
        { id: 22, label: "Preload hints", points: 1, passed: hasPreload },
      ],
    },
    {
      key: "negligible",
      label: "Housekeeping",
      dotColor: "bg-gray-300",
      max: 3,
      score: 0,
      items: [
        { id: 23, label: "UTF-8 charset", points: 1, passed: hasCharset },
        { id: 24, label: "Language declaration", points: 1, passed: hasLang },
        { id: 25, label: "OG type set", points: 0.5, passed: ogType.length > 0 },
        { id: 26, label: "OG description set", points: 0.5, passed: ogDesc.length > 0 },
      ],
    },
  ].map((section) => ({
    ...section,
    score: section.items.reduce((sum, item) => sum + (item.passed ? item.points : 0), 0),
  }));
}

export function getScoreColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 75) return "text-lime-600";
  if (score >= 55) return "text-orange-500";
  if (score >= 35) return "text-red-500";
  return "text-red-700";
}

export function getScoreBarColor(score: number): string {
  if (score >= 90) return "bg-green-500";
  if (score >= 75) return "bg-lime-500";
  if (score >= 55) return "bg-orange-500";
  if (score >= 35) return "bg-red-500";
  return "bg-red-700";
}

export function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Strong";
  if (score >= 55) return "Needs Work";
  if (score >= 35) return "Poor";
  return "Needs Attention";
}

// Generatable sections (excludes "low" which is wrapper-detected)
export const GENERATABLE_SECTIONS: Array<"critical" | "high_impact" | "significant" | "moderate" | "negligible"> = [
  "critical", "high_impact", "significant", "moderate", "negligible",
];
