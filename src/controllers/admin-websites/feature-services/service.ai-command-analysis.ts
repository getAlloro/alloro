/**
 * AI Command — analysis phase
 *
 * Orchestrates batch analysis of website content (layouts, pages, posts)
 * against a user prompt/checklist, producing structured recommendations stored
 * for review. Covers the standard AI-editor flow (`analyzeBatch`) and the
 * specialized UI Checker / Link Checker flows (`analyzeSpecializedBatch`).
 *
 * Extracted from `service.ai-command.ts` as part of a behavior-preserving
 * decomposition; logic, signatures, and DB writes are unchanged. Shared
 * helpers live in `feature-utils/util.ai-command-shared` and template-context
 * building in `feature-utils/util.ai-command-templates`.
 */

import { AiCommandBatchModel } from "../../../models/website-builder/AiCommandBatchModel";
import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { normalizeSections } from "../feature-utils/util.section-normalizer";
import {
  analyzeHtmlContent,
  analyzeForStructuralChanges,
} from "../../../utils/website-utils/aiCommandService";
import * as redirectsService from "./service.redirects";
import { analyzeBuiltinFlags } from "../../../utils/website-utils/builtinAnalyzer";
import { analyzeUiIntegrity } from "../../../utils/website-utils/uiChecker";
import { analyzeBrokenLinks } from "../../../utils/website-utils/linkChecker";
import { screenshotPage } from "../../../utils/website-utils/screenshotService";
import { analyzeScreenshot } from "../../../utils/website-utils/aiCommandService";
import logger from "../../../lib/logger";
import {
  type AiCommandTargets,
  type BatchType,
  refreshStats,
  resolvePages,
  resolvePosts,
  getExistingPaths,
  getExistingPostSlugs,
  getProjectPostTypes,
  getExistingMenuItems,
  capitalize,
} from "../feature-utils/util.ai-command-shared";
import {
  getProjectTemplates,
  buildTemplateContext,
} from "../feature-utils/util.ai-command-templates";

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
