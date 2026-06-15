/**
 * Posts API - Admin portal for managing posts, post types, post blocks, and taxonomy
 */

import type { Section } from "./templates";
import type { SeoData } from "./websites";
import { adminFetch } from "./index";

// =====================================================================
// TYPES
// =====================================================================

export interface PostType {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  description: string | null;
  schema: Record<string, unknown>[];
  single_template: Section[];
  created_at: string;
  updated_at: string;
}

export interface PostCategory {
  id: string;
  post_type_id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PostTag {
  id: string;
  post_type_id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface PostAttachment {
  id: string;
  post_id: string;
  url: string;
  filename: string;
  mime_type: string;
  file_size: number | null;
  order_index: number;
  created_at: string;
}

export interface Post {
  id: string;
  project_id: string;
  post_type_id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  featured_image: string | null;
  /**
   * Origin marker — set by the import-from-identity pipeline (T8/F4).
   * URL for doctor/service imports, `place_id` for location imports.
   * `null` for manually-created posts.
   */
  source_url: string | null;
  custom_fields: Record<string, unknown>;
  status: "draft" | "published";
  sort_order: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  seo_data: SeoData | null;
  categories: { id: string; name: string; slug: string }[];
  tags: { id: string; name: string; slug: string }[];
  attachments: PostAttachment[];
}

export interface PostBlock {
  id: string;
  template_id: string;
  post_type_id: string;
  name: string;
  slug: string;
  description: string | null;
  sections: Section[];
  created_at: string;
  updated_at: string;
}

const TEMPLATES_BASE = "/api/admin/websites/templates";
const PROJECTS_BASE = "/api/admin/websites";
const TAXONOMY_BASE = "/api/admin/websites/post-types";

// =====================================================================
// POST TYPES (per template)
// =====================================================================

export const fetchPostTypes = async (
  templateId: string
): Promise<{ success: boolean; data: PostType[] }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/post-types`);
  if (!response.ok) throw new Error(`Failed to fetch post types: ${response.statusText}`);
  return response.json();
};

export const createPostType = async (
  templateId: string,
  data: { name: string; description?: string; schema?: Record<string, unknown>[]; single_template?: Section[] }
): Promise<{ success: boolean; data: PostType }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/post-types`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create post type");
  }
  return response.json();
};

export const updatePostType = async (
  templateId: string,
  postTypeId: string,
  data: Partial<Pick<PostType, "name" | "description" | "schema" | "single_template">>
): Promise<{ success: boolean; data: PostType }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/post-types/${postTypeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update post type");
  }
  return response.json();
};

export const deletePostType = async (
  templateId: string,
  postTypeId: string
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/post-types/${postTypeId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete post type");
  }
  return response.json();
};

// =====================================================================
// POST BLOCKS (per template)
// =====================================================================

export const fetchPostBlocks = async (
  templateId: string
): Promise<{ success: boolean; data: PostBlock[] }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/post-blocks`);
  if (!response.ok) throw new Error(`Failed to fetch post blocks: ${response.statusText}`);
  return response.json();
};

export const fetchPostBlock = async (
  templateId: string,
  postBlockId: string
): Promise<{ success: boolean; data: PostBlock }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/post-blocks/${postBlockId}`);
  if (!response.ok) throw new Error(`Failed to fetch post block: ${response.statusText}`);
  return response.json();
};

export const createPostBlock = async (
  templateId: string,
  data: { name: string; post_type_id: string; description?: string; sections?: Section[] }
): Promise<{ success: boolean; data: PostBlock }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/post-blocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create post block");
  }
  return response.json();
};

export const updatePostBlock = async (
  templateId: string,
  postBlockId: string,
  data: Partial<Pick<PostBlock, "name" | "description" | "sections" | "post_type_id">>
): Promise<{ success: boolean; data: PostBlock }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/post-blocks/${postBlockId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update post block");
  }
  return response.json();
};

export const deletePostBlock = async (
  templateId: string,
  postBlockId: string
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${TEMPLATES_BASE}/${templateId}/post-blocks/${postBlockId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete post block");
  }
  return response.json();
};

// =====================================================================
// TAXONOMY (per post type)
// =====================================================================

export const fetchCategories = async (
  postTypeId: string
): Promise<{ success: boolean; data: PostCategory[] }> => {
  const response = await adminFetch(`${TAXONOMY_BASE}/${postTypeId}/categories`);
  if (!response.ok) throw new Error(`Failed to fetch categories: ${response.statusText}`);
  return response.json();
};

export const createCategory = async (
  postTypeId: string,
  data: { name: string; description?: string; parent_id?: string }
): Promise<{ success: boolean; data: PostCategory }> => {
  const response = await adminFetch(`${TAXONOMY_BASE}/${postTypeId}/categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create category");
  }
  return response.json();
};

export const updateCategory = async (
  postTypeId: string,
  categoryId: string,
  data: Partial<Pick<PostCategory, "name" | "description" | "parent_id" | "sort_order">>
): Promise<{ success: boolean; data: PostCategory }> => {
  const response = await adminFetch(`${TAXONOMY_BASE}/${postTypeId}/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update category");
  }
  return response.json();
};

export const deleteCategory = async (
  postTypeId: string,
  categoryId: string
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${TAXONOMY_BASE}/${postTypeId}/categories/${categoryId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete category");
  }
  return response.json();
};

export const fetchTags = async (
  postTypeId: string
): Promise<{ success: boolean; data: PostTag[] }> => {
  const response = await adminFetch(`${TAXONOMY_BASE}/${postTypeId}/tags`);
  if (!response.ok) throw new Error(`Failed to fetch tags: ${response.statusText}`);
  return response.json();
};

export const createTag = async (
  postTypeId: string,
  data: { name: string }
): Promise<{ success: boolean; data: PostTag }> => {
  const response = await adminFetch(`${TAXONOMY_BASE}/${postTypeId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create tag");
  }
  return response.json();
};

export const updateTag = async (
  postTypeId: string,
  tagId: string,
  data: { name: string }
): Promise<{ success: boolean; data: PostTag }> => {
  const response = await adminFetch(`${TAXONOMY_BASE}/${postTypeId}/tags/${tagId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update tag");
  }
  return response.json();
};

export const deleteTag = async (
  postTypeId: string,
  tagId: string
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${TAXONOMY_BASE}/${postTypeId}/tags/${tagId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete tag");
  }
  return response.json();
};

// =====================================================================
// POSTS (per project)
// =====================================================================

export const fetchPosts = async (
  projectId: string,
  filters?: { post_type_id?: string; status?: string }
): Promise<{ success: boolean; data: Post[] }> => {
  const params = new URLSearchParams();
  if (filters?.post_type_id) params.set("post_type_id", filters.post_type_id);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const response = await adminFetch(`${PROJECTS_BASE}/${projectId}/posts${qs}`);
  if (!response.ok) throw new Error(`Failed to fetch posts: ${response.statusText}`);
  return response.json();
};

export const fetchPost = async (
  projectId: string,
  postId: string
): Promise<{ success: boolean; data: Post }> => {
  const response = await adminFetch(`${PROJECTS_BASE}/${projectId}/posts/${postId}`);
  if (!response.ok) throw new Error(`Failed to fetch post: ${response.statusText}`);
  return response.json();
};

export const createPost = async (
  projectId: string,
  data: {
    post_type_id: string;
    title: string;
    content?: string;
    excerpt?: string;
    featured_image?: string;
    custom_fields?: Record<string, unknown>;
    status?: string;
    category_ids?: string[];
    tag_ids?: string[];
  }
): Promise<{ success: boolean; data: Post }> => {
  const response = await adminFetch(`${PROJECTS_BASE}/${projectId}/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create post");
  }
  return response.json();
};

export const updatePost = async (
  projectId: string,
  postId: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; data: Post }> => {
  const response = await adminFetch(`${PROJECTS_BASE}/${projectId}/posts/${postId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update post");
  }
  return response.json();
};

export const deletePost = async (
  projectId: string,
  postId: string
): Promise<{ success: boolean }> => {
  const response = await adminFetch(`${PROJECTS_BASE}/${projectId}/posts/${postId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete post");
  }
  return response.json();
};

export const duplicatePost = async (
  projectId: string,
  postId: string
): Promise<{ success: boolean; data: Post }> => {
  const response = await adminFetch(`${PROJECTS_BASE}/${projectId}/posts/${postId}/duplicate`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to duplicate post");
  }
  return response.json();
};
