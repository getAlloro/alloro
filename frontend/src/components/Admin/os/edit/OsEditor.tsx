import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  buildOsEditorExtensions,
  getOsEditorMarkdown,
} from "./osEditorExtensions";
import { OsEditorToolbar } from "./OsEditorToolbar";

/**
 * WYSIWYG editor over markdown storage (P3 T4): tiptap-markdown parses the
 * stored markdown on load and serializes it back on every edit. The white
 * pane is a genuinely bounded object (D13), so it may sit on the warm paper
 * surface. Read-only when the edit lock is held by someone else.
 */

const OS_EDITOR_PROSE_CLASSES = [
  "prose prose-gray max-w-none",
  "font-display text-[15.5px] leading-relaxed text-gray-800",
  "prose-headings:font-display prose-headings:text-alloro-textDark",
  "prose-a:text-alloro-orange",
  "prose-code:font-mono prose-code:text-[0.85em]",
  "prose-pre:rounded-xl prose-pre:border prose-pre:border-line-soft prose-pre:bg-gray-50 prose-pre:font-mono",
  "prose-blockquote:border-l-accent-soft-line prose-blockquote:text-gray-600",
  "prose-th:border prose-th:border-line-medium prose-th:bg-gray-50 prose-th:px-3 prose-th:py-1.5 prose-th:text-left prose-th:font-sans prose-th:text-[12px]",
  "prose-td:border prose-td:border-line-soft prose-td:px-3 prose-td:py-1.5 prose-td:text-[14px]",
  "prose-table:w-full",
  "prose-hr:border-line-medium",
  "min-h-[55vh] focus:outline-none",
].join(" ");

export function OsEditor({
  content,
  onChange,
  isEditable,
}: {
  content: string;
  onChange: (markdown: string) => void;
  isEditable: boolean;
}) {
  const lastMarkdownRef = useRef(content);

  const editor = useEditor({
    extensions: buildOsEditorExtensions(),
    content,
    editable: isEditable,
    editorProps: {
      attributes: { class: OS_EDITOR_PROSE_CLASSES },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = getOsEditorMarkdown(current);
      lastMarkdownRef.current = markdown;
      onChange(markdown);
    },
  });

  // Seed from an external content change (draft load / conflict reload)
  // without echoing an update back through onChange (spurious autosave).
  useEffect(() => {
    if (!editor) return;
    if (content !== lastMarkdownRef.current) {
      lastMarkdownRef.current = content;
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(isEditable);
  }, [editor, isEditable]);

  if (!editor) {
    return (
      <div className="min-h-[60vh] rounded-xl border border-line-soft bg-alloro-surface motion-safe:animate-pulse" />
    );
  }

  return (
    <div className="rounded-xl border border-line-medium bg-alloro-surface">
      <OsEditorToolbar editor={editor} isEditable={isEditable} />
      <div className="px-4 py-5 sm:px-6">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
