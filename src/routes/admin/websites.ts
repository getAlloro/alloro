/**
 * Admin Websites API Routes
 *
 * Portal to manage website-builder data from the admin panel.
 * Reads/writes to the website_builder schema tables.
 *
 * 44 endpoints delegating to AdminWebsitesController.
 */

import express from "express";
import multer from "multer";
import * as controller from "../../controllers/admin-websites/AdminWebsitesController";
import * as backupController from "../../controllers/admin-websites/BackupController";
import * as formsController from "../../controllers/admin-websites/WebsiteFormsController";
import * as integrationsController from "../../controllers/admin-websites/WebsiteIntegrationsController";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware } from "../../middleware/rbac";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import importsRouter from "./imports";

const router = express.Router();

// Multer for artifact page zip uploads (memory storage, 200 MB limit)
const artifactUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

// =====================================================================
// PROJECTS (non-parameterized routes first)
// =====================================================================

// GET  / — List all projects with pagination
router.get("/", controller.listProjects);

// POST / — Create a new website project
router.post("/", controller.createProject);

// GET  /statuses — Get unique statuses
router.get("/statuses", controller.getStatuses);

// POST /start-pipeline — Trigger N8N webhook
router.post("/start-pipeline", controller.startPipeline);

// =====================================================================
// PAGE GENERATION STATUS (non-parameterized by project — must be before /:id)
// =====================================================================

// PATCH /pages/:pageId/generation-status — N8N callback to update page status
router.patch("/pages/:pageId/generation-status", controller.updatePageGenerationStatus);

// =====================================================================
// TEMPLATES
// =====================================================================

// GET  /templates — List all templates
router.get("/templates", controller.listTemplates);

// POST /templates — Create a template
router.post("/templates", controller.createTemplate);

// =====================================================================
// POST TAXONOMY (non-parameterized by template — before template sub-paths)
// =====================================================================

// GET  /post-types/:postTypeId/categories — List categories
router.get("/post-types/:postTypeId/categories", controller.listCategories);

// POST /post-types/:postTypeId/categories — Create category
router.post("/post-types/:postTypeId/categories", controller.createCategory);

// PATCH /post-types/:postTypeId/categories/:categoryId — Update category
router.patch("/post-types/:postTypeId/categories/:categoryId", controller.updateCategory);

// DELETE /post-types/:postTypeId/categories/:categoryId — Delete category
router.delete("/post-types/:postTypeId/categories/:categoryId", controller.deleteCategory);

// GET  /post-types/:postTypeId/tags — List tags
router.get("/post-types/:postTypeId/tags", controller.listTags);

// POST /post-types/:postTypeId/tags — Create tag
router.post("/post-types/:postTypeId/tags", controller.createTag);

// PATCH /post-types/:postTypeId/tags/:tagId — Update tag
router.patch("/post-types/:postTypeId/tags/:tagId", controller.updateTag);

// DELETE /post-types/:postTypeId/tags/:tagId — Delete tag
router.delete("/post-types/:postTypeId/tags/:tagId", controller.deleteTag);

// =====================================================================
// TEMPLATE PAGES (must come before /templates/:templateId)
// =====================================================================

// GET  /templates/:templateId/pages — List template pages
router.get("/templates/:templateId/pages", controller.listTemplatePages);

// POST /templates/:templateId/pages — Create template page
router.post("/templates/:templateId/pages", controller.createTemplatePage);

// GET  /templates/:templateId/pages/:pageId — Get template page
router.get("/templates/:templateId/pages/:pageId", controller.getTemplatePage);

// PATCH /templates/:templateId/pages/:pageId — Update template page
router.patch("/templates/:templateId/pages/:pageId", controller.updateTemplatePage);

// DELETE /templates/:templateId/pages/:pageId — Delete template page
router.delete("/templates/:templateId/pages/:pageId", controller.deleteTemplatePage);

// GET   /templates/:templateId/pages/:pageId/slots — Template page dynamic_slots (Plan B)
router.get("/templates/:templateId/pages/:pageId/slots", controller.getTemplatePageSlots);

// PATCH /templates/:templateId/pages/:pageId/slots — Update dynamic_slots (admin tool)
router.patch("/templates/:templateId/pages/:pageId/slots", controller.updateTemplatePageSlots);

// =====================================================================
// TEMPLATE POST TYPES (must come before /templates/:templateId)
// =====================================================================

// GET  /templates/:templateId/post-types — List post types
router.get("/templates/:templateId/post-types", controller.listPostTypes);

// POST /templates/:templateId/post-types — Create post type
router.post("/templates/:templateId/post-types", controller.createPostType);

// GET  /templates/:templateId/post-types/:postTypeId — Get post type
router.get("/templates/:templateId/post-types/:postTypeId", controller.getPostType);

// PATCH /templates/:templateId/post-types/:postTypeId — Update post type
router.patch("/templates/:templateId/post-types/:postTypeId", controller.updatePostType);

// DELETE /templates/:templateId/post-types/:postTypeId — Delete post type
router.delete("/templates/:templateId/post-types/:postTypeId", controller.deletePostType);

// =====================================================================
// TEMPLATE POST BLOCKS (must come before /templates/:templateId)
// =====================================================================

// GET  /templates/:templateId/post-blocks — List post blocks
router.get("/templates/:templateId/post-blocks", controller.listPostBlocks);

// POST /templates/:templateId/post-blocks — Create post block
router.post("/templates/:templateId/post-blocks", controller.createPostBlock);

// GET  /templates/:templateId/post-blocks/:postBlockId — Get post block
router.get("/templates/:templateId/post-blocks/:postBlockId", controller.getPostBlock);

// PATCH /templates/:templateId/post-blocks/:postBlockId — Update post block
router.patch("/templates/:templateId/post-blocks/:postBlockId", controller.updatePostBlock);

// DELETE /templates/:templateId/post-blocks/:postBlockId — Delete post block
router.delete("/templates/:templateId/post-blocks/:postBlockId", controller.deletePostBlock);

// =====================================================================
// TEMPLATE REVIEW BLOCKS (must come before /templates/:templateId)
// =====================================================================

// GET  /templates/:templateId/review-blocks — List review blocks
router.get("/templates/:templateId/review-blocks", controller.listReviewBlocks);

// POST /templates/:templateId/review-blocks — Create review block
router.post("/templates/:templateId/review-blocks", controller.createReviewBlock);

// GET  /templates/:templateId/review-blocks/:reviewBlockId — Get review block
router.get("/templates/:templateId/review-blocks/:reviewBlockId", controller.getReviewBlock);

// PATCH /templates/:templateId/review-blocks/:reviewBlockId — Update review block
router.patch("/templates/:templateId/review-blocks/:reviewBlockId", controller.updateReviewBlock);

// DELETE /templates/:templateId/review-blocks/:reviewBlockId — Delete review block
router.delete("/templates/:templateId/review-blocks/:reviewBlockId", controller.deleteReviewBlock);

// =====================================================================
// TEMPLATE MENU TEMPLATES (must come before /templates/:templateId)
// =====================================================================

// GET  /templates/:templateId/menu-templates — List menu templates
router.get("/templates/:templateId/menu-templates", controller.listMenuTemplates);

// POST /templates/:templateId/menu-templates — Create menu template
router.post("/templates/:templateId/menu-templates", controller.createMenuTemplate);

// GET  /templates/:templateId/menu-templates/:menuTemplateId — Get menu template
router.get("/templates/:templateId/menu-templates/:menuTemplateId", controller.getMenuTemplate);

// PATCH /templates/:templateId/menu-templates/:menuTemplateId — Update menu template
router.patch("/templates/:templateId/menu-templates/:menuTemplateId", controller.updateMenuTemplate);

// DELETE /templates/:templateId/menu-templates/:menuTemplateId — Delete menu template
router.delete("/templates/:templateId/menu-templates/:menuTemplateId", controller.deleteMenuTemplate);

// =====================================================================
// TEMPLATE HFCM (must come before /templates/:templateId)
// =====================================================================

// PATCH /templates/:templateId/code-snippets/reorder — Reorder (before :id)
router.patch("/templates/:templateId/code-snippets/reorder", controller.reorderTemplateSnippets);

// GET  /templates/:templateId/code-snippets — List template snippets
router.get("/templates/:templateId/code-snippets", controller.listTemplateSnippets);

// POST /templates/:templateId/code-snippets — Create template snippet
router.post("/templates/:templateId/code-snippets", controller.createTemplateSnippet);

// PATCH /templates/:templateId/code-snippets/:id/toggle — Toggle (before :id patch)
router.patch("/templates/:templateId/code-snippets/:id/toggle", controller.toggleTemplateSnippet);

// PATCH /templates/:templateId/code-snippets/:id — Update template snippet
router.patch("/templates/:templateId/code-snippets/:id", controller.updateTemplateSnippet);

// DELETE /templates/:templateId/code-snippets/:id — Delete template snippet
router.delete("/templates/:templateId/code-snippets/:id", controller.deleteTemplateSnippet);

// =====================================================================
// TEMPLATES (parameterized — after sub-paths)
// =====================================================================

// GET  /templates/:templateId — Get template with pages
router.get("/templates/:templateId", controller.getTemplate);

// PATCH /templates/:templateId — Update template
router.patch("/templates/:templateId", controller.updateTemplate);

// DELETE /templates/:templateId — Delete template
router.delete("/templates/:templateId", controller.deleteTemplate);

// POST /templates/:templateId/activate — Activate template
router.post("/templates/:templateId/activate", controller.activateTemplate);

// =====================================================================
// PAGE EDITOR — SYSTEM PROMPT
// =====================================================================

// GET /editor/system-prompt — Get page editor system prompt
router.get("/editor/system-prompt", controller.getEditorSystemPrompt);

// =====================================================================
// WEBSITE SCRAPE
// =====================================================================

// POST /scrape — Scrape website for content
router.post("/scrape", controller.scrapeWebsite);

// =====================================================================
// IMPORTS (sub-router — must come before parameterized /:id routes)
// =====================================================================

router.use("/imports", importsRouter);

// =====================================================================
// BACKUPS (before other /:id parameterized routes)
// =====================================================================

// POST /:id/backups — Create a new backup
router.post("/:id/backups", backupController.createBackup);

// GET  /:id/backups — List backups for a project
router.get("/:id/backups", backupController.listBackups);

// GET  /:id/backups/:jobId/status — Poll backup/restore status
router.get("/:id/backups/:jobId/status", backupController.getBackupStatus);

// GET  /:id/backups/:jobId/download — Get pre-signed download URL
router.get("/:id/backups/:jobId/download", backupController.downloadBackup);

// POST /:id/backups/:jobId/restore — Restore from a backup
router.post("/:id/backups/:jobId/restore", backupController.restoreBackup);

// DELETE /:id/backups/:jobId — Delete a backup
router.delete("/:id/backups/:jobId", backupController.deleteBackup);

// =====================================================================
// PROJECTS (parameterized routes — must come after literal paths)
// =====================================================================

// GET  /:id/status — Lightweight status polling
router.get("/:id/status", controller.getProjectStatus);

// GET  /:id/pages/generation-status — Per-page generation status (before /:id/pages/:pageId)
router.get("/:id/pages/generation-status", controller.getPagesGenerationStatus);

// GET  /:id/pages/:pageId/progressive-state — Template scaffolding + generated sections so far
router.get("/:id/pages/:pageId/progressive-state", controller.getPageProgressiveState);

// POST /:id/create-all-from-template — Bulk create all pages from template
router.post("/:id/create-all-from-template", controller.createAllFromTemplate);

// POST /:id/cancel-generation — Cancel all in-progress page generation
router.post("/:id/cancel-generation", controller.cancelGeneration);

// =====================================================================
// PROJECT IDENTITY
// =====================================================================

// POST /:id/test-url — Probe a URL for block/CAPTCHA signals
router.post("/:id/test-url", controller.testUrl);

// POST /:id/identity/warmup — Enqueue identity warmup job
router.post("/:id/identity/warmup", controller.startIdentityWarmup);

// GET  /:id/identity — Full project identity JSON
router.get("/:id/identity", controller.getIdentity);

// GET  /:id/identity/status — Lightweight warmup status polling
router.get("/:id/identity/status", controller.getIdentityStatus);

// PUT  /:id/identity — Replace identity with admin-edited JSON
router.put("/:id/identity", controller.updateIdentity);

// POST /:id/identity/resync-list — Re-run doctor/service extraction against cached pages
router.post("/:id/identity/resync-list", controller.resyncIdentityList);

// GET /:id/slot-prefill — Pre-filled slot values from project_identity
router.get("/:id/slot-prefill", controller.getSlotPrefill);

// POST /:id/slot-generate — LLM-fill text slots using identity context
router.post("/:id/slot-generate", controller.generateSlotValues);

// POST /:id/generate-layouts — Enqueue layouts generation
router.post("/:id/generate-layouts", controller.startLayoutGeneration);

// GET /:id/layouts-status — Layouts generation status polling
router.get("/:id/layouts-status", controller.getLayoutsStatus);

// POST /:id/pages/:pageId/regenerate-component — Regenerate a single section
router.post(
  "/:id/pages/:pageId/regenerate-component",
  controller.regeneratePageComponent,
);

// PATCH /:id/link-organization — Link/unlink org
router.patch("/:id/link-organization", controller.linkOrganization);

// POST /:id/connect-domain — Connect a custom domain
router.post("/:id/connect-domain", controller.connectDomainHandler);

// POST /:id/verify-domain — Verify DNS for custom domain
router.post("/:id/verify-domain", controller.verifyDomainHandler);

// DELETE /:id/disconnect-domain — Disconnect custom domain
router.delete("/:id/disconnect-domain", controller.disconnectDomainHandler);

// =====================================================================
// RECIPIENTS
// =====================================================================

// GET  /:id/recipients — Get configured recipients + org users
router.get("/:id/recipients", controller.getRecipients);

// PUT  /:id/recipients — Update recipients list
router.put("/:id/recipients", controller.updateRecipients);

// GET  /:id/forms/catalog — Detected forms + recipient rule state
router.get("/:id/forms/catalog", formsController.listFormCatalog);

// PUT  /:id/forms/recipients — Upsert per-form recipient rule
router.put("/:id/forms/recipients", formsController.updateFormRecipientRule);

// PUT  /:id/forms/preferences — Upsert visual-only form labels/order
router.put("/:id/forms/preferences", formsController.updateFormPreferences);

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

// GET  /:id/form-submissions — List submissions with pagination
router.get("/:id/form-submissions", controller.listFormSubmissions);

// PATCH /:id/form-submissions/mark-all-read — Mark form submissions read
router.patch("/:id/form-submissions/mark-all-read", controller.markAllFormSubmissionsRead);

// Bulk routes must be registered before parameterized :submissionId routes
// POST /:id/form-submissions/bulk/send-email — Bulk send flagged submissions
router.post("/:id/form-submissions/bulk/send-email", controller.bulkSendFormSubmissionsEmail);

// DELETE /:id/form-submissions/bulk — Bulk delete submissions
router.delete("/:id/form-submissions/bulk", controller.bulkDeleteFormSubmissions);

// PATCH /:id/form-submissions/bulk/read — Bulk toggle read status
router.patch("/:id/form-submissions/bulk/read", controller.bulkToggleFormSubmissionsRead);

// GET  /:id/form-submissions/:submissionId — Get single submission
router.get("/:id/form-submissions/:submissionId", controller.getFormSubmission);

// PATCH /:id/form-submissions/:submissionId/read — Toggle read status
router.patch("/:id/form-submissions/:submissionId/read", controller.toggleFormSubmissionRead);

// POST /:id/form-submissions/:submissionId/send-email — Manually send a submission
router.post("/:id/form-submissions/:submissionId/send-email", controller.sendFormSubmissionEmail);

// DELETE /:id/form-submissions/:submissionId — Delete a submission
router.delete("/:id/form-submissions/:submissionId", controller.deleteFormSubmission);

// =====================================================================
// WEBSITE INTEGRATIONS (CRM connectors — non-parameterized first)
// =====================================================================

// GET    /:id/integrations — List integrations for a project
router.get("/:id/integrations", integrationsController.listIntegrations);

// POST   /:id/integrations — Create + validate a new integration
router.post("/:id/integrations", integrationsController.createIntegration);

const adminGscAuth = [authenticateToken, rbacMiddleware, superAdminMiddleware];

// Rybbit-specific routes (must be before /:integrationId params)
router.get(
  "/:id/integrations/rybbit/status",
  ...adminGscAuth,
  integrationsController.getRybbitStatus,
);
router.post(
  "/:id/integrations/rybbit",
  ...adminGscAuth,
  integrationsController.createRybbitIntegration,
);
router.post(
  "/:id/integrations/rybbit/legacy-snippets/disable",
  ...adminGscAuth,
  integrationsController.disableRybbitLegacySnippets,
);
router.get(
  "/:id/integrations/:integrationId/rybbit/performance",
  ...adminGscAuth,
  integrationsController.getRybbitPerformance,
);

// GSC-specific routes (must be before /:integrationId params)
router.get(
  "/:id/integrations/gsc/connections",
  ...adminGscAuth,
  integrationsController.listGscConnections,
);
router.get(
  "/:id/integrations/gsc/sites",
  ...adminGscAuth,
  integrationsController.listGscSites,
);
router.post(
  "/:id/integrations/gsc",
  ...adminGscAuth,
  integrationsController.createGscIntegration,
);
router.post(
  "/:id/integrations/:integrationId/gsc/backfill",
  ...adminGscAuth,
  integrationsController.backfillGscHistory,
);
router.get(
  "/:id/integrations/:integrationId/gsc/performance",
  ...adminGscAuth,
  integrationsController.getGscPerformance,
);

// GET    /:id/detected-forms — List website forms derived from submissions
router.get("/:id/detected-forms", integrationsController.listDetectedForms);

// GET    /:id/detected-forms/:formName/field-shape — Field shape sample for a form
router.get(
  "/:id/detected-forms/:formName/field-shape",
  integrationsController.getDetectedFormFieldShape,
);

// GET    /:id/integrations/:integrationId — Get integration detail (SAFE)
router.get("/:id/integrations/:integrationId", integrationsController.getIntegration);

// PUT    /:id/integrations/:integrationId — Update label / credentials
router.put("/:id/integrations/:integrationId", integrationsController.updateIntegration);

// DELETE /:id/integrations/:integrationId — Hard delete (sync logs survive via SET NULL)
router.delete("/:id/integrations/:integrationId", integrationsController.deleteIntegration);

// POST   /:id/integrations/:integrationId/revoke — Soft revoke (status='revoked')
router.post(
  "/:id/integrations/:integrationId/revoke",
  integrationsController.revokeIntegration,
);

// GET    /:id/integrations/:integrationId/vendor-forms — Live vendor forms list
router.get(
  "/:id/integrations/:integrationId/vendor-forms",
  integrationsController.listVendorForms,
);

// POST   /:id/integrations/:integrationId/validate-mappings — Re-validate token + form existence
router.post(
  "/:id/integrations/:integrationId/validate-mappings",
  integrationsController.validateMappings,
);

// POST   /:id/integrations/:integrationId/infer-mapping — Auto-default field mapping suggestion
router.post(
  "/:id/integrations/:integrationId/infer-mapping",
  integrationsController.inferMapping,
);

// GET    /:id/integrations/:integrationId/sync-logs — Recent push attempts (paginated)
router.get(
  "/:id/integrations/:integrationId/sync-logs",
  integrationsController.listSyncLogs,
);

// GET    /:id/integrations/:integrationId/mappings — List mappings
router.get(
  "/:id/integrations/:integrationId/mappings",
  integrationsController.listMappings,
);

// POST   /:id/integrations/:integrationId/mappings — Create a mapping
router.post(
  "/:id/integrations/:integrationId/mappings",
  integrationsController.createMapping,
);

// PUT    /:id/integrations/:integrationId/mappings/:mappingId — Update a mapping
router.put(
  "/:id/integrations/:integrationId/mappings/:mappingId",
  integrationsController.updateMapping,
);

// DELETE /:id/integrations/:integrationId/mappings/:mappingId — Delete a mapping
router.delete(
  "/:id/integrations/:integrationId/mappings/:mappingId",
  integrationsController.deleteMapping,
);

// POST /:id/integrations/:integrationId/validate — Validate harvest connection
router.post(
  "/:id/integrations/:integrationId/validate",
  integrationsController.validateHarvestIntegration,
);

// GET /:id/integrations/:integrationId/harvest-logs — Paginated harvest activity
router.get(
  "/:id/integrations/:integrationId/harvest-logs",
  integrationsController.getHarvestLogs,
);

// POST /:id/integrations/:integrationId/rerun — Re-enqueue a failed harvest
router.post(
  "/:id/integrations/:integrationId/rerun",
  integrationsController.rerunHarvest,
);

// =====================================================================
// REVIEW SYNC (project-scoped)
// =====================================================================

// GET  /:id/reviews/stats — Get review stats for project's org
router.get("/:id/reviews/stats", controller.getReviewStats);

// GET  /:id/reviews — List reviews with search/filter
router.get("/:id/reviews", controller.listReviews);

// POST /:id/reviews/sync — Trigger manual review sync for project's org
router.post("/:id/reviews/sync", controller.triggerReviewSync);

// POST /:id/reviews/fetch — Trigger Apify review fetch using place IDs
router.post("/:id/reviews/fetch", controller.triggerApifyReviewFetch);

// GET  /:id/reviews/jobs/:jobId/status — Poll review job status
router.get("/:id/reviews/jobs/:jobId/status", controller.getReviewJobStatus);

// PATCH /:id/reviews/:reviewId — Toggle review hidden
router.patch("/:id/reviews/:reviewId", controller.toggleReviewHidden);

// DELETE /:id/reviews/:reviewId — Delete a review
router.delete("/:id/reviews/:reviewId", controller.deleteReview);

// =====================================================================
// PROJECT POSTS
// =====================================================================

// GET  /:id/posts — List posts for a project
router.get("/:id/posts", controller.listPosts);

// POST /:id/posts/ai-generate — AI generate post content (before :postId)
router.post("/:id/posts/ai-generate", controller.aiGeneratePost);

// POST /:id/posts — Create a post
router.post("/:id/posts", controller.createPost);

// GET  /:id/posts/:postId — Get a post
router.get("/:id/posts/:postId", controller.getPost);

// PATCH /:id/posts/:postId — Update a post
router.patch("/:id/posts/:postId", controller.updatePost);

// DELETE /:id/posts/:postId — Delete a post
router.delete("/:id/posts/:postId", controller.deletePost);

// =====================================================================
// PROJECT MENUS
// =====================================================================

// PATCH /:id/menus/:menuId/items/reorder — Reorder (before :itemId)
router.patch("/:id/menus/:menuId/items/reorder", controller.reorderMenuItems);

// GET  /:id/menus — List menus for a project
router.get("/:id/menus", controller.listMenus);

// POST /:id/menus — Create a menu
router.post("/:id/menus", controller.createMenu);

// GET  /:id/menus/:menuId — Get a menu with items
router.get("/:id/menus/:menuId", controller.getMenu);

// PATCH /:id/menus/:menuId — Update a menu
router.patch("/:id/menus/:menuId", controller.updateMenu);

// DELETE /:id/menus/:menuId — Delete a menu
router.delete("/:id/menus/:menuId", controller.deleteMenu);

// POST /:id/menus/:menuId/items — Create a menu item
router.post("/:id/menus/:menuId/items", controller.createMenuItem);

// PATCH /:id/menus/:menuId/items/:itemId — Update a menu item
router.patch("/:id/menus/:menuId/items/:itemId", controller.updateMenuItem);

// DELETE /:id/menus/:menuId/items/:itemId — Delete a menu item
router.delete("/:id/menus/:menuId/items/:itemId", controller.deleteMenuItem);

// =====================================================================
// SEO
// =====================================================================

// POST /:id/seo/bulk-generate — Start bulk SEO generation background job
router.post("/:id/seo/bulk-generate", controller.startBulkSeoGenerate);

// GET  /:id/seo/bulk-generate/active — Check for active bulk SEO job (before :jobId)
router.get("/:id/seo/bulk-generate/active", controller.getActiveBulkSeoJob);

// GET  /:id/seo/bulk-generate/:jobId/status — Poll bulk SEO generation progress
router.get("/:id/seo/bulk-generate/:jobId/status", controller.getBulkSeoStatus);

// GET  /:id/seo/all-meta — All page/post SEO titles/descriptions for uniqueness
router.get("/:id/seo/all-meta", controller.getAllSeoMeta);

// PATCH /:id/pages/:pageId/seo — Update page SEO data
router.patch("/:id/pages/:pageId/seo", controller.updatePageSeo);

// POST /:id/pages/:pageId/seo/generate — AI generate SEO for page section
router.post("/:id/pages/:pageId/seo/generate", controller.generatePageSeo);

// PATCH /:id/posts/:postId/seo — Update post SEO data
router.patch("/:id/posts/:postId/seo", controller.updatePostSeo);

// POST /:id/posts/:postId/seo/generate — AI generate SEO for post section
router.post("/:id/posts/:postId/seo/generate", controller.generatePostSeo);

// POST /:id/pages/:pageId/seo/generate-all — AI generate ALL SEO sections at once
router.post("/:id/pages/:pageId/seo/generate-all", controller.generateAllPageSeo);

// POST /:id/posts/:postId/seo/generate-all — AI generate ALL SEO sections at once
router.post("/:id/posts/:postId/seo/generate-all", controller.generateAllPostSeo);

// POST /:id/pages/:pageId/seo/analyze — AI analyze existing SEO for page section
router.post("/:id/pages/:pageId/seo/analyze", controller.analyzePageSeo);

// POST /:id/posts/:postId/seo/analyze — AI analyze existing SEO for post section
router.post("/:id/posts/:postId/seo/analyze", controller.analyzePostSeo);

// =====================================================================
// PROJECT PAGES
// =====================================================================

// PATCH /:id/pages/display-name — Update page display name (before :pageId)
router.patch("/:id/pages/display-name", controller.updatePageDisplayName);

// DELETE /:id/pages/by-path — Delete all versions at path (before :pageId)
router.delete("/:id/pages/by-path", controller.deletePagesByPath);

// GET  /:id/pages — List project pages
router.get("/:id/pages", controller.listPages);

// POST /:id/pages — Create page version
router.post("/:id/pages", controller.createPage);

// POST /:id/pages/artifact — Upload artifact page (React app zip) — before :pageId
router.post("/:id/pages/artifact", artifactUpload.single("file"), controller.uploadArtifactPage);

// PUT /:id/pages/:pageId/artifact — Replace artifact page build
router.put("/:id/pages/:pageId/artifact", artifactUpload.single("file"), controller.replaceArtifactBuild);

// POST /:id/pages/:pageId/publish — Publish a page
router.post("/:id/pages/:pageId/publish", controller.publishPage);

// POST /:id/pages/:pageId/create-draft — Clone published to draft
router.post("/:id/pages/:pageId/create-draft", controller.createDraft);

// POST /:id/pages/:pageId/edit — AI edit page component
router.post("/:id/pages/:pageId/edit", controller.editPageComponent);

// GET  /:id/pages/:pageId — Get single page
router.get("/:id/pages/:pageId", controller.getPage);

// PATCH /:id/pages/:pageId — Update draft page
router.patch("/:id/pages/:pageId", controller.updatePage);

// DELETE /:id/pages/:pageId — Delete page version
router.delete("/:id/pages/:pageId", controller.deletePage);

// =====================================================================
// LAYOUT EDITOR — AI EDIT
// =====================================================================

// POST /:id/edit-layout — AI edit layout component
router.post("/:id/edit-layout", controller.editLayoutComponent);

// =====================================================================
// PROJECT HFCM
// =====================================================================

// PATCH /:projectId/code-snippets/reorder — Reorder (before :id)
router.patch("/:projectId/code-snippets/reorder", controller.reorderProjectSnippets);

// GET  /:projectId/code-snippets — List project snippets
router.get("/:projectId/code-snippets", controller.listProjectSnippets);

// POST /:projectId/code-snippets — Create project snippet
router.post("/:projectId/code-snippets", controller.createProjectSnippet);

// PATCH /:projectId/code-snippets/:id/toggle — Toggle (before :id patch)
router.patch("/:projectId/code-snippets/:id/toggle", controller.toggleProjectSnippet);

// PATCH /:projectId/code-snippets/:id — Update project snippet
router.patch("/:projectId/code-snippets/:id", controller.updateProjectSnippet);

// DELETE /:projectId/code-snippets/:id — Delete project snippet
router.delete("/:projectId/code-snippets/:id", controller.deleteProjectSnippet);

// =====================================================================
// REDIRECTS
// =====================================================================

// POST /:id/redirects/bulk — Bulk create redirects (before :redirectId)
router.post("/:id/redirects/bulk", controller.bulkCreateRedirects);

// GET  /:id/redirects — List redirects
router.get("/:id/redirects", controller.listRedirects);

// POST /:id/redirects — Create a redirect
router.post("/:id/redirects", controller.createRedirect);

// PATCH /:id/redirects/:redirectId — Update a redirect
router.patch("/:id/redirects/:redirectId", controller.updateRedirect);

// DELETE /:id/redirects/:redirectId — Delete a redirect
router.delete("/:id/redirects/:redirectId", controller.deleteRedirect);

// =====================================================================
// AI COMMAND
// =====================================================================

// GET  /:id/ai-command — List all batches for a project (before :batchId)
router.get("/:id/ai-command", controller.listAiCommandBatches);

// POST /:id/ai-command — Create a new AI command batch
router.post("/:id/ai-command", controller.createAiCommandBatch);

// PATCH /:id/ai-command/:batchId — Rename a batch
router.patch("/:id/ai-command/:batchId", controller.renameAiCommandBatch);

// DELETE /:id/ai-command/:batchId — Delete a batch
router.delete("/:id/ai-command/:batchId", controller.deleteAiCommandBatch);

// GET  /:id/ai-command/:batchId — Get batch status and stats
router.get("/:id/ai-command/:batchId", controller.getAiCommandBatch);

// PATCH /:id/ai-command/:batchId/recommendations/bulk — Bulk approve/reject (before :recId)
router.patch("/:id/ai-command/:batchId/recommendations/bulk", controller.bulkUpdateAiCommandRecommendations);

// GET  /:id/ai-command/:batchId/recommendations — List recommendations
router.get("/:id/ai-command/:batchId/recommendations", controller.getAiCommandRecommendations);

// PATCH /:id/ai-command/:batchId/recommendations/:recId — Update single recommendation
router.patch("/:id/ai-command/:batchId/recommendations/:recId", controller.updateAiCommandRecommendation);

// POST /:id/ai-command/:batchId/execute — Execute approved recommendations
router.post("/:id/ai-command/:batchId/execute", controller.executeAiCommandBatch);

// =====================================================================
// COSTS — per-project AI cost rollup
// =====================================================================

// GET /:projectId/costs — Cost events + totals for the Costs tab
router.get("/:projectId/costs", controller.getProjectCosts);

// =====================================================================
// PROJECTS (parameterized — last to avoid matching other routes)
// =====================================================================

// GET  /:id — Get single project with pages
router.get("/:id", controller.getProject);

// PATCH /:id — Update project
router.patch("/:id", controller.updateProject);

// DELETE /:id — Delete project (cascade pages)
router.delete("/:id", controller.deleteProject);

// =====================================================================
// LOCATIONS — F3 (multi-location management for IdentityModal Locations tab)
// =====================================================================
//
// Appended for plan
// `plans/04182026-no-ticket-identity-enrichments-and-post-imports/spec.md`
// task F3. Express's `/:id` matcher above does NOT swallow `/:id/locations`
// (path-to-regexp anchors `/:id` to end-of-path), so registration order is
// safe even after the `/:id` catch-all.

// POST   /:id/locations               — Add + scrape a new place_id
router.post("/:id/locations", controller.addProjectLocation);

// PATCH  /:id/locations/primary       — Switch primary location (rewrites identity.business)
router.patch("/:id/locations/primary", controller.setPrimaryLocation);

// POST   /:id/locations/:place_id/resync — Re-scrape a single location
router.post("/:id/locations/:place_id/resync", controller.resyncProjectLocation);

// DELETE /:id/locations/:place_id     — Remove a non-primary location
router.delete("/:id/locations/:place_id", controller.removeProjectLocation);

// =====================================================================
// POST IMPORT FROM IDENTITY — T8 + F4
// =====================================================================
//
// Appended for plan
// `plans/04182026-no-ticket-identity-enrichments-and-post-imports/spec.md`
// tasks T8 + F4. The `/:projectId/posts/import` paths sit deeper than the
// catch-all `/:id` GET above, so Express's path-to-regexp does not match them
// against the project-detail handler.

// POST /:projectId/posts/import            — Enqueue a BullMQ job to import
//                                            doctor / service / location entries
router.post("/:projectId/posts/import", controller.startPostImport);

// GET  /:projectId/posts/import/:jobId     — Poll job state + per-entry results
router.get("/:projectId/posts/import/:jobId", controller.getPostImportStatus);

// =====================================================================
// IDENTITY SLICE PATCH — T3
// =====================================================================
//
// Appended for plan
// `plans/04202026-no-ticket-identity-modal-cleanup-and-crud/spec.md` T3.
// Surgical per-slice edit for `project_identity`. Accepts only the allow-list
// enforced inside the handler. Path anchors after `/:id/identity/` so it does
// not collide with the catch-all `/:id` matcher above.

// PATCH /:id/identity/slice — Replace one allow-listed slice of identity
router.patch("/:id/identity/slice", controller.patchIdentitySlice);

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
