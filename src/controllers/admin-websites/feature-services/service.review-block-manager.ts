/**
 * Review Block Manager Service
 *
 * CRUD for review blocks scoped to templates.
 * Review blocks define reusable rendering layouts for GBP reviews,
 * referenced via {{ review_block }} shortcodes in project pages.
 */

import { ReviewBlockModel } from "../../../models/website-builder/ReviewBlockModel";
import { TemplateModel } from "../../../models/website-builder/TemplateModel";
import { getRedisConnection } from "../../../workers/queues";
import logger from "../../../lib/logger";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function invalidateReviewBlockCache(templateId: string, slug: string) {
  try {
    const redis = getRedisConnection();
    // Delete all cached renders for this review block (any location/filter combo)
    const keys = await redis.keys(`rb:${templateId}:${slug}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.error({ err: err }, "[Admin Websites] Failed to invalidate review block cache:");
  }
}

// ---------------------------------------------------------------------------
// List review blocks for a template
// ---------------------------------------------------------------------------

export async function listReviewBlocks(templateId: string): Promise<{
  reviewBlocks: any[];
  error?: { status: number; code: string; message: string };
}> {
  const template = await TemplateModel.findRawById(templateId);
  if (!template) {
    return {
      reviewBlocks: [],
      error: { status: 404, code: "NOT_FOUND", message: "Template not found" },
    };
  }

  const reviewBlocks = await ReviewBlockModel.findByTemplateIdOrdered(templateId);

  return { reviewBlocks };
}

// ---------------------------------------------------------------------------
// Create review block
// ---------------------------------------------------------------------------

export async function createReviewBlock(
  templateId: string,
  data: {
    name: string;
    description?: string;
    sections?: { name: string; content: string }[];
  }
): Promise<{
  reviewBlock: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name, description, sections } = data;

  if (!name) {
    return {
      reviewBlock: null,
      error: { status: 400, code: "INVALID_INPUT", message: "name is required" },
    };
  }

  const template = await TemplateModel.findRawById(templateId);
  if (!template) {
    return {
      reviewBlock: null,
      error: { status: 404, code: "NOT_FOUND", message: "Template not found" },
    };
  }

  const slug = slugify(name);
  const existing = await ReviewBlockModel.findByTemplateAndSlugRaw(templateId, slug);
  if (existing) {
    return {
      reviewBlock: null,
      error: {
        status: 409,
        code: "SLUG_CONFLICT",
        message: `A review block with slug "${slug}" already exists`,
      },
    };
  }

  logger.info(`[Admin Websites] Creating review block "${name}" for template ${templateId}`);

  const reviewBlock = await ReviewBlockModel.insertReturning({
    template_id: templateId,
    name,
    slug,
    description: description || null,
    sections: JSON.stringify(sections || []),
  });

  logger.info(`[Admin Websites] Created review block ID: ${reviewBlock.id}`);

  return { reviewBlock };
}

// ---------------------------------------------------------------------------
// Get review block
// ---------------------------------------------------------------------------

export async function getReviewBlock(
  templateId: string,
  reviewBlockId: string
): Promise<any> {
  const block = await ReviewBlockModel.findByIdAndTemplate(reviewBlockId, templateId);

  if (block && typeof block.sections === "string") {
    block.sections = JSON.parse(block.sections);
  }

  return block || null;
}

// ---------------------------------------------------------------------------
// Update review block
// ---------------------------------------------------------------------------

export async function updateReviewBlock(
  templateId: string,
  reviewBlockId: string,
  updates: Record<string, any>
): Promise<{
  reviewBlock: any;
  error?: { status: number; code: string; message: string };
}> {
  const existing = await ReviewBlockModel.findByIdAndTemplate(reviewBlockId, templateId);
  if (!existing) {
    return {
      reviewBlock: null,
      error: { status: 404, code: "NOT_FOUND", message: "Review block not found" },
    };
  }

  delete updates.id;
  delete updates.template_id;
  delete updates.created_at;

  if (updates.name && updates.name !== existing.name) {
    updates.slug = slugify(updates.name);
    const conflict = await ReviewBlockModel.findSlugConflictExcludingId(
      templateId,
      updates.slug,
      reviewBlockId
    );
    if (conflict) {
      return {
        reviewBlock: null,
        error: { status: 409, code: "SLUG_CONFLICT", message: `Review block "${updates.slug}" already exists` },
      };
    }
  }

  if (updates.sections !== undefined) {
    updates.sections = JSON.stringify(updates.sections);
  }

  const reviewBlock = await ReviewBlockModel.updateByIdAndTemplateReturning(
    reviewBlockId,
    templateId,
    updates
  );

  logger.info(`[Admin Websites] Updated review block ID: ${reviewBlockId}`);

  // Invalidate cache
  await invalidateReviewBlockCache(templateId, existing.slug);
  if (updates.slug && updates.slug !== existing.slug) {
    await invalidateReviewBlockCache(templateId, updates.slug);
  }

  return { reviewBlock };
}

// ---------------------------------------------------------------------------
// Delete review block
// ---------------------------------------------------------------------------

export async function deleteReviewBlock(
  templateId: string,
  reviewBlockId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await ReviewBlockModel.findByIdAndTemplate(reviewBlockId, templateId);
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Review block not found" },
    };
  }

  await ReviewBlockModel.deleteByIdAndTemplate(reviewBlockId, templateId);

  logger.info(`[Admin Websites] Deleted review block ID: ${reviewBlockId}`);

  await invalidateReviewBlockCache(templateId, existing.slug);

  return {};
}
