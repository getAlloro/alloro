import type { Editor, Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-list";
import { Markdown } from "tiptap-markdown";

/**
 * The OS editor's extension set (plans/07042026-alloro-os-admin-port P3 T4),
 * factored out so the markdown round-trip test builds the exact editor the
 * page ships. Storage is MARKDOWN: tiptap-markdown parses the stored string
 * on load and serializes back on every update, so versions, diffs, and the
 * P4 RAG pipeline stay markdown while the author sees rich text.
 */
export function buildOsEditorExtensions(): Extensions {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      },
    }),
    Image.configure({ inline: false }),
    Table.configure({ resizable: false }),
    TableRow,
    // GFM table cells are inline-only — restrict cells to paragraphs so the
    // editor can't accept block formatting the markdown store can't keep.
    TableHeader.extend({ content: "paragraph+" }),
    TableCell.extend({ content: "paragraph+" }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown.configure({ html: false, linkify: true, transformPastedText: true }),
  ];
}

/** Serialize the editor's document back to markdown (tiptap-markdown storage). */
export function getOsEditorMarkdown(editor: Editor): string {
  const storage = editor.storage as unknown as {
    markdown?: { getMarkdown: () => string };
  };
  return storage.markdown?.getMarkdown() ?? "";
}
