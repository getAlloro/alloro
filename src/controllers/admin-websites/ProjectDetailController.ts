/**
 * Admin Websites — Project Detail Controller
 *
 * Per-project status polling, identity (get/update/status/warmup/resync),
 * domain connect/verify/disconnect, layout generation + slot prefill,
 * page-generation status/progressive-state, create-all-from-template, and org
 * link. Implementation is split across two part files (core + identity) to stay
 * under the file-size ceiling; this module is a barrel re-exporting both so the
 * route sub-router keeps a single import.
 *
 * Barrel: implementation lives in the part files below; this module re-exports
 * their handlers so the route sub-router keeps a single `import * as` surface
 * and every physical file stays under the size ceiling.
 */

export {
  cancelGeneration,
  connectDomainHandler,
  createAllFromTemplate,
  disconnectDomainHandler,
  generateSlotValues,
  getLayoutsStatus,
  getPageProgressiveState,
  getPagesGenerationStatus,
  getProjectStatus,
  getSlotPrefill,
  linkOrganization,
  regeneratePageComponent,
  startLayoutGeneration,
  testUrl,
  verifyDomainHandler,
} from "./ProjectDetailController.core";

export {
  getIdentity,
  getIdentityStatus,
  resyncIdentityList,
  startIdentityWarmup,
  updateIdentity,
} from "./ProjectDetailController.identity";
