import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import {
  buildOsEditorExtensions,
  getOsEditorMarkdown,
} from "./osEditorExtensions";

/**
 * Markdown round-trip for the OS editor config (P3 T4 verify): a
 * representative document (headings, table, task list, marks, code block)
 * parsed by tiptap-markdown and serialized back must keep every construct,
 * and one parse→serialize pass must be a fixed point (stable storage — no
 * churn between autosaves).
 */

const REPRESENTATIVE_MARKDOWN = `# Playbook

Some **bold** and *italic* text with \`inline code\`.

> A quoted line.

## Checklist

- [ ] open item
- [x] done item

## Table

| Col A | Col B |
| --- | --- |
| a1 | b1 |
| a2 | b2 |

\`\`\`
const x = 1;
\`\`\`
`;

function parseAndSerialize(markdown: string): string {
  const editor = new Editor({
    extensions: buildOsEditorExtensions(),
    content: markdown,
  });
  try {
    return getOsEditorMarkdown(editor);
  } finally {
    editor.destroy();
  }
}

describe("OS editor markdown round-trip", () => {
  it("keeps headings, marks, quote, checklist, table, and code block", () => {
    const output = parseAndSerialize(REPRESENTATIVE_MARKDOWN);

    expect(output).toContain("# Playbook");
    expect(output).toContain("## Checklist");
    expect(output).toContain("**bold**");
    expect(output).toMatch(/[*_]italic[*_]/);
    expect(output).toContain("`inline code`");
    expect(output).toContain("> A quoted line.");
    expect(output).toMatch(/- \[ \] open item/);
    expect(output).toMatch(/- \[x\] done item/);
    expect(output).toContain("| Col A | Col B |");
    expect(output).toContain("| a1 | b1 |");
    expect(output).toContain("| a2 | b2 |");
    expect(output).toContain("```");
    expect(output).toContain("const x = 1;");
  });

  it("is a fixed point: re-parsing its own output serializes identically", () => {
    const once = parseAndSerialize(REPRESENTATIVE_MARKDOWN);
    const twice = parseAndSerialize(once);
    expect(twice).toBe(once);
  });
});
