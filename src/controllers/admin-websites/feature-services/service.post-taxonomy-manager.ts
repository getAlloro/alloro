/**
 * Post Taxonomy Manager Service
 *
 * CRUD for categories and tags scoped to post types.
 * Categories are hierarchical (parent_id). Tags are flat.
 */

import { PostTypeModel } from "../../../models/website-builder/PostTypeModel";
import { PostCategoryModel } from "../../../models/website-builder/PostCategoryModel";
import { PostTagModel } from "../../../models/website-builder/PostTagModel";
import logger from "../../../lib/logger";

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
  const postType = await PostTypeModel.findRawById(postTypeId);
  if (!postType) {
    return {
      categories: [],
      error: { status: 404, code: "NOT_FOUND", message: "Post type not found" },
    };
  }

  const categories = await PostCategoryModel.findByPostTypeId(postTypeId);

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

  const postType = await PostTypeModel.findRawById(postTypeId);
  if (!postType) {
    return {
      category: null,
      error: { status: 404, code: "NOT_FOUND", message: "Post type not found" },
    };
  }

  const slug = slugify(name);
  const existing = await PostCategoryModel.findByPostTypeAndSlug(
    postTypeId,
    slug
  );
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
    const parent = await PostCategoryModel.findByIdAndPostType(
      parent_id,
      postTypeId
    );
    if (!parent) {
      return {
        category: null,
        error: { status: 400, code: "INVALID_PARENT", message: "Parent category not found" },
      };
    }
  }

  const category = await PostCategoryModel.insertRawReturning({
    post_type_id: postTypeId,
    name,
    slug,
    description: description || null,
    parent_id: parent_id || null,
  });

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
  const existing = await PostCategoryModel.findByIdAndPostType(
    categoryId,
    postTypeId
  );
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
    const conflict = await PostCategoryModel.findSlugConflict(
      postTypeId,
      updates.slug,
      categoryId
    );
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

  const category = await PostCategoryModel.updateByIdAndPostTypeReturning(
    categoryId,
    postTypeId,
    updates
  );

  return { category };
}

export async function deleteCategory(
  postTypeId: string,
  categoryId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await PostCategoryModel.findByIdAndPostType(
    categoryId,
    postTypeId
  );
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Category not found" },
    };
  }

  await PostCategoryModel.deleteByIdAndPostType(categoryId, postTypeId);

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
  const postType = await PostTypeModel.findRawById(postTypeId);
  if (!postType) {
    return {
      tags: [],
      error: { status: 404, code: "NOT_FOUND", message: "Post type not found" },
    };
  }

  const tags = await PostTagModel.findByPostTypeId(postTypeId);

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

  const postType = await PostTypeModel.findRawById(postTypeId);
  if (!postType) {
    return {
      tag: null,
      error: { status: 404, code: "NOT_FOUND", message: "Post type not found" },
    };
  }

  const slug = slugify(name);
  const existing = await PostTagModel.findByPostTypeAndSlug(postTypeId, slug);
  if (existing) {
    return {
      tag: null,
      error: { status: 409, code: "SLUG_CONFLICT", message: `Tag "${slug}" already exists` },
    };
  }

  const tag = await PostTagModel.insertRawReturning({
    post_type_id: postTypeId,
    name,
    slug,
  });

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
  const existing = await PostTagModel.findByIdAndPostType(tagId, postTypeId);
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
    const conflict = await PostTagModel.findSlugConflict(
      postTypeId,
      updates.slug,
      tagId
    );
    if (conflict) {
      return {
        tag: null,
        error: { status: 409, code: "SLUG_CONFLICT", message: `Tag "${updates.slug}" already exists` },
      };
    }
  }

  const tag = await PostTagModel.updateByIdAndPostTypeReturning(
    tagId,
    postTypeId,
    updates
  );

  return { tag };
}

export async function deleteTag(
  postTypeId: string,
  tagId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await PostTagModel.findByIdAndPostType(tagId, postTypeId);
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Tag not found" },
    };
  }

  await PostTagModel.deleteByIdAndPostType(tagId, postTypeId);

  logger.info(`[Admin Websites] ✓ Deleted tag ID: ${tagId}`);

  return {};
}
