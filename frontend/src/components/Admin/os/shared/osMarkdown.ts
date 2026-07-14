const OS_IMAGE_WIDTH_FRAGMENT = /#w=(\d+)$/;

export type OsImageSource = {
  src: string;
  width?: number;
};

/** Split the editor-only width fragment from the URL used by the browser. */
export function parseOsImageSource(src: string): OsImageSource {
  const match = OS_IMAGE_WIDTH_FRAGMENT.exec(src);
  if (!match) return { src };
  return {
    src: src.slice(0, -match[0].length),
    width: Number(match[1]),
  };
}

/** Keep block images separate from the block serialized immediately after. */
export function normalizeOsMarkdown(markdown: string): string {
  return markdown.replace(/^(\s*!\[[^\]]*\]\([^)]*\))(?=[^\n])/gm, "$1\n\n");
}
