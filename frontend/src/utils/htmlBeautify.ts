import type { Section } from "../api/templates";

let prettierModule: typeof import("prettier/standalone") | null = null;
let htmlPlugin: import("prettier").Plugin | null = null;

async function loadPrettier() {
  if (!prettierModule) {
    const [prettier, plugin] = await Promise.all([
      import("prettier/standalone"),
      import("prettier/plugins/html"),
    ]);
    prettierModule = prettier;
    htmlPlugin = plugin;
  }
  return { prettier: prettierModule, plugin: htmlPlugin };
}

export async function beautifyHtml(html: string): Promise<string> {
  if (!html.trim()) return html;

  const { prettier, plugin } = await loadPrettier();
  const formatted = await prettier.format(html, {
    parser: "html",
    plugins: plugin ? [plugin] : [],
    printWidth: 120,
    tabWidth: 2,
    useTabs: false,
    htmlWhitespaceSensitivity: "ignore",
  });

  // prettier adds a trailing newline — trim it for section content
  return formatted.trimEnd();
}

export async function beautifySections(sections: Section[]): Promise<Section[]> {
  const results = await Promise.all(
    sections.map(async (s) => ({
      ...s,
      content: await beautifyHtml(s.content),
    }))
  );
  return results;
}
