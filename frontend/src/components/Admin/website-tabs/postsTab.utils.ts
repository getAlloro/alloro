import type { SeoData } from "../../../api/websites";

/** Compute a quick SEO score from seo_data alone (no wrapper/uniqueness) */
export function quickPostSeoScore(seoData: SeoData | null): {
  pct: number;
  colorClass: string;
  barClass: string;
} {
  if (!seoData) return { pct: 0, colorClass: "text-gray-400", barClass: "bg-gray-300" };

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

  let score = 0;

  // Critical (30)
  if (canonical.length > 0) score += 8;
  if (title.length >= 20) score += 7;
  if (title.length > 0) score += 6; // uniqueness — give benefit of doubt
  if (title.length >= 50 && title.length <= 60) score += 5;
  if (robots.includes("index") || robots === "") score += 4;

  // High Impact (25)
  if (desc.length > 0) score += 6;
  if (desc.length > 40) score += 5;
  if (desc.length >= 140 && desc.length <= 160) score += 5;
  if (desc.length > 0) score += 5; // uniqueness — give benefit of doubt
  if (maxPreview === "large") score += 4;

  // Significant (22)
  if (Array.isArray(schema) && schema.some((s: Record<string, unknown>) => s["@type"] === "LocalBusiness")) score += 6;
  if (Array.isArray(schema) && schema.some((s: Record<string, unknown>) => s["@type"] === "FAQPage")) score += 5;
  if (Array.isArray(schema) && schema.some((s: Record<string, unknown>) => s["@type"] === "Organization")) score += 4;
  if (Array.isArray(schema) && schema.some((s: Record<string, unknown>) => s["@type"] === "Service")) score += 4;
  if (Array.isArray(schema) && schema.some((s: Record<string, unknown>) => s["@type"] === "BreadcrumbList")) score += 3;

  // Moderate (13)
  if (ogImage.length > 0) score += 8;
  if (ogTitle.length > 0) score += 3;
  score += 2;

  // Housekeeping (3)
  if (ogType.length > 0) score += 0.5;
  if (ogDesc.length > 0) score += 0.5;

  const pct = Math.round((score / 100) * 100);

  let colorClass: string;
  let barClass: string;
  if (pct >= 90) { colorClass = "text-green-600"; barClass = "bg-green-500"; }
  else if (pct >= 75) { colorClass = "text-lime-600"; barClass = "bg-lime-500"; }
  else if (pct >= 55) { colorClass = "text-orange-500"; barClass = "bg-orange-500"; }
  else if (pct >= 35) { colorClass = "text-red-500"; barClass = "bg-red-500"; }
  else { colorClass = "text-gray-400"; barClass = "bg-gray-300"; }

  return { pct, colorClass, barClass };
}
