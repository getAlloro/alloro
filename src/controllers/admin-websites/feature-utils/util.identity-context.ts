/**
 * Identity Context Builder — public entry.
 *
 * Translates a project_identity document into a stable cached block and a
 * variable per-component payload. Pure functions: no LLM, no DB.
 *
 * The implementation is split across cohesive sibling modules; this file is the
 * stable import surface that re-exports them so consumers can keep importing
 * from `util.identity-context`:
 *   - util.identity-context-gradient       — gradient preset expansion + color math
 *   - util.identity-context-types          — ProjectIdentity / ImageManifestEntry / ComponentContext
 *   - util.identity-context-format         — shared string formatters
 *   - util.identity-context-stable         — buildStableIdentityContext
 *   - util.identity-context-slot-stripper  — stripSkippedSlotGroups
 *   - util.identity-context-component      — buildComponentContext / resolveImageUrl
 */

export {
  type GradientPresetId,
  buildGradientStopsCss,
} from "./util.identity-context-gradient";

export {
  type ProjectIdentity,
  type ImageManifestEntry,
  type ComponentContext,
} from "./util.identity-context-types";

export { buildStableIdentityContext } from "./util.identity-context-stable";

export { stripSkippedSlotGroups } from "./util.identity-context-slot-stripper";

export {
  buildComponentContext,
  resolveImageUrl,
} from "./util.identity-context-component";
