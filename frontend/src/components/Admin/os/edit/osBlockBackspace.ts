import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

export function isEmptyCodeBlockAtStart(state: EditorState): boolean {
  const { $from, empty } = state.selection;
  return (
    empty &&
    $from.parentOffset === 0 &&
    $from.parent.type.name === "codeBlock" &&
    $from.parent.content.size === 0
  );
}

/** Clear an empty code block before ProseMirror can join/delete backward. */
export const OsBlockBackspace = Extension.create({
  name: "osBlockBackspace",
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        if (!isEmptyCodeBlockAtStart(this.editor.state)) return false;
        return this.editor.commands.clearNodes();
      },
    };
  },
});
