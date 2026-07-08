/**
 * Ambient types for @joplin/turndown-plugin-gfm (P6 imports). The package ships
 * no bundled declarations; @types/turndown covers TurndownService but not this
 * plugin. We only consume the `gfm` aggregate plugin (tables + strikethrough +
 * task lists), so declare that surface as a Turndown.Plugin.
 */
declare module "@joplin/turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
  export const highlightedCodeBlock: TurndownService.Plugin;
}
