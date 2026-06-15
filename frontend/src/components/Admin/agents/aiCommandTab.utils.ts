/**
 * Pure helpers + constants for AiCommandTab and its extracted sub-components.
 */

import type {
  AiCommandRecommendation,
  AiCommandBatchStats,
} from "../../../api/websites";

export function parseStats(raw: AiCommandBatchStats | string | null): AiCommandBatchStats {
  if (!raw) return { total: 0, pending: 0, approved: 0, rejected: 0, executed: 0, failed: 0 };
  if (typeof raw === "string") return JSON.parse(raw);
  return raw;
}

export function groupKey(rec: AiCommandRecommendation): string {
  if (rec.target_type === "layout") return "Layouts";
  if (rec.target_type === "post" || rec.target_type === "update_post_meta") return "Posts";
  if (rec.target_type === "create_redirect" || rec.target_type === "update_redirect" || rec.target_type === "delete_redirect") return "Redirects";
  if (rec.target_type === "create_page") return "New Pages";
  if (rec.target_type === "create_post") return "New Posts";
  if (rec.target_type === "create_menu" || rec.target_type === "update_menu") return "Menu Changes";
  if (rec.target_type === "update_page_path") return "Pages";
  return "Pages";
}

// Flag-specific labels override target_type labels
export const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  fix_broken_link: { label: "Broken Link", color: "bg-red-50 text-red-600" },
  fix_html: { label: "Fix HTML", color: "bg-amber-50 text-amber-700" },
  fix_seo: { label: "SEO Issue", color: "bg-blue-50 text-blue-600" },
  fix_architecture: { label: "Architecture", color: "bg-purple-50 text-purple-600" },
  fix_content: { label: "Content Issue", color: "bg-amber-50 text-amber-600" },
  fix_ui: { label: "UI Issue", color: "bg-amber-50 text-amber-700" },
  fix_visual: { label: "Visual Issue", color: "bg-rose-50 text-rose-600" },
  fix_orphan_page: { label: "Orphan Page", color: "bg-orange-50 text-orange-600" },
};

export const TOOL_LABELS: Record<string, { label: string; color: string }> = {
  page_section: { label: "Edit HTML", color: "bg-gray-100 text-gray-600" },
  layout: { label: "Edit Layout", color: "bg-gray-100 text-gray-600" },
  post: { label: "Edit Post", color: "bg-gray-100 text-gray-600" },
  create_page: { label: "Create Page", color: "bg-blue-50 text-blue-600" },
  create_post: { label: "Create Post", color: "bg-blue-50 text-blue-600" },
  create_menu: { label: "Create Menu", color: "bg-purple-50 text-purple-600" },
  update_menu: { label: "Update Menu", color: "bg-purple-50 text-purple-600" },
  create_redirect: { label: "Create Redirect", color: "bg-green-50 text-green-600" },
  update_redirect: { label: "Update Redirect", color: "bg-green-50 text-green-600" },
  delete_redirect: { label: "Delete Redirect", color: "bg-red-50 text-red-500" },
  update_post_meta: { label: "Update Post", color: "bg-gray-100 text-gray-600" },
  update_page_path: { label: "Update Page", color: "bg-gray-100 text-gray-600" },
};

export function getToolLabel(rec: AiCommandRecommendation): { label: string; color: string } | null {
  const meta = rec.target_meta as Record<string, unknown>;
  const flagType = meta?.flag_type as string | undefined;
  if (flagType && FLAG_LABELS[flagType]) return FLAG_LABELS[flagType];
  return TOOL_LABELS[rec.target_type] || null;
}

export function subGroupKey(rec: AiCommandRecommendation): string {
  // Group page sections by their page path, not individual section
  if (rec.target_type === "page_section") {
    const meta = rec.target_meta as Record<string, unknown>;
    const pagePath = meta?.page_path as string;
    if (pagePath) return pagePath === "/" ? "/ (Homepage)" : pagePath;
  }
  return rec.target_label;
}

export function getStatusSummary(recs: AiCommandRecommendation[]): string {
  const statuses = new Set(recs.map((r) => r.status));
  if (statuses.size === 1) return recs[0].status;
  return "mixed";
}
