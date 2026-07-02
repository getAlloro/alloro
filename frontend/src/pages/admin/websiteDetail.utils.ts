import type { WebsiteProjectWithPages, WebsitePage } from "../../api/websites";
import {
  assessCanonical,
  type CanonicalContext,
} from "../../components/PageEditor/seoPanel.utils";

export type OrganizationListItem = {
  id: number;
  name: string;
  website?: unknown | null;
};

export type OrganizationsResponse = {
  organizations?: OrganizationListItem[];
};

export type WebsiteProjectDomainFields = WebsiteProjectWithPages & {
  domain_verified_at?: string | null;
};

export const WEBSITE_DETAIL_TABS = [
  "pages",
  "layouts",
  "code-manager",
  "media",
  "form-submissions",
  "posts",
  "menus",
  "reviews",
  "redirects",
  "integrations",
  "backups",
  "advanced-tools",
  "costs",
] as const;

export type WebsiteDetailTab = (typeof WEBSITE_DETAIL_TABS)[number];

export const NON_POLLING_STATUSES = ["CREATED", "LIVE"];
export const POLL_INTERVAL = 3000;

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * SEO score matching SeoPanel's calculateScores exactly.
 * Uses sibling titles/descriptions for uniqueness checks.
 * Uses wrapper HTML for page-speed and housekeeping checks.
 */
export function computeSeoScore(
  seoData: WebsitePage["seo_data"],
  siblingTitles: string[],
  siblingDescriptions: string[],
  wrapperHtml: string,
  canonicalContext?: CanonicalContext
): {
  score: number;
  max: number;
  pct: number;
  colorClass: string;
  barClass: string;
} {
  if (!seoData) return { score: 0, max: 100, pct: 0, colorClass: "text-gray-400", barClass: "bg-gray-300" };

  const title = seoData.meta_title || "";
  const desc = seoData.meta_description || "";
  const canonical = seoData.canonical_url || "";
  const robots = seoData.robots || "";
  const ogTitle = seoData.og_title || "";
  const ogDesc = seoData.og_description || "";
  const ogImage = seoData.og_image || "";
  const ogType = seoData.og_type || "";
  const schema = seoData.schema_json || [];
  const maxPreview = seoData.max_image_preview || "";

  const titleIsUnique = title ? !siblingTitles.includes(title) : false;
  const descIsUnique = desc ? !siblingDescriptions.includes(desc) : false;

  const hasViewport = /meta.*viewport/i.test(wrapperHtml);
  const hasCharset = /charset.*utf-8/i.test(wrapperHtml);
  const hasLang = /lang\s*=\s*["']en/i.test(wrapperHtml);
  const hasDeferScripts = /defer|async/i.test(wrapperHtml);
  const hasPreload = /rel\s*=\s*["']preload/i.test(wrapperHtml);

  let score = 0;

  // Critical (30) — exact match with SeoPanel (full 8 / partial 4 / fail 0)
  const canonicalAssessment = assessCanonical(canonical, canonicalContext);
  if (canonicalAssessment === "full") score += 8;
  else if (canonicalAssessment === "partial") score += 4;
  if (title.length >= 20) score += 7;
  if (titleIsUnique) score += 6;
  if (title.length >= 50 && title.length <= 60) score += 5;
  if (robots.includes("index") || robots === "") score += 4;

  // High Impact (25)
  if (desc.length > 0) score += 6;
  if (desc.length > 40) score += 5;
  if (desc.length >= 140 && desc.length <= 160) score += 5;
  if (descIsUnique) score += 5;
  if (maxPreview === "large") score += 4;

  // Significant (22)
  if (schema.some((s) => s["@type"] === "LocalBusiness")) score += 6;
  if (schema.some((s) => s["@type"] === "FAQPage")) score += 5;
  if (schema.some((s) => s["@type"] === "Organization")) score += 4;
  if (schema.some((s) => s["@type"] === "Service")) score += 4;
  if (schema.some((s) => s["@type"] === "BreadcrumbList")) score += 3;

  // Moderate (13)
  if (ogImage.length > 0) score += 4;
  if (ogImage.length > 0) score += 4; // "Real photo, not logo" — same check as SeoPanel
  if (ogTitle.length > 0) score += 3;
  score += 2; // "OG URL matches canonical" — always true in SeoPanel

  // Page Speed Tags (7)
  if (hasViewport) score += 3;
  if (hasDeferScripts) score += 3;
  if (hasPreload) score += 1;

  // Housekeeping (3)
  if (hasCharset) score += 1;
  if (hasLang) score += 1;
  if (ogType.length > 0) score += 0.5;
  if (ogDesc.length > 0) score += 0.5;

  const max = 100;
  const pct = Math.round((score / max) * 100);

  let colorClass: string;
  let barClass: string;
  if (pct >= 90) { colorClass = "text-green-600"; barClass = "bg-green-500"; }
  else if (pct >= 75) { colorClass = "text-lime-600"; barClass = "bg-lime-500"; }
  else if (pct >= 55) { colorClass = "text-orange-500"; barClass = "bg-orange-500"; }
  else if (pct >= 35) { colorClass = "text-red-500"; barClass = "bg-red-500"; }
  else { colorClass = "text-gray-400"; barClass = "bg-gray-300"; }

  return { score, max, pct, colorClass, barClass };
}

/**
 * Group pages by path for the expandable list.
 * Returns { path: string, pages: WebsitePage[] }[] sorted by path,
 * with each group's pages sorted by version desc.
 */
export function groupPagesByPath(pages: WebsitePage[]) {
  const map = new Map<string, WebsitePage[]>();
  for (const page of pages) {
    const group = map.get(page.path) || [];
    group.push(page);
    map.set(page.path, group);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, pages]) => ({
      path,
      pages: pages.sort((a, b) => b.version - a.version),
    }));
}

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const getStatusStyles = (status: string): string => {
  switch (status) {
    case "LIVE":
      return "border-green-200 bg-green-100 text-green-700";
    case "IN_PROGRESS":
      return "border-purple-200 bg-purple-100 text-purple-700";
    case "CREATED":
      return "border-gray-200 bg-gray-100 text-gray-700";
    default:
      return "border-gray-200 bg-gray-100 text-gray-700";
  }
};

export const getGenStatusStyles = (genStatus: string): string => {
  switch (genStatus) {
    case "ready":
      return "border-green-200 bg-green-100 text-green-700";
    case "generating":
      return "border-amber-200 bg-amber-100 text-amber-700";
    case "queued":
      return "border-gray-200 bg-gray-100 text-gray-500";
    case "failed":
      return "border-red-200 bg-red-100 text-red-700";
    case "cancelled":
      return "border-gray-300 bg-gray-200 text-gray-600";
    default:
      return "border-gray-200 bg-gray-100 text-gray-500";
  }
};

export const formatStatus = (status: string): string =>
  status
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");

export const getPageStatusStyles = (status: string): string => {
  switch (status) {
    case "published":
      return "border-green-200 bg-green-100 text-green-700";
    case "draft":
      return "border-yellow-200 bg-yellow-100 text-yellow-700";
    case "inactive":
      return "border-gray-200 bg-gray-100 text-gray-500";
    default:
      return "border-gray-200 bg-gray-100 text-gray-700";
  }
};

export const isProcessingStatus = (status: string): boolean =>
  status === "IN_PROGRESS";
