/**
 * Post Block Manager Service
 *
 * CRUD for post blocks scoped to templates.
 * Post blocks define reusable rendering layouts for posts,
 * referenced via {{ post_block }} shortcodes in project pages.
 */

import { PostBlockModel } from "../../../models/website-builder/PostBlockModel";
import { PostTypeModel } from "../../../models/website-builder/PostTypeModel";
import { TemplateModel } from "../../../models/website-builder/TemplateModel";
import { getRedisConnection } from "../../../workers/queues";
import logger from "../../../lib/logger";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function invalidatePostBlockCache(templateId: string, slug: string) {
  try {
    const redis = getRedisConnection();
    await redis.del(`pb:${templateId}:${slug}`);
  } catch (err) {
    logger.error({ err: err }, "[Admin Websites] Failed to invalidate post block cache:");
  }
}

// ---------------------------------------------------------------------------
// List post blocks for a template
// ---------------------------------------------------------------------------

export async function listPostBlocks(templateId: string): Promise<{
  postBlocks: any[];
  error?: { status: number; code: string; message: string };
}> {
  const template = await TemplateModel.findRawById(templateId);
  if (!template) {
    return {
      postBlocks: [],
      error: { status: 404, code: "NOT_FOUND", message: "Template not found" },
    };
  }

  const postBlocks = await PostBlockModel.findByTemplateIdOrdered(templateId);

  return { postBlocks };
}

// ---------------------------------------------------------------------------
// Create post block
// ---------------------------------------------------------------------------

export async function createPostBlock(
  templateId: string,
  data: {
    name: string;
    post_type_id: string;
    description?: string;
    sections?: { name: string; content: string }[];
  }
): Promise<{
  postBlock: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name, post_type_id, description, sections } = data;

  if (!name) {
    return {
      postBlock: null,
      error: { status: 400, code: "INVALID_INPUT", message: "name is required" },
    };
  }

  if (!post_type_id) {
    return {
      postBlock: null,
      error: { status: 400, code: "INVALID_INPUT", message: "post_type_id is required" },
    };
  }

  const template = await TemplateModel.findRawById(templateId);
  if (!template) {
    return {
      postBlock: null,
      error: { status: 404, code: "NOT_FOUND", message: "Template not found" },
    };
  }

  // Verify post type belongs to this template
  const postType = await PostTypeModel.findByIdAndTemplate(post_type_id, templateId);
  if (!postType) {
    return {
      postBlock: null,
      error: { status: 400, code: "INVALID_POST_TYPE", message: "Post type not found in this template" },
    };
  }

  const slug = slugify(name);
  const existing = await PostBlockModel.findByTemplateAndSlugRaw(templateId, slug);
  if (existing) {
    return {
      postBlock: null,
      error: {
        status: 409,
        code: "SLUG_CONFLICT",
        message: `A post block with slug "${slug}" already exists`,
      },
    };
  }

  logger.info(`[Admin Websites] Creating post block "${name}" for template ${templateId}`);

  const postBlock = await PostBlockModel.insertReturning({
    template_id: templateId,
    post_type_id,
    name,
    slug,
    description: description || null,
    sections: JSON.stringify(sections || []),
  });

  logger.info(`[Admin Websites] ✓ Created post block ID: ${postBlock.id}`);

  return { postBlock };
}

// ---------------------------------------------------------------------------
// Get post block
// ---------------------------------------------------------------------------

export async function getPostBlock(
  templateId: string,
  postBlockId: string
): Promise<any> {
  const block = await PostBlockModel.findByIdAndTemplate(postBlockId, templateId);

  if (block && typeof block.sections === "string") {
    block.sections = JSON.parse(block.sections);
  }

  return block || null;
}

// ---------------------------------------------------------------------------
// Update post block
// ---------------------------------------------------------------------------

export async function updatePostBlock(
  templateId: string,
  postBlockId: string,
  updates: Record<string, any>
): Promise<{
  postBlock: any;
  error?: { status: number; code: string; message: string };
}> {
  const existing = await PostBlockModel.findByIdAndTemplate(postBlockId, templateId);
  if (!existing) {
    return {
      postBlock: null,
      error: { status: 404, code: "NOT_FOUND", message: "Post block not found" },
    };
  }

  delete updates.id;
  delete updates.template_id;
  delete updates.created_at;

  if (updates.name && updates.name !== existing.name) {
    updates.slug = slugify(updates.name);
    const conflict = await PostBlockModel.findSlugConflictExcludingId(
      templateId,
      updates.slug,
      postBlockId
    );
    if (conflict) {
      return {
        postBlock: null,
        error: { status: 409, code: "SLUG_CONFLICT", message: `Post block "${updates.slug}" already exists` },
      };
    }
  }

  if (updates.sections !== undefined) {
    updates.sections = JSON.stringify(updates.sections);
  }

  if (updates.post_type_id) {
    const postType = await PostTypeModel.findByIdAndTemplate(
      updates.post_type_id,
      templateId
    );
    if (!postType) {
      return {
        postBlock: null,
        error: { status: 400, code: "INVALID_POST_TYPE", message: "Post type not found in this template" },
      };
    }
  }

  const postBlock = await PostBlockModel.updateByIdAndTemplateReturning(
    postBlockId,
    templateId,
    updates
  );

  logger.info(`[Admin Websites] ✓ Updated post block ID: ${postBlockId}`);

  // Invalidate cache
  await invalidatePostBlockCache(templateId, existing.slug);
  if (updates.slug && updates.slug !== existing.slug) {
    await invalidatePostBlockCache(templateId, updates.slug);
  }

  return { postBlock };
}

// ---------------------------------------------------------------------------
// Delete post block
// ---------------------------------------------------------------------------

export async function deletePostBlock(
  templateId: string,
  postBlockId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await PostBlockModel.findByIdAndTemplate(postBlockId, templateId);
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Post block not found" },
    };
  }

  await PostBlockModel.deleteByIdAndTemplate(postBlockId, templateId);

  logger.info(`[Admin Websites] ✓ Deleted post block ID: ${postBlockId}`);

  await invalidatePostBlockCache(templateId, existing.slug);

  return {};
}
