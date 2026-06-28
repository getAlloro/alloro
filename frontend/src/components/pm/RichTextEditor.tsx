import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import DOMPurify from "dompurify";
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Code, Link as LinkIcon, Heading2 } from "lucide-react";
import { useEffect, useRef } from "react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  readOnly?: boolean;
}

function ToolbarButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="rounded p-1 transition-colors duration-100"
      style={{
        color: active ? "#D66853" : "var(--color-pm-text-muted)",
        backgroundColor: active ? "var(--color-pm-accent-subtle2)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, placeholder = "Write something...", minHeight = 120, readOnly = false }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder }),
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: value || "",
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "");
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null;

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--color-pm-border)", backgroundColor: "var(--color-pm-bg-primary)" }}>
      {!readOnly && (
        <div className="flex items-center gap-0.5 px-2 py-1.5" style={{ borderBottom: "1px solid var(--color-pm-border-subtle)" }}>
          <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
          <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--color-pm-border-subtle)" }} />
          <ToolbarButton active={editor.isActive("heading")} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
            <Code className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive("link")} onClick={() => {
            const url = window.prompt("URL:");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}>
            <LinkIcon className="h-3.5 w-3.5" strokeWidth={2} />
          </ToolbarButton>
        </div>
      )}

      <div className="pm-tiptap-editor" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .pm-tiptap-editor .tiptap {
          padding: 12px;
          outline: none;
          color: var(--color-pm-text-primary);
          font-size: 13px;
          line-height: 1.6;
          min-height: ${minHeight}px;
        }
        .pm-tiptap-editor .tiptap p { margin: 0 0 6px; }
        .pm-tiptap-editor .tiptap h2 { font-size: 16px; font-weight: 600; margin: 8px 0 4px; }
        .pm-tiptap-editor .tiptap h3 { font-size: 14px; font-weight: 600; margin: 6px 0 4px; }
        .pm-tiptap-editor .tiptap ul, .pm-tiptap-editor .tiptap ol { padding-left: 20px; margin: 4px 0; }
        .pm-tiptap-editor .tiptap li { margin: 2px 0; }
        .pm-tiptap-editor .tiptap code { background: var(--color-pm-bg-hover); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
        .pm-tiptap-editor .tiptap pre { background: var(--color-pm-bg-hover); padding: 8px 12px; border-radius: 6px; margin: 6px 0; }
        .pm-tiptap-editor .tiptap pre code { background: none; padding: 0; }
        .pm-tiptap-editor .tiptap a { color: #D66853; text-decoration: underline; }
        .pm-tiptap-editor .tiptap .is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--color-pm-text-muted);
          pointer-events: none;
          height: 0;
        }
      `}</style>
    </div>
  );
}

export function RichTextPreview({ html, className = "" }: { html: string | null; className?: string }) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const clean = html
    ? DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["p", "strong", "em", "u", "h2", "h3", "ul", "ol", "li", "a", "code", "pre", "br"],
        ALLOWED_ATTR: ["href", "target", "rel"],
      })
    : "";

  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.innerHTML = clean;
    }
  }, [clean]);

  if (!html) return null;

  return (
    <div
      ref={previewRef}
      className={`pm-richtext-preview ${className}`}
    />
  );
}
