import { useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Jakarta formatting bar for the OS editor (P3 T4): marks, headings, lists,
 * checklist, quote, code, divider, link (inline URL input — no prompt()),
 * table insert. Tools are data-driven; active state tracks the live
 * selection via useEditorState.
 */

type OsToolDefinition = {
  key: string;
  label: string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
};

const TOOL_GROUPS: OsToolDefinition[][] = [
  [
    {
      key: "bold",
      label: "Bold",
      icon: Bold,
      run: (editor) => editor.chain().focus().toggleBold().run(),
      isActive: (editor) => editor.isActive("bold"),
    },
    {
      key: "italic",
      label: "Italic",
      icon: Italic,
      run: (editor) => editor.chain().focus().toggleItalic().run(),
      isActive: (editor) => editor.isActive("italic"),
    },
    {
      key: "strike",
      label: "Strikethrough",
      icon: Strikethrough,
      run: (editor) => editor.chain().focus().toggleStrike().run(),
      isActive: (editor) => editor.isActive("strike"),
    },
  ],
  [
    {
      key: "h1",
      label: "Heading 1",
      icon: Heading1,
      run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: (editor) => editor.isActive("heading", { level: 1 }),
    },
    {
      key: "h2",
      label: "Heading 2",
      icon: Heading2,
      run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: (editor) => editor.isActive("heading", { level: 2 }),
    },
    {
      key: "h3",
      label: "Heading 3",
      icon: Heading3,
      run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: (editor) => editor.isActive("heading", { level: 3 }),
    },
  ],
  [
    {
      key: "bulletList",
      label: "Bullet list",
      icon: List,
      run: (editor) => editor.chain().focus().toggleBulletList().run(),
      isActive: (editor) => editor.isActive("bulletList"),
    },
    {
      key: "orderedList",
      label: "Numbered list",
      icon: ListOrdered,
      run: (editor) => editor.chain().focus().toggleOrderedList().run(),
      isActive: (editor) => editor.isActive("orderedList"),
    },
    {
      key: "taskList",
      label: "Checklist",
      icon: ListChecks,
      run: (editor) => editor.chain().focus().toggleTaskList().run(),
      isActive: (editor) => editor.isActive("taskList"),
    },
  ],
  [
    {
      key: "blockquote",
      label: "Quote",
      icon: Quote,
      run: (editor) => editor.chain().focus().toggleBlockquote().run(),
      isActive: (editor) => editor.isActive("blockquote"),
    },
    {
      key: "code",
      label: "Inline code",
      icon: Code,
      run: (editor) => editor.chain().focus().toggleCode().run(),
      isActive: (editor) => editor.isActive("code"),
    },
    {
      key: "codeBlock",
      label: "Code block",
      icon: SquareCode,
      run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
      isActive: (editor) => editor.isActive("codeBlock"),
    },
    {
      key: "horizontalRule",
      label: "Divider",
      icon: Minus,
      run: (editor) => editor.chain().focus().setHorizontalRule().run(),
    },
  ],
  [
    {
      key: "table",
      label: "Insert table",
      icon: TableIcon,
      run: (editor) =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  ],
];

const ALL_TOOLS = TOOL_GROUPS.flat();

function OsToolButton({
  label,
  icon: Icon,
  isActive,
  disabled,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  isActive?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-[7px] transition-colors duration-150 disabled:opacity-40 ${
        isActive
          ? "bg-accent-soft text-alloro-orange"
          : "text-gray-500 hover:bg-accent-soft/60 hover:text-gray-800"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}

function OsLinkInput({
  url,
  onUrlChange,
  onApply,
  onDismiss,
}: {
  url: string;
  onUrlChange: (url: string) => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-line-soft px-2 py-2">
      <input
        autoFocus
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onApply();
          if (event.key === "Escape") onDismiss();
        }}
        placeholder="https://…"
        aria-label="Link URL"
        className="w-full max-w-sm rounded-lg border border-line-medium bg-alloro-surface px-2.5 py-1.5 text-sm text-gray-800 outline-none transition-colors duration-150 focus:border-alloro-orange"
      />
      <button
        type="button"
        onClick={onApply}
        className="rounded-[9px] bg-alloro-orange px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-alloro-orange/90"
      >
        Apply
      </button>
    </div>
  );
}

export function OsEditorToolbar({
  editor,
  isEditable,
}: {
  editor: Editor;
  isEditable: boolean;
}) {
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const activeByKey = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      Object.fromEntries(
        ALL_TOOLS.filter((tool) => tool.isActive).map((tool) => [
          tool.key,
          Boolean(tool.isActive?.(current)),
        ]),
      ) as Record<string, boolean>,
  });

  const openLinkInput = () => {
    setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "");
    setIsLinkOpen((v) => !v);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url) chain.setLink({ href: url }).run();
    else chain.unsetLink().run();
    setIsLinkOpen(false);
    setLinkUrl("");
  };

  return (
    <div className="sticky top-0 z-20 rounded-t-xl border-b border-line-soft bg-alloro-surface">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        {TOOL_GROUPS.map((group, groupIndex) => (
          <span key={groupIndex} className="flex items-center gap-0.5">
            {groupIndex > 0 && (
              <span aria-hidden="true" className="mx-1 h-5 w-px bg-line-medium" />
            )}
            {group.map((tool) => (
              <OsToolButton
                key={tool.key}
                label={tool.label}
                icon={tool.icon}
                isActive={activeByKey?.[tool.key]}
                disabled={!isEditable}
                onClick={() => tool.run(editor)}
              />
            ))}
            {groupIndex === TOOL_GROUPS.length - 1 && (
              <OsToolButton
                label="Link"
                icon={Link2}
                isActive={editor.isActive("link")}
                disabled={!isEditable}
                onClick={openLinkInput}
              />
            )}
          </span>
        ))}
      </div>
      {isLinkOpen && (
        <OsLinkInput
          url={linkUrl}
          onUrlChange={setLinkUrl}
          onApply={applyLink}
          onDismiss={() => setIsLinkOpen(false)}
        />
      )}
    </div>
  );
}
