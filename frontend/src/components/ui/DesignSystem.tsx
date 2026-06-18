/* eslint-disable react-refresh/only-export-components */
/**
 * DesignSystem — shared UI primitives (re-export barrel).
 *
 * Implementation lives under `./DesignSystem/`, grouped by primitive family.
 * Every name remains importable from `".../ui/DesignSystem"` so consumers are
 * unaffected. Responsive-by-default: every primitive must scale cleanly from
 * 320px to 1920px without horizontal scroll. See
 * `frontend/docs/responsive-vocabulary.md` for the standardized class ladders.
 */
export * from "./DesignSystem/cards";
export * from "./DesignSystem/headers";
export * from "./DesignSystem/progress";
export * from "./DesignSystem/bars";
export * from "./DesignSystem/controls";
export * from "./DesignSystem/states";
