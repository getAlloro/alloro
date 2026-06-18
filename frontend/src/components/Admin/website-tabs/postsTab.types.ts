import type {
  fetchPosts as defaultFetchPosts,
  createPost as defaultCreatePost,
  updatePost as defaultUpdatePost,
  deletePost as defaultDeletePost,
  duplicatePost as defaultDuplicatePost,
  fetchPostTypes as defaultFetchPostTypes,
  fetchCategories as defaultFetchCategories,
  fetchTags as defaultFetchTags,
  createCategory as defaultCreateCategory,
  createTag as defaultCreateTag,
} from "../../../api/posts";
import type { updatePostSeo as defaultUpdatePostSeo } from "../../../api/websites";

export interface PostsTabProps {
  projectId: string;
  templateId: string | null;
  organizationId?: number;
  /** Remove outer border/shadow — useful when embedded edge-to-edge (e.g. user editor). */
  borderless?: boolean;
  /**
   * Which surface is rendering this tab. Defaults to "admin" (full admin
   * affordances). The client-facing surface (DFYWebsite) passes "client" to
   * hide super-admin-only controls (Import-from-Identity) and the SEO score bar.
   */
  surface?: "admin" | "client";
  // Optional API overrides for user-facing context
  fetchPostsFn?: typeof defaultFetchPosts;
  createPostFn?: typeof defaultCreatePost;
  updatePostFn?: typeof defaultUpdatePost;
  deletePostFn?: typeof defaultDeletePost;
  duplicatePostFn?: typeof defaultDuplicatePost;
  fetchPostTypesFn?: typeof defaultFetchPostTypes;
  fetchCategoriesFn?: typeof defaultFetchCategories;
  fetchTagsFn?: typeof defaultFetchTags;
  createCategoryFn?: typeof defaultCreateCategory;
  createTagFn?: typeof defaultCreateTag;
  updatePostSeoFn?: typeof defaultUpdatePostSeo;
}

export type ViewState = "list" | "editor";
