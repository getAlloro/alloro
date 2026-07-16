/**
 * AI Command — structural execution handlers
 *
 * Per-recommendation-type handlers invoked by the execute orchestrator
 * (`service.ai-command-execute`): create/update/delete redirects, create page,
 * create post, create/update menu, post-meta + page-path updates, plus the
 * recursive menu-item finders.
 *
 * Extracted from `service.ai-command.ts` (via `service.ai-command-execute`) as
 * part of a behavior-preserving decomposition; logic, signatures, and return
 * shapes are unchanged. The shared `ExecutionContext` type lives in
 * `feature-utils/util.ai-command-shared`.
 */

import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { PostModel } from "../../../models/website-builder/PostModel";
import { PostTypeModel } from "../../../models/website-builder/PostTypeModel";
import { RedirectModel } from "../../../models/website-builder/RedirectModel";
import { normalizeSections } from "../feature-utils/util.section-normalizer";
import {
  planPageSections,
  generateSectionHtml,
  generatePostContent,
} from "../../../utils/website-utils/aiCommandService";
import crypto from "crypto";
import * as redirectsService from "./service.redirects";
import * as menuManager from "./service.menu-manager";
import { runAgenticPipeline } from "../../../utils/website-utils/agenticHtmlPipeline";
import logger from "../../../lib/logger";
import {
  type ExecutionContext,
  getExistingPaths,
  getExistingPostSlugs,
  resolvePageDraftId,
} from "../feature-utils/util.ai-command-shared";
import { gateRewrite } from "../feature-utils/util.taste-rewrite-honesty";

export async function executeCreateRedirect(rec: any): Promise<void> {
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

export async function executeCreatePage(rec: any, ctx: ExecutionContext): Promise<void> {
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

export async function executeCreatePost(rec: any, ctx: ExecutionContext): Promise<void> {
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

export async function executeUpdateMenu(rec: any, _ctx: ExecutionContext): Promise<void> {
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

export async function executeCreateMenu(rec: any, ctx: ExecutionContext): Promise<void> {
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

export async function executeUpdateRedirect(rec: any): Promise<void> {
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

export async function executeDeleteRedirect(rec: any): Promise<void> {
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

export async function executeUpdatePostMeta(rec: any): Promise<void> {
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

export async function executeUpdatePagePath(rec: any): Promise<void> {
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
// B2 — taste_rewrite (Taste-Profile-driven CRO-lift rewrite)
// ---------------------------------------------------------------------------

/**
 * Publish a pre-generated, pre-gated section rewrite (B2). Unlike page_section —
 * which re-runs the LLM at execution — this writes the STORED copy from
 * `target_meta.rewritten_html` verbatim. That is what makes B2's two guarantees
 * structural: the published bytes are exactly the bytes the honesty gate passed
 * and the owner approved (no fresh generation), and an over-claim cannot appear
 * at publish time because the stored copy is re-asserted through `gateRewrite`
 * here — a poisoned stored row is failed, never published.
 *
 * Writes to the batch's pinned draft (same mechanism as saveEditedHtml's
 * page_section branch), so the end-of-batch auto-publish in `executeBatch`
 * picks it up and `verifyBatchEdits` confirms it reached the published page.
 */
export async function executeTasteRewrite(
  rec: any,
  ctx: ExecutionContext
): Promise<void> {
  const meta =
    typeof rec.target_meta === "string" ? JSON.parse(rec.target_meta) : rec.target_meta;
  const rewrittenHtml: string = meta?.rewritten_html ?? "";
  const sectionIndex: number = meta?.section_index;

  if (!rewrittenHtml || typeof sectionIndex !== "number") {
    throw new Error("taste_rewrite recommendation is missing rewritten_html/section_index");
  }

  // Re-assert the honesty gate on the STORED copy — defense in depth. A stored
  // rewrite that trips the gate (banned or subtle over-claim) is failed and
  // never reaches the page.
  const gate = gateRewrite(rewrittenHtml);
  if (!gate.ok) {
    await AiCommandRecommendationModel.updateById(rec.id, {
      status: "failed",
      execution_result: JSON.stringify({
        success: false,
        error: `Honesty gate blocked stored copy: ${gate.reasonCodes.join(", ")}`,
      }),
    });
    logger.warn(
      `[TasteRewrite] BLOCKED at execution ${rec.target_label}: ${gate.reasonCodes.join(", ")}`
    );
    return;
  }

  const origPage = await PageModel.findRawById(rec.target_id);
  if (!origPage) throw new Error(`Page ${rec.target_id} not found`);

  const draftId = await resolvePageDraftId(origPage, ctx);
  const page = await PageModel.findRawById(draftId);
  if (!page) throw new Error(`Draft ${draftId} disappeared for path ${origPage.path}`);

  const rawSections =
    typeof page.sections === "string" ? JSON.parse(page.sections) : page.sections;
  const sections = normalizeSections(rawSections);
  const section = sections[sectionIndex];
  if (section === undefined) {
    throw new Error(`Section ${sectionIndex} not found on ${origPage.path}`);
  }

  if (typeof section === "string") {
    sections[sectionIndex] = rewrittenHtml;
  } else {
    sections[sectionIndex] = { ...section, content: rewrittenHtml };
  }

  await PageModel.updateSectionsById(page.id, JSON.stringify(sections));

  await AiCommandRecommendationModel.updateById(rec.id, {
    status: "executed",
    execution_result: JSON.stringify({
      success: true,
      edited_html: rewrittenHtml,
      source: "taste_rewrite_stored",
    }),
  });
  logger.info(`[TasteRewrite] ✓ Executed (stored copy): ${rec.target_label}`);
}
