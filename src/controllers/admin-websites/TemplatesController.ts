/**
 * Admin Websites — Templates Controller
 *
 * Templates CRUD + activate, template pages, template snippets, and template
 * sub-resources: post types, post blocks, menu templates, review blocks,
 * post taxonomy (categories + tags). Implementation is split across two part
 * files (core + taxonomy) to stay under the file-size ceiling; this module is a
 * barrel re-exporting both so the route sub-router keeps a single import.
 *
 * Barrel: implementation lives in the part files below; this module re-exports
 * their handlers so the route sub-router keeps a single `import * as` surface
 * and every physical file stays under the size ceiling.
 */

export {
  activateTemplate,
  createTemplate,
  createTemplatePage,
  createTemplateSnippet,
  deleteTemplate,
  deleteTemplatePage,
  deleteTemplateSnippet,
  getTemplate,
  getTemplatePage,
  getTemplatePageSlots,
  listTemplatePages,
  listTemplateSnippets,
  listTemplates,
  reorderTemplateSnippets,
  toggleTemplateSnippet,
  updateTemplate,
  updateTemplatePage,
  updateTemplatePageSlots,
  updateTemplateSnippet,
} from "./TemplatesController.core";

export {
  createCategory,
  createMenuTemplate,
  createPostBlock,
  createPostType,
  createReviewBlock,
  createTag,
  deleteCategory,
  deleteMenuTemplate,
  deletePostBlock,
  deletePostType,
  deleteReviewBlock,
  deleteTag,
  getMenuTemplate,
  getPostBlock,
  getPostType,
  getReviewBlock,
  listCategories,
  listMenuTemplates,
  listPostBlocks,
  listPostTypes,
  listReviewBlocks,
  listTags,
  updateCategory,
  updateMenuTemplate,
  updatePostBlock,
  updatePostType,
  updateReviewBlock,
  updateTag,
} from "./TemplatesController.taxonomy";
