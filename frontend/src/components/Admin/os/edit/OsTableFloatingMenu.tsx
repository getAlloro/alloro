import type { Editor } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";
import {
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Columns3,
  Rows3,
  Settings2,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { RefObject } from "react";
import { useOsEditorPopover } from "./useOsEditorPopover";

export type OsTableFloatingMenuProps = {
  editor: Editor;
  containerRef: RefObject<HTMLDivElement | null>;
};

type OsTableAction = {
  label: string;
  icon: LucideIcon;
  isDanger?: boolean;
  run: (editor: Editor) => boolean;
};

const TABLE_MENU_VERTICAL_OFFSET = 14;
const TABLE_MENU_TRANSITION_SECONDS = 0.14;
const TABLE_ACTIONS: OsTableAction[] = [
  {
    label: "Add row",
    icon: BetweenHorizontalStart,
    run: (editor) => editor.chain().focus().addRowAfter().run(),
  },
  {
    label: "Add column",
    icon: BetweenVerticalStart,
    run: (editor) => editor.chain().focus().addColumnAfter().run(),
  },
  {
    label: "Delete row",
    icon: Rows3,
    run: (editor) => editor.chain().focus().deleteRow().run(),
  },
  {
    label: "Delete column",
    icon: Columns3,
    run: (editor) => editor.chain().focus().deleteColumn().run(),
  },
  {
    label: "Delete table",
    icon: Trash2,
    isDanger: true,
    run: (editor) => editor.chain().focus().deleteTable().run(),
  },
];

function tableActionButton(
  action: OsTableAction,
  editor: Editor,
  closeMenu: () => void,
) {
  const Icon = action.icon;
  return (
    <button
      key={action.label}
      type="button"
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        action.run(editor);
        closeMenu();
      }}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/30 ${
        action.isDanger
          ? "text-red-600 hover:bg-danger-soft"
          : "text-gray-700 hover:bg-accent-soft hover:text-gray-900"
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {action.label}
    </button>
  );
}

/** Floating table actions without a node view, preserving full-width tables. */
export function OsTableFloatingMenu({
  editor,
  containerRef,
}: OsTableFloatingMenuProps) {
  const shouldReduceMotion = useReducedMotion();
  const { isOpen, setIsOpen, position, rootRef } = useOsEditorPopover({
    editor,
    containerRef,
  });

  if (!position) return null;

  const actionButtons = TABLE_ACTIONS.map((action) =>
    tableActionButton(action, editor, () => setIsOpen(false)),
  );

  return (
    <div
      ref={rootRef}
      className="absolute z-20"
      style={{
        top: position.top - TABLE_MENU_VERTICAL_OFFSET,
        right: position.right,
      }}
    >
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setIsOpen((isCurrentlyOpen) => !isCurrentlyOpen)}
        aria-label="Table options"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Table options"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-alloro-surface shadow-premium transition-all duration-150 hover:scale-[1.02] hover:border-alloro-orange/40 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange/30 ${
          isOpen
            ? "border-alloro-orange/40 text-alloro-orange"
            : "border-line-medium text-gray-500 hover:text-gray-800"
        }`}
      >
        <Settings2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="menu"
            aria-label="Table actions"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{
              duration: shouldReduceMotion ? 0 : TABLE_MENU_TRANSITION_SECONDS,
              ease: "easeOut",
            }}
            className="absolute right-0 top-full z-30 mt-1.5 w-44 origin-top-right overflow-hidden rounded-xl border border-line-soft bg-alloro-surface p-1 shadow-premium"
          >
            {actionButtons}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
