import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
  type LucideIcon,
} from "lucide-react";
import type { Editor } from "@tiptap/react";

export type OsEditorToolDefinition = {
  key: string;
  label: string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
};

export const OS_EDITOR_TOOL_GROUPS: OsEditorToolDefinition[][] = [
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
];

export const OS_EDITOR_TOOLS = OS_EDITOR_TOOL_GROUPS.flat();
