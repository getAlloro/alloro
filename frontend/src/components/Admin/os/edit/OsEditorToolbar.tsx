import { useRef, useState } from "react";
import { Image as ImageIcon, Link2, Table as TableIcon } from "lucide-react";
import { useEditorState, type Editor } from "@tiptap/react";
import { OsEditorLinkInput } from "./OsEditorLinkInput";
import { OsEditorToolButton } from "./OsEditorToolButton";
import {
  OS_EDITOR_TOOL_GROUPS,
  OS_EDITOR_TOOLS,
} from "./osEditorToolbarTools";

export type OsEditorToolbarProps = {
  editor: Editor;
  isEditable: boolean;
  onInsertImage: (files: File[]) => void;
};

function OsToolbarSeparator() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-line-medium" />;
}

export function OsEditorToolbar({
  editor,
  isEditable,
  onInsertImage,
}: OsEditorToolbarProps) {
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeByKey = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      ...Object.fromEntries(
        OS_EDITOR_TOOLS.filter((tool) => tool.isActive).map((tool) => [
          tool.key,
          Boolean(tool.isActive?.(current)),
        ]),
      ),
      link: current.isActive("link"),
    }) as Record<string, boolean>,
  });

  const handleOpenLink = () => {
    setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "");
    setIsLinkOpen((value) => !value);
  };

  const handleApplyLink = () => {
    const url = linkUrl.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url) chain.setLink({ href: url }).run();
    else chain.unsetLink().run();
    setIsLinkOpen(false);
    setLinkUrl("");
  };

  const handleImageSelection = (files: FileList | null) => {
    const images = Array.from(files ?? []);
    if (images.length > 0) onInsertImage(images);
  };

  return (
    <div
      role="toolbar"
      aria-label="Document formatting"
      className="sticky top-[104px] z-30 rounded-t-xl border-b border-line-soft bg-alloro-surface/95 backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        {OS_EDITOR_TOOL_GROUPS.map((group, groupIndex) => (
          <span key={group[0].key} className="flex items-center gap-0.5">
            {groupIndex > 0 && <OsToolbarSeparator />}
            {group.map((tool) => (
              <OsEditorToolButton
                key={tool.key}
                label={tool.label}
                icon={tool.icon}
                isActive={activeByKey?.[tool.key]}
                disabled={!isEditable}
                onClick={() => tool.run(editor)}
              />
            ))}
          </span>
        ))}
        <span className="flex items-center gap-0.5">
          <OsToolbarSeparator />
          <OsEditorToolButton
            label="Link"
            icon={Link2}
            isActive={activeByKey?.link}
            disabled={!isEditable}
            onClick={handleOpenLink}
          />
          <OsEditorToolButton
            label="Insert table"
            icon={TableIcon}
            disabled={!isEditable}
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
          />
          <OsEditorToolButton
            label="Insert image"
            icon={ImageIcon}
            disabled={!isEditable}
            onClick={() => fileInputRef.current?.click()}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              handleImageSelection(event.target.files);
              event.target.value = "";
            }}
          />
        </span>
      </div>
      {isLinkOpen && (
        <OsEditorLinkInput
          url={linkUrl}
          onUrlChange={setLinkUrl}
          onApply={handleApplyLink}
          onDismiss={() => setIsLinkOpen(false)}
        />
      )}
    </div>
  );
}
