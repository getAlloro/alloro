import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { osAssetSrc } from "../shared/osFormat";
import { parseOsImageSource } from "../shared/osMarkdown";
import { OsResizableImageView } from "./OsResizableImageView";

function lastLeaf(
  node: ProseMirrorNode,
  pos: number,
): { leaf: ProseMirrorNode; pos: number } {
  let currentNode = node;
  let currentPos = pos;
  while (!currentNode.isLeaf && currentNode.childCount > 0) {
    let innerPos = currentPos + 1;
    for (let index = 0; index < currentNode.childCount - 1; index += 1) {
      innerPos += currentNode.child(index).nodeSize;
    }
    currentNode = currentNode.child(currentNode.childCount - 1);
    currentPos = innerPos;
  }
  return { leaf: currentNode, pos: currentPos };
}

/** Find the image at the cursor's backward deletion boundary. */
export function osImageBeforeCursor(
  state: EditorState,
  imageName: string,
): number | null {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return null;
  for (let depth = $from.depth - 1; depth >= 0; depth -= 1) {
    const nodeIndex = $from.index(depth);
    if (nodeIndex === 0) continue;
    const parent = $from.node(depth);
    let nodePos = $from.start(depth);
    for (let index = 0; index < nodeIndex - 1; index += 1) {
      nodePos += parent.child(index).nodeSize;
    }
    const result = lastLeaf(parent.child(nodeIndex - 1), nodePos);
    return result.leaf.type.name === imageName ? result.pos : null;
  }
  return null;
}

/** Auth-aware, resizable image node with safe backward deletion behavior. */
export const OsResizableImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const rawSrc = typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : "";
    const image = parseOsImageSource(rawSrc);
    return [
      "img",
      {
        ...HTMLAttributes,
        src: osAssetSrc(image.src) ?? image.src,
        ...(image.width === undefined ? {} : { width: image.width }),
      },
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(OsResizableImageView);
  },
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const pos = osImageBeforeCursor(this.editor.state, this.name);
        if (pos === null) return false;
        return this.editor.commands.setNodeSelection(pos);
      },
    };
  },
});
