/**
 * Post Taxonomy Manager Service
 *
 * CRUD for categories and tags scoped to post types.
 * Categories are hierarchical (parent_id). Tags are flat.
 */

import { db } from "../../../database/connection";
import logger from "../../../lib/logger";

const POST_TYPES_TABLE = "website_builder.post_types";
const CATEGORIES_TABLE = "website_builder.post_categories";
const TAGS_TABLE = "website_builder.post_tags";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// =====================================================================
// CATEGORIES
// =====================================================================

export async function listCategories(postTypeId: string): Promise<{
  categories: any[];
  error?: { status: number; code: string; message: string };
}> {
  const postType = await db(POST_TYPES_TABLE).where("id", postTypeId).first();
  if (!postType) {
    return {
      categories: [],
      error: { status: 404, code: "NOT_FOUND", message: "Post type not found" },
    };
  }

  const categories = await db(CATEGORIES_TABLE)
    .where("post_type_id", postTypeId)
    .orderBy("sort_order", "asc");

  return { categories };
}

export async function createCategory(
  postTypeId: string,
  data: { name: string; description?: string; parent_id?: string }
): Promise<{
  category: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name, description, parent_id } = data;

  if (!name) {
    return {
      category: null,
      error: { status: 400, code: "INVALID_INPUT", message: "name is required" },
    };
  }

  const postType = await db(POST_TYPES_TABLE).where("id", postTypeId).first();
  if (!postType) {
    return {
      category: null,
      error: { status: 404, code: "NOT_FOUND", message: "Post type not found" },
    };
  }

  const slug = slugify(name);
  const existing = await db(CATEGORIES_TABLE)
    .where({ post_type_id: postTypeId, slug })
    .first();
  if (existing) {
    return {
      category: null,
      error: {
        status: 409,
        code: "SLUG_CONFLICT",
        message: `Category "${slug}" already exists`,
      },
    };
  }

  // Validate parent_id if provided
  if (parent_id) {
    const parent = await db(CATEGORIES_TABLE)
      .where({ id: parent_id, post_type_id: postTypeId })
      .first();
    if (!parent) {
      return {
        category: null,
        error: { status: 400, code: "INVALID_PARENT", message: "Parent category not found" },
      };
    }
  }

  const [category] = await db(CATEGORIES_TABLE)
    .insert({
      post_type_id: postTypeId,
      name,
      slug,
      description: description || null,
      parent_id: parent_id || null,
    })
    .returning("*");

  logger.info(`[Admin Websites] ✓ Created category "${name}" for post type ${postTypeId}`);

  return { category };
}

export async function updateCategory(
  postTypeId: string,
  categoryId: string,
  updates: Record<string, any>
): Promise<{
  category: any;
  error?: { status: number; code: string; message: string };
}> {
  const existing = await db(CATEGORIES_TABLE)
    .where({ id: categoryId, post_type_id: postTypeId })
    .first();
  if (!existing) {
    return {
      category: null,
      error: { status: 404, code: "NOT_FOUND", message: "Category not found" },
    };
  }

  delete updates.id;
  delete updates.post_type_id;
  delete updates.created_at;

  if (updates.name && updates.name !== existing.name) {
    updates.slug = slugify(updates.name);
    const conflict = await db(CATEGORIES_TABLE)
      .where({ post_type_id: postTypeId, slug: updates.slug })
      .whereNot("id", categoryId)
      .first();
    if (conflict) {
      return {
        category: null,
        error: { status: 409, code: "SLUG_CONFLICT", message: `Category "${updates.slug}" already exists` },
      };
    }
  }

  // Prevent circular parent reference
  if (updates.parent_id === categoryId) {
    return {
      category: null,
      error: { status: 400, code: "CIRCULAR_PARENT", message: "A category cannot be its own parent" },
    };
  }

  const [category] = await db(CATEGORIES_TABLE)
    .where({ id: categoryId, post_type_id: postTypeId })
    .update({ ...updates, updated_at: db.fn.now() })
    .returning("*");

  return { category };
}

export async function deleteCategory(
  postTypeId: string,
  categoryId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await db(CATEGORIES_TABLE)
    .where({ id: categoryId, post_type_id: postTypeId })
    .first();
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Category not found" },
    };
  }

  await db(CATEGORIES_TABLE)
    .where({ id: categoryId, post_type_id: postTypeId })
    .del();

  logger.info(`[Admin Websites] ✓ Deleted category ID: ${categoryId}`);

  return {};
}

// =====================================================================
// TAGS
// =====================================================================

export async function listTags(postTypeId: string): Promise<{
  tags: any[];
  error?: { status: number; code: string; message: string };
}> {
  const postType = await db(POST_TYPES_TABLE).where("id", postTypeId).first();
  if (!postType) {
    return {
      tags: [],
      error: { status: 404, code: "NOT_FOUND", message: "Post type not found" },
    };
  }

  const tags = await db(TAGS_TABLE)
    .where("post_type_id", postTypeId)
    .orderBy("name", "asc");

  return { tags };
}

export async function createTag(
  postTypeId: string,
  data: { name: string }
): Promise<{
  tag: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name } = data;

  if (!name) {
    return {
      tag: null,
      error: { status: 400, code: "INVALID_INPUT", message: "name is required" },
    };
  }

  const postType = await db(POST_TYPES_TABLE).where("id", postTypeId).first();
  if (!postType) {
    return {
      tag: null,
      error: { status: 404, code: "NOT_FOUND", message: "Post type not found" },
    };
  }

  const slug = slugify(name);
  const existing = await db(TAGS_TABLE)
    .where({ post_type_id: postTypeId, slug })
    .first();
  if (existing) {
    return {
      tag: null,
      error: { status: 409, code: "SLUG_CONFLICT", message: `Tag "${slug}" already exists` },
    };
  }

  const [tag] = await db(TAGS_TABLE)
    .insert({ post_type_id: postTypeId, name, slug })
    .returning("*");

  logger.info(`[Admin Websites] ✓ Created tag "${name}" for post type ${postTypeId}`);

  return { tag };
}

export async function updateTag(
  postTypeId: string,
  tagId: string,
  updates: Record<string, any>
): Promise<{
  tag: any;
  error?: { status: number; code: string; message: string };
}> {
  const existing = await db(TAGS_TABLE)
    .where({ id: tagId, post_type_id: postTypeId })
    .first();
  if (!existing) {
    return {
      tag: null,
      error: { status: 404, code: "NOT_FOUND", message: "Tag not found" },
    };
  }

  delete updates.id;
  delete updates.post_type_id;
  delete updates.created_at;

  if (updates.name && updates.name !== existing.name) {
    updates.slug = slugify(updates.name);
    const conflict = await db(TAGS_TABLE)
      .where({ post_type_id: postTypeId, slug: updates.slug })
      .whereNot("id", tagId)
      .first();
    if (conflict) {
      return {
        tag: null,
        error: { status: 409, code: "SLUG_CONFLICT", message: `Tag "${updates.slug}" already exists` },
      };
    }
  }

  const [tag] = await db(TAGS_TABLE)
    .where({ id: tagId, post_type_id: postTypeId })
    .update({ ...updates, updated_at: db.fn.now() })
    .returning("*");

  return { tag };
}

export async function deleteTag(
  postTypeId: string,
  tagId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await db(TAGS_TABLE)
    .where({ id: tagId, post_type_id: postTypeId })
    .first();
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Tag not found" },
    };
  }

  await db(TAGS_TABLE)
    .where({ id: tagId, post_type_id: postTypeId })
    .del();

  logger.info(`[Admin Websites] ✓ Deleted tag ID: ${tagId}`);

  return {};
}
