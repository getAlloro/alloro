/**
 * AI Command Service
 *
 * Orchestrates batch analysis of website content (layouts, pages, posts)
 * against a user prompt/checklist. Produces structured recommendations
 * stored in the database for review and later execution.
 */

import { AiCommandBatchModel } from "../../../models/website-builder/AiCommandBatchModel";
import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { PostModel } from "../../../models/website-builder/PostModel";
import { PostTypeModel } from "../../../models/website-builder/PostTypeModel";
import { RedirectModel } from "../../../models/website-builder/RedirectModel";
import { PostBlockModel } from "../../../models/website-builder/PostBlockModel";
import { MenuTemplateModel } from "../../../models/website-builder/MenuTemplateModel";
import { ReviewBlockModel } from "../../../models/website-builder/ReviewBlockModel";
import { normalizeSections } from "../feature-utils/util.section-normalizer";
import {
  analyzeHtmlContent,
  editHtmlContent,
  analyzeForStructuralChanges,
  planPageSections,
  generateSectionHtml,
  generatePostContent,
} from "../../../utils/website-utils/aiCommandService";
import crypto from "crypto";
import * as redirectsService from "./service.redirects";
import * as menuManager from "./service.menu-manager";
import { analyzeBuiltinFlags } from "../../../utils/website-utils/builtinAnalyzer";
import { createDraft, publishPage } from "./service.page-editor";
import { analyzeUiIntegrity } from "../../../utils/website-utils/uiChecker";
import { analyzeBrokenLinks } from "../../../utils/website-utils/linkChecker";
import { screenshotPage } from "../../../utils/website-utils/screenshotService";
import { analyzeScreenshot } from "../../../utils/website-utils/aiCommandService";
import { runAgenticPipeline } from "../../../utils/website-utils/agenticHtmlPipeline";
import logger from "../../../lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiCommandTargets {
  pages?: string[] | "all";
  posts?: string[] | "all";
  layouts?: string[] | "all";
}

// ---------------------------------------------------------------------------
// Create batch
// ---------------------------------------------------------------------------

export type BatchType = "ai_editor" | "ui_checker" | "link_checker";

export async function createBatch(
  projectId: string,
  prompt: string,
  targets: AiCommandTargets,
  createdBy?: string,
  batchType: BatchType = "ai_editor"
): Promise<any> {
  const batch = await AiCommandBatchModel.insertReturning({
    project_id: projectId,
    prompt: prompt || "",
    targets: JSON.stringify({ ...targets, type: batchType }),
    status: "analyzing",
    created_by: createdBy || null,
  });

  logger.info(`[AiCommand] Created batch ${batch.id} for project ${projectId}`);
  return batch;
}

// ---------------------------------------------------------------------------
// Analyze batch (async orchestration)
// ---------------------------------------------------------------------------

export async function analyzeBatch(batchId: string): Promise<void> {
  const batch = await AiCommandBatchModel.findRawById(batchId);
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  const project = await ProjectModel.findRawById(batch.project_id);
  if (!project) throw new Error(`Project ${batch.project_id} not found`);

  const targets: AiCommandTargets =
    typeof batch.targets === "string"
      ? JSON.parse(batch.targets)
      : batch.targets;

  const batchType: BatchType = (targets as any).type || "ai_editor";

  // Branch on batch type — UI Checker and Link Checker have their own flows
  if (batchType === "ui_checker" || batchType === "link_checker") {
    return analyzeSpecializedBatch(batchId, batch, project, targets, batchType);
  }

  let sortOrder = 0;
  let totalRecommendations = 0;

  // Fetch available templates once for the entire batch
  const templates = await getProjectTemplates(project.template_id);
  const templateContext = buildTemplateContext(templates);
  const promptWithTemplates = batch.prompt + templateContext;

  try {
    // ---- Built-in flags (deterministic, no LLM) ----
    try {
      const existingPaths = await getExistingPaths(batch.project_id);
      const existingPostSlugsForFlags = await getExistingPostSlugs(batch.project_id);

      const builtinLayouts: Array<{ field: string; html: string; projectId: string }> = [];
      for (const field of ["wrapper", "header", "footer"] as const) {
        if (project[field] && typeof project[field] === "string") {
          builtinLayouts.push({ field, html: project[field], projectId: batch.project_id });
        }
      }

      const builtinPages: Array<{ id: string; path: string; sections: Array<{ name: string; content: string; index: number }> }> = [];
      if (targets.pages) {
        const pages = await resolvePages(batch.project_id, targets.pages);
        for (const page of pages) {
          const raw = typeof page.sections === "string" ? JSON.parse(page.sections) : page.sections;
          const sections = normalizeSections(raw);
          builtinPages.push({
            id: page.id,
            path: page.path,
            sections: sections.map((s: any, i: number) => ({
              name: s.name || s.label || `Section ${i + 1}`,
              content: typeof s === "string" ? s : s.content || s.html || "",
              index: i,
            })),
          });
        }
      }

      const builtinPosts: Array<{ id: string; title: string; content: string }> = [];
      if (targets.posts) {
        const posts = await resolvePosts(batch.project_id, targets.posts);
        for (const post of posts) {
          builtinPosts.push({ id: post.id, title: post.title, content: post.content || "" });
        }
      }

      const flags = analyzeBuiltinFlags({
        layouts: builtinLayouts,
        pages: builtinPages,
        posts: builtinPosts,
        existingPaths,
        existingPostSlugs: existingPostSlugsForFlags.map((p) => `${p.post_type_slug}/${p.slug}`),
      });

      for (const flag of flags) {
        await AiCommandRecommendationModel.insertRow({
          batch_id: batchId,
          target_type: flag.targetType,
          target_id: flag.targetId,
          target_label: flag.targetLabel,
          target_meta: JSON.stringify({ ...flag.targetMeta, flag_type: flag.flagType }),
          recommendation: flag.recommendation,
          instruction: flag.instruction,
          current_html: flag.currentHtml,
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      await refreshStats(batchId);
    } catch (err) {
      logger.error({ err: err }, "[AiCommand] Built-in analysis failed:");
    }

    // ---- Layouts ----
    if (targets.layouts) {
      const layoutFields =
        targets.layouts === "all"
          ? (["wrapper", "header", "footer"] as const)
          : (targets.layouts as string[]);

      for (const field of layoutFields) {
        const html = project[field];
        logger.info(
          `[AiCommand] Layout "${field}": ${html ? `${String(html).length} chars` : "empty/null"}`
        );
        if (!html || typeof html !== "string" || html.trim().length === 0)
          continue;

        try {
          const result = await analyzeHtmlContent({
            prompt: promptWithTemplates,
            targetLabel: `Layout > ${capitalize(field)}`,
            currentHtml: html,
            costContext: {
              projectId: batch.project_id,
              eventType: "ai-command",
              metadata: { batch_id: batchId, scope: "layout", field },
            },
          });

          for (const rec of result.recommendations) {
            await AiCommandRecommendationModel.insertRow({
              batch_id: batchId,
              target_type: "layout",
              target_id: batch.project_id,
              target_label: `Layout > ${capitalize(field)}`,
              target_meta: JSON.stringify({ layout_field: field }),
              recommendation: rec.recommendation,
              instruction: rec.instruction,
              current_html: html,
              sort_order: sortOrder++,
            });
            totalRecommendations++;
          }
        } catch (err) {
          logger.error({ err: err }, `[AiCommand] Failed to analyze layout ${field}:`);
        }

        await refreshStats(batchId);
      }
    }

    // ---- Pages ----
    if (targets.pages) {
      const pages = await resolvePages(batch.project_id, targets.pages);

      for (const page of pages) {
        const rawSections = typeof page.sections === "string"
          ? JSON.parse(page.sections)
          : page.sections;
        const sections = normalizeSections(rawSections);

        logger.info(
          `[AiCommand] Page ${page.path}: ${sections.length} sections found (raw type: ${typeof page.sections}, normalized: ${sections.length})`
        );

        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          const sectionName =
            section.name || section.label || `Section ${i + 1}`;
          const sectionHtml =
            typeof section === "string"
              ? section
              : section.content || section.html || "";

          logger.info(
            `[AiCommand]   Section ${i} "${sectionName}": ${sectionHtml.length} chars (keys: ${typeof section === "object" ? Object.keys(section).join(",") : "string"})`
          );

          if (!sectionHtml || sectionHtml.trim().length === 0) continue;

          // Skip shortcode-only sections — nothing to analyze
          if (sectionHtml.trim().length < 100 && /\{\{.*\}\}/.test(sectionHtml)) {
            logger.info(`[AiCommand]   Skipping shortcode-only section: ${sectionName}`);
            continue;
          }

          try {
            const result = await analyzeHtmlContent({
              prompt: promptWithTemplates,
              targetLabel: `${page.path} > ${sectionName}`,
              currentHtml: sectionHtml,
              costContext: {
                projectId: batch.project_id,
                eventType: "ai-command",
                metadata: {
                  batch_id: batchId,
                  scope: "page-section",
                  page_id: page.id,
                  page_path: page.path,
                  section_name: sectionName,
                  section_index: i,
                },
              },
            });

            for (const rec of result.recommendations) {
              await AiCommandRecommendationModel.insertRow({
                batch_id: batchId,
                target_type: "page_section",
                target_id: page.id,
                target_label: `${page.path} > ${sectionName}`,
                target_meta: JSON.stringify({
                  section_index: i,
                  section_name: sectionName,
                  page_path: page.path,
                }),
                recommendation: rec.recommendation,
                instruction: rec.instruction,
                current_html: sectionHtml,
                sort_order: sortOrder++,
              });
              totalRecommendations++;
            }
          } catch (err) {
            logger.error({ err: err }, `[AiCommand] Failed to analyze ${page.path} section ${i}:`);
          }

          await refreshStats(batchId);
        }
      }
    }

    // ---- Posts ----
    if (targets.posts) {
      const posts = await resolvePosts(batch.project_id, targets.posts);

      for (const post of posts) {
        if (!post.content || post.content.trim().length === 0) continue;

        try {
          const result = await analyzeHtmlContent({
            prompt: promptWithTemplates,
            targetLabel: `Post: ${post.title}`,
            currentHtml: post.content,
            costContext: {
              projectId: batch.project_id,
              eventType: "ai-command",
              metadata: { batch_id: batchId, scope: "post", post_id: post.id },
            },
          });

          for (const rec of result.recommendations) {
            await AiCommandRecommendationModel.insertRow({
              batch_id: batchId,
              target_type: "post",
              target_id: post.id,
              target_label: `Post: ${post.title}`,
              target_meta: JSON.stringify({
                post_type_slug: post.post_type_slug || null,
              }),
              recommendation: rec.recommendation,
              instruction: rec.instruction,
              current_html: post.content,
              sort_order: sortOrder++,
            });
            totalRecommendations++;
          }
        } catch (err) {
          logger.error({ err: err }, `[AiCommand] Failed to analyze post ${post.id}:`);
        }

        await refreshStats(batchId);
      }
    }

    // ---- Structural analysis (redirects, new pages, new posts) ----
    try {
      const existingPaths = await getExistingPaths(batch.project_id);
      const existingRedirects = await redirectsService.getExistingRedirects(batch.project_id);
      const existingPostSlugs = await getExistingPostSlugs(batch.project_id);
      const postTypes = await getProjectPostTypes(batch.project_id, project.template_id);
      const existingMenus = await getExistingMenuItems(batch.project_id);

      const structural = await analyzeForStructuralChanges({
        prompt: promptWithTemplates,
        existingPaths,
        existingRedirects: existingRedirects.map((r) => `${r.from_path} → ${r.to_path}`),
        existingPostSlugs: existingPostSlugs.map((p) => `${p.post_type_slug}/${p.slug}`),
        postTypes: postTypes.map((pt: any) => `${pt.slug} (${pt.name})`),
        existingMenus,
        costContext: {
          projectId: batch.project_id,
          eventType: "ai-command",
          metadata: { batch_id: batchId, scope: "structural" },
        },
      });

      // Deduplicate redirects — skip if from_path already exists in DB or in this batch
      const existingFromPaths = new Set(existingRedirects.map((r) => r.from_path));
      const batchFromPaths = new Set<string>();

      for (const rec of structural.redirects) {
        if (existingFromPaths.has(rec.from_path) || batchFromPaths.has(rec.from_path)) {
          logger.info(`[AiCommand] Skipping duplicate redirect: ${rec.from_path}`);
          continue;
        }
        batchFromPaths.add(rec.from_path);

        await AiCommandRecommendationModel.insertRow({
          batch_id: batchId,
          target_type: "create_redirect",
          target_id: batch.project_id,
          target_label: `Redirect: ${rec.from_path} → ${rec.to_path}`,
          target_meta: JSON.stringify({ from_path: rec.from_path, to_path: rec.to_path, type: rec.type || 301 }),
          recommendation: rec.recommendation,
          instruction: `Create ${rec.type || 301} redirect from ${rec.from_path} to ${rec.to_path}`,
          current_html: "",
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      // Delete redirect recommendations
      for (const rec of structural.deleteRedirects) {
        await AiCommandRecommendationModel.insertRow({
          batch_id: batchId,
          target_type: "delete_redirect",
          target_id: batch.project_id,
          target_label: `Delete redirect: ${rec.from_path}`,
          target_meta: JSON.stringify({ from_path: rec.from_path }),
          recommendation: rec.recommendation,
          instruction: `Delete redirect from ${rec.from_path}`,
          current_html: "",
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      for (const rec of structural.pages) {
        await AiCommandRecommendationModel.insertRow({
          batch_id: batchId,
          target_type: "create_page",
          target_id: batch.project_id,
          target_label: `Create page: ${rec.path}`,
          target_meta: JSON.stringify({ path: rec.path, page_purpose: rec.purpose }),
          recommendation: rec.recommendation,
          instruction: `Create a new page at ${rec.path}: ${rec.purpose}`,
          current_html: "",
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      for (const rec of structural.posts) {
        await AiCommandRecommendationModel.insertRow({
          batch_id: batchId,
          target_type: "create_post",
          target_id: batch.project_id,
          target_label: `Create post: ${rec.title}`,
          target_meta: JSON.stringify({ post_type_slug: rec.post_type_slug, title: rec.title, slug: rec.slug, purpose: rec.purpose }),
          recommendation: rec.recommendation,
          instruction: `Create a new ${rec.post_type_slug} post: ${rec.title}`,
          current_html: "",
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      for (const rec of structural.newMenus) {
        await AiCommandRecommendationModel.insertRow({
          batch_id: batchId,
          target_type: "create_menu",
          target_id: batch.project_id,
          target_label: `Create menu: ${rec.name}`,
          target_meta: JSON.stringify({ name: rec.name, slug: rec.slug }),
          recommendation: rec.recommendation,
          instruction: `Create a new menu named "${rec.name}" with slug "${rec.slug}"`,
          current_html: "",
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      for (const rec of structural.menuChanges) {
        await AiCommandRecommendationModel.insertRow({
          batch_id: batchId,
          target_type: "update_menu",
          target_id: batch.project_id,
          target_label: `Menu: ${rec.action} "${rec.label}" in ${rec.menu_slug}`,
          target_meta: JSON.stringify(rec),
          recommendation: rec.recommendation,
          instruction: `${rec.action} menu item "${rec.label}" ${rec.action === "add" ? `with URL ${rec.url} in menu "${rec.menu_slug}"` : `from menu "${rec.menu_slug}"`}`,
          current_html: "",
          sort_order: sortOrder++,
        });
        totalRecommendations++;
      }

      await refreshStats(batchId);
    } catch (err) {
      logger.error({ err: err }, "[AiCommand] Failed structural analysis:");
    }

    // Finalize
    await AiCommandBatchModel.updateById(batchId, {
      status: "ready",
      summary: (() => {
        const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        // Extract a short title from the prompt (first line, max 60 chars)
        const promptTitle = batch.prompt
          ? batch.prompt.split("\n")[0].replace(/^#\s*/, "").replace(/\*\*/g, "").substring(0, 60)
          : "AI Editor";
        return totalRecommendations > 0
          ? `${promptTitle} — ${dateStr} — ${totalRecommendations} recommendation(s)`
          : `${promptTitle} — ${dateStr} — No changes needed`;
      })(),
    });

    await refreshStats(batchId);

    logger.info(
      `[AiCommand] ✓ Batch ${batchId} complete: ${totalRecommendations} recommendations`
    );
  } catch (err) {
    logger.error({ err: err }, `[AiCommand] Batch ${batchId} failed:`);
    await AiCommandBatchModel.updateById(batchId, {
      status: "failed",
      summary: `Analysis failed: ${(err as Error).message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Execution context — shared state across recommendations in a batch run
// ---------------------------------------------------------------------------

interface ExecutionContext {
  createdPages: Map<string, { path: string; id: string }>;   // purpose → { path, id }
  createdPosts: Map<string, { id: string; slug: string; post_type_slug: string }>;  // slug → { id, slug, type }
  createdMenus: Map<string, string>;                          // slug → id
  createdRedirects: Map<string, string>;                      // from_path → to_path
  /** Tracks draft page IDs created during batch execution (path → draft page ID) */
  pageDrafts: Map<string, string>;
  /** Project + batch ids — used to attribute LLM costs back to the project. */
  projectId?: string;
  batchId?: string;
}

function createExecutionContext(opts?: { projectId?: string; batchId?: string }): ExecutionContext {
  return {
    createdPages: new Map(),
    createdPosts: new Map(),
    createdMenus: new Map(),
    createdRedirects: new Map(),
    pageDrafts: new Map(),
    projectId: opts?.projectId,
    batchId: opts?.batchId,
  };
}

// Execution phases — deterministic ordering so dependencies resolve correctly
const EXECUTION_PHASE_ORDER: Record<string, number> = {
  create_post: 1,        // Posts first (services, doctors, etc.)
  create_page: 2,        // Pages second (may reference posts)
  create_menu: 3,        // Menus third (need to know what pages/posts exist)
  update_menu: 4,        // Menu item changes
  create_redirect: 5,    // Redirects fourth (targets should exist)
  update_redirect: 6,    // Redirect updates
  delete_redirect: 7,    // Redirect deletes
  update_post_meta: 8,   // Post metadata updates
  update_page_path: 9,   // Page path updates
  page_section: 10,      // HTML edits last
  layout: 10,
  post: 10,
};

// ---------------------------------------------------------------------------
// Specialized batch analysis (UI Checker / Link Checker)
// ---------------------------------------------------------------------------

async function analyzeSpecializedBatch(
  batchId: string,
  batch: any,
  project: any,
  targets: AiCommandTargets,
  batchType: BatchType
): Promise<void> {
  let totalRecommendations = 0;

  try {
    // Resolve targets to actual content
    const resolvedLayouts: Array<{ field: string; html: string; projectId: string }> = [];
    if (targets.layouts) {
      const fields = targets.layouts === "all"
        ? ["wrapper", "header", "footer"]
        : (targets.layouts as string[]);
      for (const field of fields) {
        if (project[field] && typeof project[field] === "string") {
          resolvedLayouts.push({ field, html: project[field], projectId: batch.project_id });
        }
      }
    }

    const resolvedPages: Array<{ id: string; path: string; sections: Array<{ name: string; content: string; index: number }> }> = [];
    if (targets.pages) {
      const pages = await resolvePages(batch.project_id, targets.pages);
      for (const page of pages) {
        const raw = typeof page.sections === "string" ? JSON.parse(page.sections) : page.sections;
        const sections = normalizeSections(raw);
        resolvedPages.push({
          id: page.id,
          path: page.path,
          sections: sections.map((s: any, i: number) => ({
            name: s.name || s.label || `Section ${i + 1}`,
            content: typeof s === "string" ? s : s.content || s.html || "",
            index: i,
          })),
        });
      }
    }

    const resolvedPosts: Array<{ id: string; title: string; content: string }> = [];
    if (targets.posts) {
      const posts = await resolvePosts(batch.project_id, targets.posts);
      for (const post of posts) {
        resolvedPosts.push({ id: post.id, title: post.title, content: post.content || "" });
      }
    }

    const existingPaths = await getExistingPaths(batch.project_id);
    const existingPostSlugs = await getExistingPostSlugs(batch.project_id);

    let recommendations: Array<{
      flagType: string; targetType: string; targetId: string; targetLabel: string;
      targetMeta: Record<string, unknown>; recommendation: string; instruction: string; currentHtml: string;
    }> = [];

    if (batchType === "ui_checker") {
      // Phase 1: HTML structure checks (fast, deterministic)
      recommendations = analyzeUiIntegrity({
        layouts: resolvedLayouts,
        pages: resolvedPages,
        posts: resolvedPosts,
        brandColors: {
          primary: project.primary_color,
          accent: project.accent_color,
        },
      });

      // Phase 2: Playwright visual analysis (screenshot + vision LLM)
      try {
        const hostname = project.custom_domain || `${project.generated_hostname}.sites.getalloro.com`;
        const baseUrl = project.custom_domain
          ? `https://${project.custom_domain}`
          : `https://${project.generated_hostname}.sites.getalloro.com`;

        for (const page of resolvedPages) {
          try {
            const pageUrl = `${baseUrl}${page.path}`;
            const screenshots = await screenshotPage(pageUrl);

            for (const ss of screenshots) {
              // Concatenate all section HTML for this page as context
              const pageHtml = page.sections.map((s) => s.content).join("\n\n");

              const issues = await analyzeScreenshot({
                screenshot: ss.buffer,
                viewport: ss.viewport.label,
                pagePath: page.path,
                sectionHtml: pageHtml,
                costContext: {
                  projectId: batch.project_id,
                  eventType: "ai-command",
                  metadata: {
                    batch_id: batchId,
                    scope: "screenshot-visual",
                    page_id: page.id,
                    page_path: page.path,
                    viewport: ss.viewport.label,
                  },
                },
              });

              for (const issue of issues) {
                // Try to match the issue to a specific section
                const matchedSection = page.sections.find(
                  (s) => issue.section?.toLowerCase().includes(s.name.toLowerCase().replace("section-", ""))
                );

                recommendations.push({
                  flagType: "fix_visual",
                  targetType: "page_section",
                  targetId: page.id,
                  targetLabel: `${page.path} > ${matchedSection?.name || issue.section || "page"}`,
                  targetMeta: {
                    section_index: matchedSection?.index ?? 0,
                    section_name: matchedSection?.name || issue.section,
                    page_path: page.path,
                    viewport: ss.viewport.label,
                    severity: issue.severity,
                  },
                  recommendation: `[${ss.viewport.label}] ${issue.description}`,
                  instruction: issue.suggested_fix,
                  currentHtml: matchedSection?.content || "",
                });
              }
            }
          } catch (err) {
            logger.error({ err: (err as Error).message }, `[AiCommand] Visual analysis failed for ${page.path}:`);
          }

          await refreshStats(batchId);
        }
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "[AiCommand] Playwright visual analysis unavailable:");
        // HTML-only checks already ran — continue without visual
      }
    } else if (batchType === "link_checker") {
      // Collect menu items for orphan page detection
      const menuData = await getExistingMenuItems(batch.project_id);
      const allMenuItems: Array<{ label: string; url: string; menu_slug: string }> = [];
      for (const menu of menuData) {
        for (const item of menu.items) {
          allMenuItems.push({ ...item, menu_slug: menu.menu_slug });
        }
      }

      recommendations = analyzeBrokenLinks({
        layouts: resolvedLayouts,
        pages: resolvedPages,
        posts: resolvedPosts,
        existingPaths,
        existingPostSlugs: existingPostSlugs.map((p) => `${p.post_type_slug}/${p.slug}`),
        existingRedirects: await redirectsService.getExistingRedirects(batch.project_id),
        menuItems: allMenuItems,
      });
    }

    // Insert recommendations
    let sortOrder = 0;
    for (const rec of recommendations) {
      await AiCommandRecommendationModel.insertRow({
        batch_id: batchId,
        target_type: rec.targetType,
        target_id: rec.targetId,
        target_label: rec.targetLabel,
        target_meta: JSON.stringify({ ...rec.targetMeta, flag_type: rec.flagType }),
        recommendation: rec.recommendation,
        instruction: rec.instruction,
        current_html: rec.currentHtml,
        sort_order: sortOrder++,
      });
      totalRecommendations++;
    }

    const typeLabel = batchType === "ui_checker" ? "UI Check" : "Link Check";
    const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    await AiCommandBatchModel.updateById(batchId, {
      status: "ready",
      summary: totalRecommendations > 0
        ? `${typeLabel} — ${dateStr} — ${totalRecommendations} issue(s) found`
        : `${typeLabel} — ${dateStr} — No issues found`,
    });
    await refreshStats(batchId);

    logger.info(`[AiCommand] ✓ ${batchType} batch ${batchId}: ${totalRecommendations} issues`);
  } catch (err) {
    logger.error({ err: err }, `[AiCommand] ${batchType} batch ${batchId} failed:`);
    await AiCommandBatchModel.updateById(batchId, {
      status: "failed",
      summary: `Analysis failed: ${(err as Error).message}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Execute batch (Phase C)
// ---------------------------------------------------------------------------

export async function executeBatch(batchId: string): Promise<void> {
  const batch = await AiCommandBatchModel.findRawById(batchId);
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  if (batch.status !== "ready") {
    throw new Error(`Batch ${batchId} status is "${batch.status}", expected "ready"`);
  }

  await AiCommandBatchModel.updateStatus(batchId, "executing");

  const approved = await AiCommandRecommendationModel.findApprovedByBatchId(batchId);

  // Sort by execution phase — posts first, then pages, menus, redirects, edits last
  const sorted = [...approved].sort((a, b) => {
    const phaseA = EXECUTION_PHASE_ORDER[a.target_type] ?? 99;
    const phaseB = EXECUTION_PHASE_ORDER[b.target_type] ?? 99;
    if (phaseA !== phaseB) return phaseA - phaseB;
    return a.sort_order - b.sort_order;
  });

  logger.info(
    `[AiCommand] Executing batch ${batchId}: ${sorted.length} approved recommendations (phase-ordered)`
  );

  const ctx = createExecutionContext({ projectId: batch.project_id, batchId });
  let executedCount = 0;
  let failedCount = 0;

  for (const rec of sorted) {
    try {
      await executeRecommendation(rec, ctx);
      executedCount++;
    } catch (err) {
      logger.error({ err: (err as Error).message }, `[AiCommand] Recommendation ${rec.id} failed:`);
      await AiCommandRecommendationModel.updateById(rec.id, {
        status: "failed",
        execution_result: JSON.stringify({
          success: false,
          error: (err as Error).message,
        }),
      });
      failedCount++;
    }

    await refreshStats(batchId);
  }

  // Publish all page drafts that were created during this batch (one version per page)
  for (const [path, draftId] of ctx.pageDrafts) {
    const draftPage = await PageModel.findRawById(draftId);
    if (!draftPage || draftPage.status !== "draft") continue;
    const publishResult = await publishPage(draftPage.project_id, draftId);
    if (publishResult.error) {
      logger.warn(`[AiCommand] Auto-publish failed for page ${path} (${draftId}): ${publishResult.error.message}`);
    } else {
      logger.info(`[AiCommand] ✓ Auto-published page ${path} (${draftId})`);
    }
  }

  const executionSummary = await buildExecutionSummary(batchId);

  await AiCommandBatchModel.updateById(batchId, {
    status: "completed",
    summary: executionSummary,
  });

  await refreshStats(batchId);

  logger.info(
    `[AiCommand] ✓ Batch ${batchId} execution complete: ${executedCount} executed, ${failedCount} failed`
  );
}

async function executeRecommendation(rec: any, ctx: ExecutionContext): Promise<void> {
  // Structural recommendations
  if (rec.target_type === "create_redirect") return executeCreateRedirect(rec);
  if (rec.target_type === "update_redirect") return executeUpdateRedirect(rec);
  if (rec.target_type === "delete_redirect") return executeDeleteRedirect(rec);
  if (rec.target_type === "create_page") return executeCreatePage(rec, ctx);
  if (rec.target_type === "create_post") return executeCreatePost(rec, ctx);
  if (rec.target_type === "create_menu") return executeCreateMenu(rec, ctx);
  if (rec.target_type === "update_menu") return executeUpdateMenu(rec, ctx);
  if (rec.target_type === "update_post_meta") return executeUpdatePostMeta(rec);
  if (rec.target_type === "update_page_path") return executeUpdatePagePath(rec);

  // Always use the latest HTML from DB — previous recommendations in this
  // batch may have already modified the same target
  const currentHtml = await getCurrentHtml(rec);

  if (!currentHtml) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({
        success: false,
        error: "Target content no longer exists.",
      }),
    });
    return;
  }

  // Build final instruction with user-provided context
  const recMeta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;
  let finalInstruction = rec.instruction;

  // Append user-provided additional notes/context
  if (recMeta?.reference_content && !recMeta?.flag_type) {
    finalInstruction += `\n\nAdditional context from user:\n${recMeta.reference_content}`;
  }

  // For broken link fixes, use the user-provided replacement URL
  if (recMeta?.flag_type === "fix_broken_link" && recMeta?.broken_href && recMeta?.reference_url) {
    finalInstruction = `Change href="${recMeta.broken_href}" to href="${recMeta.reference_url}". Update all occurrences of this broken link.`;
  } else if (recMeta?.flag_type === "fix_broken_link" && recMeta?.broken_href && recMeta?.suggested_href && recMeta.suggested_href !== "NEEDS_INPUT") {
    finalInstruction = `Change href="${recMeta.broken_href}" to href="${recMeta.suggested_href}". Update all occurrences of this broken link.`;
  }

  // LLM edit — always use current HTML, not the snapshot from analysis
  const result = await editHtmlContent({
    instruction: finalInstruction,
    currentHtml,
    targetLabel: rec.target_label,
    costContext: ctx.projectId
      ? {
          projectId: ctx.projectId,
          eventType: "ai-command",
          metadata: {
            batch_id: ctx.batchId || null,
            recommendation_id: rec.id,
            target_type: rec.target_type,
          },
        }
      : undefined,
  });

  // Run agentic validation pipeline — auto-fix UI and link issues
  const existingPaths = await getExistingPaths(rec.target_id.length === 36 ? rec.target_id : "");
  const existingPostSlugsRaw = rec.target_id.length === 36 ? await getExistingPostSlugs(rec.target_id) : [];
  const pipelineResult = await runAgenticPipeline(
    result.editedHtml,
    rec.target_label,
    {
      existingPaths,
      existingPostSlugs: existingPostSlugsRaw.map((p: any) => `${p.post_type_slug}/${p.slug}`),
      recId: rec.id,
    }
  );

  // Save the validated HTML
  await saveEditedHtml(rec, pipelineResult.html, ctx);

  // Mark as executed
  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({
      success: true,
      iterations: pipelineResult.iterations,
      ui_fixes: pipelineResult.uiFixAttempts,
      link_fixes: pipelineResult.linkFixAttempts,
      remaining_issues: pipelineResult.finalIssues.length,
      edited_html: result.editedHtml,
      tokens: {
        input: result.inputTokens,
        output: result.outputTokens,
      },
    }),
  });

  logger.info(`[AiCommand] ✓ Executed: ${rec.target_label}`);
}

async function getCurrentHtml(rec: any): Promise<string> {
  const meta =
    typeof rec.target_meta === "string"
      ? JSON.parse(rec.target_meta)
      : rec.target_meta;

  if (rec.target_type === "layout") {
    const project = await ProjectModel.findRawById(rec.target_id);
    if (!project) throw new Error(`Project ${rec.target_id} not found`);
    return project[meta.layout_field] || "";
  }

  if (rec.target_type === "page_section") {
    // Get the original page to find its path, then prefer draft at that path
    const origPage = await PageModel.findRawById(rec.target_id);
    if (!origPage) throw new Error(`Page ${rec.target_id} not found`);

    // If a draft exists for this path, use it (it may have been auto-created)
    const page = await PageModel.findRawByProjectPathStatus(
      origPage.project_id,
      origPage.path,
      "draft"
    ) || origPage;

    const rawSections = typeof page.sections === "string"
      ? JSON.parse(page.sections)
      : page.sections;
    const sections = normalizeSections(rawSections);
    const section = sections[meta.section_index];
    if (!section) throw new Error(`Section ${meta.section_index} not found`);

    return typeof section === "string"
      ? section
      : section.content || section.html || "";
  }

  if (rec.target_type === "post") {
    const post = await PostModel.findRawById(rec.target_id);
    if (!post) throw new Error(`Post ${rec.target_id} not found`);
    return post.content || "";
  }

  throw new Error(`Unknown target type: ${rec.target_type}`);
}

async function saveEditedHtml(rec: any, editedHtml: string, ctx: ExecutionContext): Promise<void> {
  const meta =
    typeof rec.target_meta === "string"
      ? JSON.parse(rec.target_meta)
      : rec.target_meta;

  if (rec.target_type === "layout") {
    await ProjectModel.updateLayoutField(
      rec.target_id,
      meta.layout_field,
      editedHtml
    );
    return;
  }

  if (rec.target_type === "page_section") {
    // Find the original page to get its path
    const origPage = await PageModel.findRawById(rec.target_id);
    if (!origPage) throw new Error(`Page ${rec.target_id} not found`);

    let draftId = ctx.pageDrafts.get(origPage.path);
    let page: any;

    if (draftId) {
      // Reuse the draft already created for this page path during this batch
      page = await PageModel.findRawById(draftId);
      if (!page) throw new Error(`Draft ${draftId} disappeared for path ${origPage.path}`);
    } else {
      // Find the current active version at this path (draft preferred, then published)
      page = await PageModel.findRawByProjectPathStatus(
        origPage.project_id,
        origPage.path,
        "draft"
      )
        || await PageModel.findRawByProjectPathStatus(
          origPage.project_id,
          origPage.path,
          "published"
        );

      if (!page) throw new Error(`No active page at path ${origPage.path}`);

      // Auto-create draft from published page for version control (once per page per batch)
      if (page.status === "published") {
        logger.info(`[AiCommand] Auto-creating draft from published page ${page.id} (${page.path})`);
        const draftResult = await createDraft(page.project_id, page.id);
        if (draftResult.error) {
          throw new Error(`Failed to create draft: ${draftResult.error.message}`);
        }
        page = draftResult.page;
      }

      // Track this draft so subsequent recommendations for the same page reuse it
      ctx.pageDrafts.set(origPage.path, page.id);
    }

    const rawSections = typeof page.sections === "string"
      ? JSON.parse(page.sections)
      : page.sections;
    const sections = normalizeSections(rawSections);
    const section = sections[meta.section_index];

    if (typeof section === "string") {
      sections[meta.section_index] = editedHtml;
    } else {
      sections[meta.section_index] = {
        ...section,
        content: editedHtml,
      };
    }

    await PageModel.updateSectionsById(page.id, JSON.stringify(sections));

    // Don't publish here — batch will publish all drafts at the end
    return;
  }

  if (rec.target_type === "post") {
    await PostModel.updateContentById(rec.target_id, editedHtml);
    return;
  }

  throw new Error(`Unknown target type: ${rec.target_type}`);
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getBatch(batchId: string): Promise<any> {
  return AiCommandBatchModel.findRawById(batchId);
}

export async function listBatches(projectId: string): Promise<any[]> {
  return AiCommandBatchModel.listByProjectId(projectId);
}

export async function deleteBatch(batchId: string): Promise<void> {
  await AiCommandBatchModel.deleteById(batchId);
}

export async function updateBatchSummary(batchId: string, summary: string): Promise<any> {
  return AiCommandBatchModel.updateSummaryReturning(batchId, summary);
}

export async function getBatchRecommendations(
  batchId: string,
  filters?: { status?: string; target_type?: string }
): Promise<any[]> {
  return AiCommandRecommendationModel.findByBatchId(batchId, filters);
}

// ---------------------------------------------------------------------------
// Update operations
// ---------------------------------------------------------------------------

export async function updateRecommendationStatus(
  recommendationId: string,
  status: "approved" | "rejected",
  metaUpdates?: { reference_url?: string; reference_content?: string }
): Promise<any> {
  const updatePayload: Record<string, unknown> = { status };

  // Merge reference data into target_meta for create_page/create_post
  if (metaUpdates && (metaUpdates.reference_url || metaUpdates.reference_content)) {
    const existing = await AiCommandRecommendationModel.findRawById(recommendationId);
    if (existing) {
      const meta = typeof existing.target_meta === "string"
        ? JSON.parse(existing.target_meta)
        : existing.target_meta || {};
      if (metaUpdates.reference_url) meta.reference_url = metaUpdates.reference_url;
      if (metaUpdates.reference_content) meta.reference_content = metaUpdates.reference_content;
      updatePayload.target_meta = JSON.stringify(meta);
    }
  }

  const rec = await AiCommandRecommendationModel.updateByIdReturning(
    recommendationId,
    updatePayload
  );

  if (rec) {
    await refreshStats(rec.batch_id);
  }

  return rec;
}

export async function bulkUpdateStatus(
  batchId: string,
  status: "approved" | "rejected",
  filters?: { target_type?: string }
): Promise<number> {
  const updated = await AiCommandRecommendationModel.bulkUpdatePendingStatus(
    batchId,
    status,
    filters
  );
  await refreshStats(batchId);
  return updated;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function refreshStats(batchId: string): Promise<void> {
  const stats = await AiCommandRecommendationModel.computeStats(batchId);
  await AiCommandBatchModel.updateStats(batchId, JSON.stringify(stats));
}

async function resolvePages(
  projectId: string,
  target: string[] | "all"
): Promise<any[]> {
  if (target === "all") {
    // For each path, prefer the draft version; fall back to published
    const allPages = await PageModel.findResolvableByProjectId(projectId);

    // Deduplicate by path — keep first (draft preferred)
    const seen = new Set<string>();
    return allPages.filter((p: any) => {
      if (seen.has(p.path)) return false;
      seen.add(p.path);
      return true;
    });
  }

  // Specific page IDs
  return PageModel.findByIds(target);
}

async function resolvePosts(
  projectId: string,
  target: string[] | "all"
): Promise<any[]> {
  if (target === "all") {
    return PostModel.findPublishedByProjectId(projectId);
  }

  return PostModel.findByIds(target);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Structural execution handlers
// ---------------------------------------------------------------------------

async function executeCreateRedirect(rec: any): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  const result = await redirectsService.createRedirect(rec.target_id, {
    from_path: meta.from_path,
    to_path: meta.to_path,
    type: meta.type || 301,
  });

  if (result.error) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: result.error.message }),
    });
    return;
  }

  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({ success: true, redirect_id: result.redirect.id }),
  });

  logger.info(`[AiCommand] ✓ Created redirect: ${meta.from_path} → ${meta.to_path}`);
}

async function executeCreatePage(rec: any, ctx: ExecutionContext): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;
  const projectId = rec.target_id;

  // Check if page already exists
  const existing = await PageModel.findActiveByProjectAndPath(projectId, meta.path);

  if (existing) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Page already exists at ${meta.path}` }),
    });
    return;
  }

  // Fetch project
  const project = await ProjectModel.findRawById(projectId);

  // Fetch existing pages for style context (up to 5)
  const existingPages = await PageModel.findPublishedByProjectIdLimit(projectId, 5);

  const existingSections: Array<{ name: string; summary: string }> = [];
  let siteStyleContext = [
    `## Brand Colors`,
    `- bg-primary / text-primary — resolves to ${project.primary_color || "#232323"}`,
    `- bg-accent / text-accent — resolves to ${project.accent_color || "#23AFBE"}`,
    `- NEVER use these hex values directly. Always use the CSS classes.`,
    `- For light backgrounds: bg-gray-50, bg-gray-100. For dark: bg-primary, bg-gray-900.`,
    ``,
    `## Site Layout (wrapper/header/footer — match this style)`,
    project.header ? `### Header\n${String(project.header).substring(0, 3000)}` : "",
    project.footer ? `### Footer\n${String(project.footer).substring(0, 3000)}` : "",
    ``,
    `## Existing Page Sections (match these patterns)`,
  ].filter(Boolean).join("\n");

  for (const page of existingPages) {
    const raw = typeof page.sections === "string" ? JSON.parse(page.sections) : page.sections;
    const sections = normalizeSections(raw);
    for (const s of sections) {
      const name = s.name || s.label || "unnamed";
      const content = typeof s === "string" ? s : s.content || s.html || "";
      existingSections.push({ name, summary: content.substring(0, 200) });
      if (siteStyleContext.length < 20000) {
        siteStyleContext += `\n--- ${page.path} > ${name} ---\n${content.substring(0, 3000)}\n`;
      }
    }
  }

  // Resolve reference content — scrape URL or use provided text
  let referenceContent = "";
  if (meta.reference_content) {
    referenceContent = meta.reference_content;
  } else if (meta.reference_url) {
    try {
      logger.info(`[AiCommand] Scraping reference URL: ${meta.reference_url}`);
      const scrapeResponse = await fetch(meta.reference_url, {
        headers: { "User-Agent": "AlloroBot/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (scrapeResponse.ok) {
        const html = await scrapeResponse.text();
        // Strip scripts/styles, keep text content
        referenceContent = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 8000);
        logger.info(`[AiCommand] ✓ Scraped ${referenceContent.length} chars from reference URL`);
      }
    } catch (err) {
      logger.warn(`[AiCommand] Failed to scrape reference URL: ${(err as Error).message}`);
    }
  }

  if (!referenceContent && !meta.reference_url) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({
        success: false,
        error: "Reference URL or content is required for page creation. Provide it when approving this recommendation.",
      }),
    });
    return;
  }

  const pageContext = [
    meta.page_purpose || "",
    referenceContent ? `\n\n## Reference Content (from old site or provided text)\n${referenceContent}` : "",
  ].join("");

  // Plan sections
  const plan = await planPageSections({
    purpose: pageContext,
    existingSections,
    costContext: ctx.projectId
      ? {
          projectId: ctx.projectId,
          eventType: "ai-command",
          metadata: {
            batch_id: ctx.batchId || null,
            recommendation_id: rec.id,
            stage: "plan-page-sections",
          },
        }
      : undefined,
  });

  // Generate each section
  const createdSections: Array<{ name: string; content: string }> = [];

  for (const planned of plan.sections) {
    const tplId = crypto.randomUUID().slice(0, 12);

    try {
      const result = await generateSectionHtml({
        sectionName: planned.name,
        sectionPurpose: planned.purpose,
        tplId,
        pageContext,
        priorSections: createdSections.map((s) => s.content),
        siteStyleContext,
        costContext: ctx.projectId
          ? {
              projectId: ctx.projectId,
              eventType: "ai-command",
              metadata: {
                batch_id: ctx.batchId || null,
                recommendation_id: rec.id,
                stage: "generate-section",
                section_name: planned.name,
              },
            }
          : undefined,
      });

      // Run agentic pipeline on generated section
      const pipelineResult = await runAgenticPipeline(
        result.html,
        `${meta.path} > ${planned.name}`,
        {
          existingPaths: await getExistingPaths(projectId),
          existingPostSlugs: (await getExistingPostSlugs(projectId)).map((p: any) => `${p.post_type_slug}/${p.slug}`),
          recId: rec.id,
        }
      );

      createdSections.push({ name: planned.name, content: pipelineResult.html });

      if (pipelineResult.iterations > 1) {
        logger.info(`[AiCommand] Section ${planned.name}: ${pipelineResult.iterations} iterations, ${pipelineResult.uiFixAttempts} UI fixes, ${pipelineResult.linkFixAttempts} link fixes`);
      }
    } catch (err) {
      logger.error({ err: err }, `[AiCommand] Failed to generate section ${planned.name}:`);
    }
  }

  if (createdSections.length === 0) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: "Failed to generate any sections" }),
    });
    return;
  }

  // Create the page
  const page = await PageModel.insertReturning({
    project_id: projectId,
    path: meta.path,
    version: 1,
    status: "draft",
    sections: JSON.stringify(createdSections),
  });

  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({
      success: true,
      page_id: page.id,
      sections_created: createdSections.length,
    }),
  });

  // Register in execution context so later recommendations can reference this page
  ctx.createdPages.set(meta.page_purpose || meta.path, { path: meta.path, id: page.id });

  logger.info(
    `[AiCommand] ✓ Created page at ${meta.path} with ${createdSections.length} sections (page ID: ${page.id})`
  );
}

async function executeCreatePost(rec: any, ctx: ExecutionContext): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;
  const projectId = rec.target_id;

  // Resolve post type
  const project = await ProjectModel.findRawById(projectId);
  if (!project?.template_id) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: "Project has no template — cannot resolve post types" }),
    });
    return;
  }

  const postType = await PostTypeModel.findByTemplateAndSlug(
    project.template_id,
    meta.post_type_slug
  );

  if (!postType) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Post type "${meta.post_type_slug}" not found` }),
    });
    return;
  }

  // Check if post already exists
  const slug = meta.slug || meta.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const existing = await PostModel.findBySlug(projectId, postType.id, slug);

  if (existing) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Post with slug "${slug}" already exists` }),
    });
    return;
  }

  // Require reference data
  let referenceContent = "";
  if (meta.reference_content) {
    referenceContent = meta.reference_content;
  } else if (meta.reference_url) {
    try {
      logger.info(`[AiCommand] Scraping reference for post: ${meta.reference_url}`);
      const scrapeResponse = await fetch(meta.reference_url, {
        headers: { "User-Agent": "AlloroBot/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (scrapeResponse.ok) {
        const html = await scrapeResponse.text();
        referenceContent = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 8000);
        logger.info(`[AiCommand] ✓ Scraped ${referenceContent.length} chars for post reference`);
      }
    } catch (err) {
      logger.warn(`[AiCommand] Failed to scrape post reference: ${(err as Error).message}`);
    }
  }

  if (!referenceContent && !meta.reference_url) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({
        success: false,
        error: "Reference URL or content is required for post creation. Provide it when approving this recommendation.",
      }),
    });
    return;
  }

  // Fetch existing posts of same type as style context
  const existingPosts = await PostModel.findByProjectAndTypeLimit(
    projectId,
    postType.id,
    2
  );

  let styleContext = "";
  for (const ep of existingPosts) {
    if (ep.content && styleContext.length < 2000) {
      styleContext += `\n--- Existing ${meta.post_type_slug}: ${ep.title} ---\n${ep.content.substring(0, 800)}\n`;
    }
  }

  // Build custom fields context from post type schema
  const schema = typeof postType.schema === "string" ? JSON.parse(postType.schema) : postType.schema;
  let customFieldsInstruction = "";
  if (Array.isArray(schema) && schema.length > 0) {
    customFieldsInstruction = `\n\nThis post type has custom fields: ${schema.map((f: any) => `${f.label || f.name} (${f.type || "text"})`).join(", ")}. Include relevant information that could populate these fields in the content.`;
  }

  // Generate content via dedicated post content prompt
  const result = await generatePostContent({
    title: meta.title,
    postTypeName: postType.name,
    purpose: meta.purpose || "",
    referenceContent,
    styleContext,
    customFieldsHint: customFieldsInstruction,
    costContext: ctx.projectId
      ? {
          projectId: ctx.projectId,
          eventType: "ai-command",
          metadata: {
            batch_id: ctx.batchId || null,
            recommendation_id: rec.id,
            stage: "generate-post-content",
            post_title: meta.title,
          },
        }
      : undefined,
  });

  // Run agentic pipeline
  const existingPaths = await getExistingPaths(projectId);
  const existingPostSlugsRaw = await getExistingPostSlugs(projectId);
  const pipelineResult = await runAgenticPipeline(
    result.html,
    `Post: ${meta.title}`,
    {
      existingPaths,
      existingPostSlugs: existingPostSlugsRaw.map((p: any) => `${p.post_type_slug}/${p.slug}`),
      recId: rec.id,
    }
  );

  // Create the post
  const post = await PostModel.insertReturning({
    project_id: projectId,
    post_type_id: postType.id,
    title: meta.title,
    slug,
    content: pipelineResult.html,
    status: "draft",
    sort_order: 0,
  });

  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({
      success: true,
      post_id: post.id,
      iterations: pipelineResult.iterations,
      ui_fixes: pipelineResult.uiFixAttempts,
      link_fixes: pipelineResult.linkFixAttempts,
    }),
  });

  ctx.createdPosts.set(slug, { id: post.id, slug, post_type_slug: meta.post_type_slug });

  logger.info(`[AiCommand] ✓ Created post: ${meta.title} (${meta.post_type_slug}, ID: ${post.id})`);
}

async function executeUpdateMenu(rec: any, _ctx: ExecutionContext): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;
  const projectId = rec.target_id;

  // Find the menu by slug
  const { menus } = await menuManager.listMenus(projectId);
  const menu = menus.find((m: any) => m.slug === meta.menu_slug);

  if (!menu) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Menu "${meta.menu_slug}" not found` }),
    });
    return;
  }

  if (meta.action === "add") {
    // Use reference_url if the original URL was NEEDS_INPUT
    const itemUrl = (meta.url === "NEEDS_INPUT" && meta.reference_url) ? meta.reference_url : meta.url;

    if (itemUrl === "NEEDS_INPUT") {
      await AiCommandRecommendationModel.updateById(rec.id, {
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: "URL was not provided — this link requires user input" }),
      });
      return;
    }

    // Check if item with same URL already exists
    const menuDetail = await menuManager.getMenu(projectId, menu.id);
    const existingItem = findMenuItemByUrl(menuDetail.menu?.items || [], itemUrl);
    if (existingItem) {
      await AiCommandRecommendationModel.updateById(rec.id, {
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: `Menu item with URL "${meta.url}" already exists` }),
      });
      return;
    }

    // Resolve parent_label to parent_id if specified
    let parentId = meta.parent_id || null;
    if (!parentId && meta.parent_label) {
      const menuDetail = await menuManager.getMenu(projectId, menu.id);
      const parentItem = findMenuItemByLabel(menuDetail.menu?.items || [], meta.parent_label);
      if (parentItem) parentId = parentItem.id;
    }

    // Resolve after_label to order_index
    let orderIndex: number | undefined;
    if (meta.after_label) {
      const menuDetail2 = await menuManager.getMenu(projectId, menu.id);
      const afterItem = findMenuItemByLabel(menuDetail2.menu?.items || [], meta.after_label);
      if (afterItem) orderIndex = (afterItem.order_index || 0) + 1;
    }

    const result = await menuManager.createMenuItem(projectId, menu.id, {
      label: meta.label,
      url: itemUrl,
      target: meta.target || "_self",
      parent_id: parentId,
      order_index: orderIndex,
    });

    if (result.error) {
      await AiCommandRecommendationModel.updateById(rec.id, {
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: result.error.message }),
      });
      return;
    }

    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "executed",
      execution_result: JSON.stringify({ success: true, item_id: result.item.id }),
    });
    logger.info(`[AiCommand] ✓ Added menu item: "${meta.label}" → ${meta.url}`);

  } else if (meta.action === "remove") {
    const menuDetail = await menuManager.getMenu(projectId, menu.id);
    const item = findMenuItemByLabel(menuDetail.menu?.items || [], meta.label);

    if (!item) {
      await AiCommandRecommendationModel.updateById(rec.id, {
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: `Menu item "${meta.label}" not found` }),
      });
      return;
    }

    await menuManager.deleteMenuItem(projectId, menu.id, item.id);

    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "executed",
      execution_result: JSON.stringify({ success: true, deleted_item_id: item.id }),
    });
    logger.info(`[AiCommand] ✓ Removed menu item: "${meta.label}"`);

  } else if (meta.action === "update") {
    const menuDetail = await menuManager.getMenu(projectId, menu.id);
    const item = findMenuItemByLabel(menuDetail.menu?.items || [], meta.original_label || meta.label);

    if (!item) {
      await AiCommandRecommendationModel.updateById(rec.id, {
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: `Menu item "${meta.original_label || meta.label}" not found` }),
      });
      return;
    }

    const updates: Record<string, string> = {};
    if (meta.label) updates.label = meta.label;
    if (meta.url) updates.url = meta.url;
    if (meta.target) updates.target = meta.target;

    const result = await menuManager.updateMenuItem(projectId, menu.id, item.id, updates);

    if (result.error) {
      await AiCommandRecommendationModel.updateById(rec.id, {
        status: "failed",
        execution_result: JSON.stringify({ success: false, error: result.error.message }),
      });
      return;
    }

    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "executed",
      execution_result: JSON.stringify({ success: true, item_id: item.id }),
    });
    logger.info(`[AiCommand] ✓ Updated menu item: "${meta.label}"`);
  }
}

function findMenuItemByUrl(items: any[], url: string): any | null {
  for (const item of items) {
    if (item.url === url) return item;
    if (item.children?.length) {
      const found = findMenuItemByUrl(item.children, url);
      if (found) return found;
    }
  }
  return null;
}

function findMenuItemByLabel(items: any[], label: string): any | null {
  for (const item of items) {
    if (item.label.toLowerCase() === label.toLowerCase()) return item;
    if (item.children?.length) {
      const found = findMenuItemByLabel(item.children, label);
      if (found) return found;
    }
  }
  return null;
}

async function executeCreateMenu(rec: any, ctx: ExecutionContext): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;
  const projectId = rec.target_id;

  // Check if menu with this slug already exists
  const { menus } = await menuManager.listMenus(projectId);
  const existing = menus.find((m: any) => m.slug === meta.slug);
  if (existing) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Menu "${meta.slug}" already exists` }),
    });
    return;
  }

  const result = await menuManager.createMenu(projectId, { name: meta.name, slug: meta.slug });
  if (result.error) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: result.error.message }),
    });
    return;
  }

  ctx.createdMenus.set(meta.slug, result.menu.id);

  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({ success: true, menu_id: result.menu.id }),
  });
  logger.info(`[AiCommand] ✓ Created menu: "${meta.name}" (${meta.slug})`);
}

async function executeUpdateRedirect(rec: any): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  // Find existing redirect by from_path
  const existing = await RedirectModel.findByProjectAndFromPath(
    rec.target_id,
    meta.from_path
  );

  if (!existing) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Redirect from "${meta.from_path}" not found` }),
    });
    return;
  }

  const result = await redirectsService.updateRedirect(existing.id, {
    to_path: meta.to_path,
    type: meta.type,
  });

  if (result.error) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: result.error.message }),
    });
    return;
  }

  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({ success: true, redirect_id: existing.id }),
  });
  logger.info(`[AiCommand] ✓ Updated redirect: ${meta.from_path} → ${meta.to_path}`);
}

async function executeDeleteRedirect(rec: any): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  const existing = await RedirectModel.findByProjectAndFromPath(
    rec.target_id,
    meta.from_path
  );

  if (!existing) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Redirect from "${meta.from_path}" not found` }),
    });
    return;
  }

  await redirectsService.deleteRedirect(existing.id);

  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({ success: true, deleted_redirect_id: existing.id }),
  });
  logger.info(`[AiCommand] ✓ Deleted redirect: ${meta.from_path}`);
}

async function executeUpdatePostMeta(rec: any): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  const post = await PostModel.findRawById(meta.post_id);
  if (!post) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Post ${meta.post_id} not found` }),
    });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (meta.title !== undefined) updates.title = meta.title;
  if (meta.slug !== undefined) updates.slug = meta.slug;
  if (meta.custom_fields !== undefined) updates.custom_fields = JSON.stringify(meta.custom_fields);
  if (meta.featured_image !== undefined) updates.featured_image = meta.featured_image;
  if (meta.status !== undefined) updates.status = meta.status;

  await PostModel.updateFieldsById(meta.post_id, updates);

  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({ success: true, post_id: meta.post_id }),
  });
  logger.info(`[AiCommand] ✓ Updated post meta: ${meta.post_id}`);
}

async function executeUpdatePagePath(rec: any): Promise<void> {
  const meta = typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;

  const page = await PageModel.findRawById(meta.page_id);
  if (!page) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({ success: false, error: `Page ${meta.page_id} not found` }),
    });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (meta.new_path !== undefined) updates.path = meta.new_path;

  await PageModel.updateFieldsById(meta.page_id, updates);

  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({ success: true, page_id: meta.page_id }),
  });
  logger.info(`[AiCommand] ✓ Updated page path: ${page.path} → ${meta.new_path}`);
}

// ---------------------------------------------------------------------------
// Context helpers for structural analysis
// ---------------------------------------------------------------------------

async function getExistingPaths(projectId: string): Promise<string[]> {
  const pages = await PageModel.findExistingPaths(projectId);
  return pages.map((p: any) => p.path);
}

async function getExistingPostSlugs(
  projectId: string
): Promise<Array<{ slug: string; post_type_slug: string }>> {
  return PostModel.findExistingSlugsWithType(projectId);
}

async function getProjectPostTypes(
  projectId: string,
  templateId: string | null
): Promise<any[]> {
  if (!templateId) return [];
  return PostTypeModel.findByTemplateId(templateId);
}

async function getExistingMenuItems(
  projectId: string
): Promise<Array<{ menu_slug: string; items: Array<{ label: string; url: string }> }>> {
  const { menus } = await menuManager.listMenus(projectId);
  const result: Array<{ menu_slug: string; items: Array<{ label: string; url: string }> }> = [];

  for (const menu of menus) {
    const detail = await menuManager.getMenu(projectId, menu.id);
    const items = flattenMenuItems(detail.menu?.items || []);
    result.push({ menu_slug: menu.slug, items });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Execution summary — structured markdown from recommendation results
// ---------------------------------------------------------------------------

function getStructuralIcon(targetType: string): string {
  switch (targetType) {
    case "create_page": return "📄";
    case "create_post": return "📝";
    case "create_redirect": case "update_redirect": case "delete_redirect": return "🔀";
    case "create_menu": case "update_menu": return "📋";
    case "update_post_meta": return "📝";
    case "update_page_path": return "📄";
    default: return "✅";
  }
}

async function buildExecutionSummary(batchId: string): Promise<string> {
  const allRecs = await AiCommandRecommendationModel.findByBatchId(batchId);

  const executed = allRecs.filter((r: any) => r.status === "executed");
  const failed = allRecs.filter((r: any) => r.status === "failed");
  const rejected = allRecs.filter((r: any) => r.status === "rejected");

  // Categorize executed items
  const htmlEditTypes = ["page_section", "layout", "post"];
  const htmlEdits = executed.filter((r: any) => htmlEditTypes.includes(r.target_type));
  const structural = executed.filter((r: any) => !htmlEditTypes.includes(r.target_type));

  // Items needing visual check (had remaining validation issues)
  const needsVisualCheck = htmlEdits.filter((r: any) => {
    try {
      const result = typeof r.execution_result === "string" ? JSON.parse(r.execution_result) : r.execution_result;
      return result?.remaining_issues > 0;
    } catch { return false; }
  });

  // Manual action items (rejected with MANUAL flag)
  const manualItems = rejected.filter((r: any) => {
    return r.recommendation?.includes("MANUAL:") || r.recommendation?.includes("manual_action");
  });

  const lines: string[] = [];

  // Overview
  lines.push(`**${executed.length}** completed, **${failed.length}** failed, **${rejected.length}** skipped\n`);

  // Completed
  if (htmlEdits.length > 0 || structural.length > 0) {
    lines.push("### Completed");
    for (const r of htmlEdits) lines.push(`- ✏️ ${r.target_label}`);
    for (const r of structural) lines.push(`- ${getStructuralIcon(r.target_type)} ${r.target_label}`);
    lines.push("");
  }

  // Needs Visual Check
  if (needsVisualCheck.length > 0) {
    lines.push("### Needs Visual Check");
    for (const r of needsVisualCheck) {
      try {
        const result = typeof r.execution_result === "string" ? JSON.parse(r.execution_result) : r.execution_result;
        lines.push(`- 👁️ ${r.target_label} — ${result.remaining_issues} unresolved issue(s)`);
      } catch {
        lines.push(`- 👁️ ${r.target_label}`);
      }
    }
    lines.push("");
  }

  // Manual Action Required
  if (manualItems.length > 0) {
    lines.push("### Manual Action Required");
    for (const r of manualItems) lines.push(`- 🔧 ${r.target_label} — ${r.recommendation}`);
    lines.push("");
  }

  // Failed
  if (failed.length > 0) {
    lines.push("### Failed");
    for (const r of failed) {
      try {
        const result = typeof r.execution_result === "string" ? JSON.parse(r.execution_result) : r.execution_result;
        lines.push(`- ❌ ${r.target_label} — ${result?.error || "Unknown error"}`);
      } catch {
        lines.push(`- ❌ ${r.target_label}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function flattenMenuItems(items: any[]): Array<{ label: string; url: string }> {
  const flat: Array<{ label: string; url: string }> = [];
  for (const item of items) {
    flat.push({ label: item.label, url: item.url });
    if (item.children?.length) {
      flat.push(...flattenMenuItems(item.children));
    }
  }
  return flat;
}

// ---------------------------------------------------------------------------
// Template awareness — fetch post_block, menu, and review_block templates
// ---------------------------------------------------------------------------

interface ProjectTemplates {
  postBlocks: Array<{ slug: string; name: string; description: string | null; postTypeSlug: string }>;
  menuTemplates: Array<{ slug: string; name: string }>;
  reviewBlocks: Array<{ slug: string; name: string; description: string | null }>;
}

async function getProjectTemplates(templateId: string | null): Promise<ProjectTemplates> {
  const empty: ProjectTemplates = { postBlocks: [], menuTemplates: [], reviewBlocks: [] };
  if (!templateId) return empty;

  const [postBlocks, menuTemplates, reviewBlocks] = await Promise.all([
    PostBlockModel.findWithPostTypeByTemplateId(templateId),
    MenuTemplateModel.findSlugNameByTemplateId(templateId),
    ReviewBlockModel.findSlugNameDescriptionByTemplateId(templateId),
  ]);

  return {
    postBlocks: postBlocks.map((pb: any) => ({
      slug: pb.slug,
      name: pb.name,
      description: pb.description || null,
      postTypeSlug: pb.post_type_slug,
    })),
    menuTemplates: menuTemplates.map((mt: any) => ({
      slug: mt.slug,
      name: mt.name,
    })),
    reviewBlocks: reviewBlocks.map((rb: any) => ({
      slug: rb.slug,
      name: rb.name,
      description: rb.description || null,
    })),
  };
}

function buildTemplateContext(templates: ProjectTemplates): string {
  const lines: string[] = ["\n## Available Shortcode Templates\n"];

  if (templates.postBlocks.length > 0) {
    lines.push("### Post Block Templates (use with {{ post_block id='SLUG' items='POST_TYPE' }})");
    lines.push("For full article indexes, prefer {{ post_block id='articles-grid' items='articles' paginate='load-more' per_page='9' limit='0' }} when that template is available.");
    for (const pb of templates.postBlocks) {
      lines.push(`- ${pb.slug} (${pb.name}) — renders '${pb.postTypeSlug}' posts${pb.description ? ` — "${pb.description}"` : ""}`);
    }
    lines.push("");
  } else {
    lines.push("### Post Block Templates\n(none available — if recommending a post_block shortcode, note that a template must be created first)\n");
  }

  if (templates.menuTemplates.length > 0) {
    lines.push("### Menu Templates (use with {{ menu id='MENU_SLUG' template='TEMPLATE_SLUG' }})");
    for (const mt of templates.menuTemplates) {
      lines.push(`- ${mt.slug} (${mt.name})`);
    }
    lines.push("");
  }

  if (templates.reviewBlocks.length > 0) {
    lines.push("### Review Block Templates (use with {{ review_block id='SLUG' }})");
    lines.push("For compact long review lists, prefer {{ review_block id='review-list-compact' location='primary' paginate='load-more' per_page='6' limit='0' }} when that template is available.");
    for (const rb of templates.reviewBlocks) {
      lines.push(`- ${rb.slug} (${rb.name})${rb.description ? ` — "${rb.description}"` : ""}`);
    }
    lines.push("");
  } else {
    lines.push("### Review Block Templates\n(none available — if recommending a review_block shortcode, note that a template must be created first)\n");
  }

  return lines.join("\n");
}
