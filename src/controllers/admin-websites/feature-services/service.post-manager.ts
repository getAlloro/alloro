/**
 * Post Manager Service
 *
 * CRUD for posts scoped to projects.
 * Handles category/tag assignments and cache invalidation.
 */

import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { PostModel } from "../../../models/website-builder/PostModel";
import { PostTypeModel } from "../../../models/website-builder/PostTypeModel";
import { PostAttachmentModel } from "../../../models/website-builder/PostAttachmentModel";
import { getRedisConnection } from "../../../workers/queues";
import logger from "../../../lib/logger";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Boundary check for `gallery`-typed custom fields. The resolver expects
 * gallery values to be arrays of `{ url, link?, alt, caption? }`. If an
 * incoming value for a schema-declared gallery field is present but not an
 * array, reject with a 400 so the renderer never sees malformed data.
 *
 * Item-shape validation is intentionally shallow — the admin UI is trusted
 * to produce well-formed items; malformed items render as empty strings via
 * the resolver's skip-non-primitive rule.
 */
function validateGalleryFields(
  schema: unknown,
  customFields: Record<string, unknown> | undefined
): { valid: true } | { valid: false; message: string } {
  if (!customFields || !Array.isArray(schema)) return { valid: true };
  for (const field of schema as Array<Record<string, unknown>>) {
    if (!field || typeof field !== "object") continue;
    if (field.type !== "gallery") continue;
    const slug = typeof field.slug === "string" ? field.slug : undefined;
    if (!slug) continue;
    if (!(slug in customFields)) continue;
    const value = customFields[slug];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value)) {
      return {
        valid: false,
        message: `Custom field "${slug}" is declared as a gallery and must be an array`,
      };
    }
  }
  return { valid: true };
}

async function invalidatePostsCache(projectId: string) {
  try {
    const redis = getRedisConnection();
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        `posts:${projectId}:*`,
        "COUNT",
        100
      );
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch (err) {
    logger.error({ err: err }, "[Admin Websites] Failed to invalidate posts cache:");
  }
}

/**
 * Enrich a post with its categories and tags
 */
async function enrichPost(post: any): Promise<any> {
  const [catRows, tagRows, attachments] = await Promise.all([
    PostModel.findAssignedCategories(post.id),
    PostModel.findAssignedTags(post.id),
    PostModel.findAttachmentsByPostId(post.id),
  ]);

  return {
    ...post,
    categories: catRows,
    tags: tagRows,
    attachments,
  };
}

// ---------------------------------------------------------------------------
// List posts for a project
// ---------------------------------------------------------------------------

export async function listPosts(
  projectId: string,
  filters?: { post_type_id?: string; status?: string }
): Promise<{
  posts: any[];
  error?: { status: number; code: string; message: string };
}> {
  const project = await ProjectModel.findRawById(projectId);
  if (!project) {
    return {
      posts: [],
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  const posts = await PostModel.findByProjectFiltered(projectId, filters);

  // Enrich with categories and tags
  const enriched = await Promise.all(posts.map(enrichPost));

  return { posts: enriched };
}

// ---------------------------------------------------------------------------
// Create post
// ---------------------------------------------------------------------------

export async function createPost(
  projectId: string,
  data: {
    post_type_id: string;
    title: string;
    content?: string;
    excerpt?: string;
    featured_image?: string;
    status?: string;
    custom_fields?: Record<string, unknown>;
    category_ids?: string[];
    tag_ids?: string[];
  }
): Promise<{
  post: any;
  error?: { status: number; code: string; message: string };
}> {
  const { post_type_id, title, content, excerpt, featured_image, status, custom_fields, category_ids, tag_ids } = data;

  if (!title) {
    return {
      post: null,
      error: { status: 400, code: "INVALID_INPUT", message: "title is required" },
    };
  }

  if (!post_type_id) {
    return {
      post: null,
      error: { status: 400, code: "INVALID_INPUT", message: "post_type_id is required" },
    };
  }

  const project = await ProjectModel.findRawById(projectId);
  if (!project) {
    return {
      post: null,
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  // Verify post type exists (it belongs to a template, not the project directly)
  const postType = await PostTypeModel.findRawById(post_type_id);
  if (!postType) {
    return {
      post: null,
      error: { status: 400, code: "INVALID_POST_TYPE", message: "Post type not found" },
    };
  }

  // Boundary check: gallery-typed custom fields must be arrays.
  const ptSchema =
    typeof postType.schema === "string"
      ? JSON.parse(postType.schema || "[]")
      : postType.schema;
  const galleryCheck = validateGalleryFields(ptSchema, custom_fields);
  if (!galleryCheck.valid) {
    return {
      post: null,
      error: { status: 400, code: "INVALID_CUSTOM_FIELD", message: galleryCheck.message },
    };
  }

  let slug = slugify(title);

  // Ensure slug uniqueness within project + post type
  const existing = await PostModel.findBySlug(projectId, post_type_id, slug);
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  logger.info(`[Admin Websites] Creating post "${title}" for project ${projectId}`);

  const postStatus = status || "draft";

  const post = await PostModel.insertReturning({
    project_id: projectId,
    post_type_id,
    title,
    slug,
    content: content || "",
    excerpt: excerpt || null,
    featured_image: featured_image || null,
    custom_fields: JSON.stringify(custom_fields || {}),
    status: postStatus,
    published_at: postStatus === "published" ? new Date() : null,
  });

  // Assign categories
  if (category_ids && category_ids.length > 0) {
    await PostModel.insertCategoryAssignments(
      category_ids.map((cid) => ({ post_id: post.id, category_id: cid }))
    );
  }

  // Assign tags
  if (tag_ids && tag_ids.length > 0) {
    await PostModel.insertTagAssignments(
      tag_ids.map((tid) => ({ post_id: post.id, tag_id: tid }))
    );
  }

  logger.info(`[Admin Websites] ✓ Created post ID: ${post.id}`);

  await invalidatePostsCache(projectId);

  const enriched = await enrichPost(post);
  return { post: enriched };
}

// ---------------------------------------------------------------------------
// Duplicate post
// ---------------------------------------------------------------------------

/**
 * Clone an existing post into a new draft titled `"{title} [copy]"`.
 *
 * Faithfully copies content, excerpt, featured image, custom fields, SEO data,
 * and the post's category/tag assignments and attachment rows. The clone is
 * always a draft and never inherits `source_url` — that column is the
 * import-from-identity dedup key (project_id + post_type_id + source_url), so
 * copying it would corrupt re-import matching.
 *
 * The post row and all child rows are written in one transaction (§10.5);
 * attachment rows reference the same S3 URLs (no re-upload).
 */
export async function duplicatePost(
  projectId: string,
  postId: string
): Promise<{
  post: any;
  error?: { status: number; code: string; message: string };
}> {
  const source = await PostModel.findByIdAndProject(postId, projectId);
  if (!source) {
    return {
      post: null,
      error: { status: 404, code: "NOT_FOUND", message: "Post not found" },
    };
  }

  // Gather the child rows to clone alongside the post.
  const [sourceCategories, sourceTags, sourceAttachments] = await Promise.all([
    PostModel.findAssignedCategories(postId),
    PostModel.findAssignedTags(postId),
    PostModel.findAttachmentsByPostId(postId),
  ]);

  // New title + unique slug (mirrors createPost's slug logic).
  const title = `${source.title} [copy]`;
  let slug = slugify(title);
  const existing = await PostModel.findBySlug(projectId, source.post_type_id, slug);
  if (existing) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  logger.info(
    `[Admin Websites] Duplicating post ${postId} -> "${title}" for project ${projectId}`
  );

  // Clone the post and its child rows atomically.
  const newPost = await PostModel.transaction(async (trx) => {
    const post = await PostModel.insertReturning(
      {
        project_id: projectId,
        post_type_id: source.post_type_id,
        title,
        slug,
        content: source.content || "",
        excerpt: source.excerpt ?? null,
        featured_image: source.featured_image ?? null,
        custom_fields: JSON.stringify(source.custom_fields ?? {}),
        seo_data: source.seo_data == null ? null : JSON.stringify(source.seo_data),
        status: "draft",
        published_at: null,
        source_url: null,
      },
      trx
    );

    if (sourceCategories.length > 0) {
      await PostModel.insertCategoryAssignments(
        sourceCategories.map((c) => ({ post_id: post.id, category_id: c.id })),
        trx
      );
    }

    if (sourceTags.length > 0) {
      await PostModel.insertTagAssignments(
        sourceTags.map((t) => ({ post_id: post.id, tag_id: t.id })),
        trx
      );
    }

    for (const attachment of sourceAttachments) {
      await PostAttachmentModel.create(
        {
          post_id: post.id,
          url: attachment.url,
          filename: attachment.filename,
          mime_type: attachment.mime_type,
          file_size: attachment.file_size,
          order_index: attachment.order_index,
        },
        trx
      );
    }

    return post;
  });

  logger.info(`[Admin Websites] ✓ Duplicated post ID: ${newPost.id}`);

  await invalidatePostsCache(projectId);

  const enriched = await enrichPost(newPost);
  return { post: enriched };
}

// ---------------------------------------------------------------------------
// Get post
// ---------------------------------------------------------------------------

export async function getPost(
  projectId: string,
  postId: string
): Promise<any> {
  const post = await PostModel.findByIdAndProject(postId, projectId);
  if (!post) return null;
  return enrichPost(post);
}

// ---------------------------------------------------------------------------
// Update post
// ---------------------------------------------------------------------------

export async function updatePost(
  projectId: string,
  postId: string,
  updates: Record<string, any>
): Promise<{
  post: any;
  error?: { status: number; code: string; message: string };
}> {
  const existing = await PostModel.findByIdAndProject(postId, projectId);
  if (!existing) {
    return {
      post: null,
      error: { status: 404, code: "NOT_FOUND", message: "Post not found" },
    };
  }

  const { category_ids, tag_ids, ...fieldUpdates } = updates;

  delete fieldUpdates.id;
  delete fieldUpdates.project_id;
  delete fieldUpdates.post_type_id;
  delete fieldUpdates.created_at;

  // Boundary check for gallery fields before serialization.
  if (fieldUpdates.custom_fields !== undefined) {
    const postType = await PostTypeModel.findRawById(existing.post_type_id);
    if (postType) {
      const ptSchema =
        typeof postType.schema === "string"
          ? JSON.parse(postType.schema || "[]")
          : postType.schema;
      const galleryCheck = validateGalleryFields(ptSchema, fieldUpdates.custom_fields);
      if (!galleryCheck.valid) {
        return {
          post: null,
          error: { status: 400, code: "INVALID_CUSTOM_FIELD", message: galleryCheck.message },
        };
      }
    }
  }

  // Serialize JSONB fields if provided
  if (fieldUpdates.custom_fields !== undefined) {
    fieldUpdates.custom_fields = JSON.stringify(fieldUpdates.custom_fields);
  }
  if (fieldUpdates.seo_data !== undefined) {
    fieldUpdates.seo_data = JSON.stringify(fieldUpdates.seo_data);
  }

  // Re-generate slug if title changed
  if (fieldUpdates.title && fieldUpdates.title !== existing.title) {
    fieldUpdates.slug = slugify(fieldUpdates.title);
    const conflict = await PostModel.findSlugConflict(
      projectId,
      existing.post_type_id,
      fieldUpdates.slug,
      postId
    );
    if (conflict) {
      fieldUpdates.slug = `${fieldUpdates.slug}-${Date.now().toString(36).slice(-4)}`;
    }
  }

  // Handle publish timestamp
  if (fieldUpdates.status === "published" && existing.status !== "published") {
    fieldUpdates.published_at = new Date();
  }

  if (Object.keys(fieldUpdates).length > 0) {
    await PostModel.updateFieldsByIdAndProject(postId, projectId, fieldUpdates);
  }

  // Re-assign categories if provided
  if (category_ids !== undefined) {
    await PostModel.deleteCategoryAssignmentsByPostId(postId);
    if (category_ids.length > 0) {
      await PostModel.insertCategoryAssignments(
        category_ids.map((cid: string) => ({ post_id: postId, category_id: cid }))
      );
    }
  }

  // Re-assign tags if provided
  if (tag_ids !== undefined) {
    await PostModel.deleteTagAssignmentsByPostId(postId);
    if (tag_ids.length > 0) {
      await PostModel.insertTagAssignments(
        tag_ids.map((tid: string) => ({ post_id: postId, tag_id: tid }))
      );
    }
  }

  logger.info(`[Admin Websites] ✓ Updated post ID: ${postId}`);

  await invalidatePostsCache(projectId);

  const updated = await PostModel.findRawById(postId);
  return { post: await enrichPost(updated) };
}

// ---------------------------------------------------------------------------
// Delete post
// ---------------------------------------------------------------------------

export async function deletePost(
  projectId: string,
  postId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await PostModel.findByIdAndProject(postId, projectId);
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Post not found" },
    };
  }

  await PostModel.deleteByIdAndProject(postId, projectId);

  logger.info(`[Admin Websites] ✓ Deleted post ID: ${postId}`);

  await invalidatePostsCache(projectId);

  return {};
}
