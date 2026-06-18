/**
 * Websites API - Admin portal for website-builder data
 *
 * This module is a thin re-export barrel. The implementation is split into
 * focused submodules under `./websites/`. Every name previously exported here
 * remains importable from `"...api/websites"` via the re-exports below.
 */

// Re-export every public type from _shared, but NOT the internal `API_BASE`
// const — it was never part of this module's public surface.
export type {
  ProjectIdentityBusiness,
  ProjectIdentityBrand,
  ProjectIdentity,
  WarmupStatus,
  WebsiteProject,
  ChatHistoryMessage,
  EditChatHistory,
  SeoData,
  WebsitePage,
  WebsiteProjectWithPages,
  WebsiteProjectListView,
  FetchWebsitesRequest,
  WebsitesResponse,
  WebsiteDetailResponse,
  StatusesResponse,
  PageGenerationStatus,
  GenerationProgress,
  GradientInput,
  ProjectIdentityListEntry,
  ProjectIdentityLocation,
} from "./websites/_shared";
export * from "./websites/core";
export * from "./websites/pipeline";
export * from "./websites/generation";
export * from "./websites/page-editor";
export * from "./websites/domains";
export * from "./websites/recipients";
export * from "./websites/seo";
export * from "./websites/ai-command";
export * from "./websites/redirects";
export * from "./websites/identity";
